use crate::setup::SetupManager;
use crate::vm::{lima::LimaManager, VmConfig, VmManager, VmStatus};
use crate::ws_proxy::{self, WsProxy};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, State, Window};
use tokio::sync::Mutex;

pub struct AppState {
    pub vm_manager: Arc<Mutex<LimaManager>>,
    pub setup_manager: Arc<Mutex<SetupManager>>,
    pub config: Arc<Mutex<VmConfig>>,
    pub ws_proxy: Arc<Mutex<WsProxy>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vm_manager: Arc::new(Mutex::new(LimaManager::new())),
            setup_manager: Arc::new(Mutex::new(SetupManager::new())),
            config: Arc::new(Mutex::new(VmConfig::default())),
            ws_proxy: Arc::new(Mutex::new(WsProxy::new())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupConfig {
    pub ram_mb: u32,
    pub cpus: u32,
    pub anthropic_api_key: Option<String>,
    pub openai_api_key: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub vm_status: VmStatus,
    pub gateway_url: Option<String>,
    pub ready: bool,
}

#[derive(Debug, Serialize)]
pub struct SystemInfo {
    pub total_ram_mb: u64,
    pub cpu_count: usize,
    pub setup_complete: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SetupProgressEvent {
    pub step: String,
    pub progress: u8,
    pub message: String,
}

// ============ Tauri Commands ============

#[tauri::command]
pub fn get_system_info(_state: State<'_, AppState>) -> Result<SystemInfo, String> {
    let total_ram_mb = 16384;
    let cpu_count = std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(4);

    // Check if Lima config exists (quick file check, no subprocess)
    let config_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".clawbox");
    let lima_yaml_exists = config_dir.join("lima.yaml").exists();

    let setup_complete = lima_yaml_exists;

    Ok(SystemInfo {
        total_ram_mb,
        cpu_count,
        setup_complete,
    })
}

#[tauri::command]
pub async fn get_vm_status(state: State<'_, AppState>) -> Result<StatusResponse, String> {
    let config_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".clawbox");

    // If no lima.yaml, VM is not created
    if !config_dir.join("lima.yaml").exists() {
        return Ok(StatusResponse {
            vm_status: VmStatus::NotCreated,
            gateway_url: None,
            ready: false,
        });
    }

    // Get actual VM status from Lima
    let vm = state.vm_manager.lock().await;
    let vm_status = vm.status().unwrap_or(VmStatus::NotCreated);

    let gateway_url = if vm_status == VmStatus::Running {
        vm.get_gateway_url().ok()
    } else {
        None
    };

    Ok(StatusResponse {
        vm_status,
        gateway_url,
        ready: true,
    })
}

#[tauri::command]
pub async fn run_full_setup(
    config: SetupConfig,
    window: Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Helper to emit progress
    let emit_progress = |step: &str, progress: u8, message: &str| {
        let _ = window.emit(
            "setup-progress",
            SetupProgressEvent {
                step: step.to_string(),
                progress,
                message: message.to_string(),
            },
        );
    };

    // Step 1: Check/Install Lima
    emit_progress("lima", 0, "Checking Lima installation...");

    {
        let setup = state.setup_manager.lock().await;
        if !setup.is_lima_installed() {
            emit_progress("lima", 10, "Downloading Lima...");
            drop(setup); // Release lock before async operation

            let setup = state.setup_manager.lock().await;
            setup.download_lima().await.map_err(|e| {
                emit_progress("error", 0, &e);
                e
            })?;
            emit_progress("lima", 30, "Lima installed successfully");
        } else {
            emit_progress("lima", 30, "Lima already installed");
        }
    }

    // Step 2: Create VM
    emit_progress("vm", 35, "Creating Linux virtual machine...");

    {
        let vm = state.vm_manager.lock().await;
        let mut app_config = state.config.lock().await;

        app_config.ram_mb = config.ram_mb;
        app_config.cpus = config.cpus;

        emit_progress("vm", 40, "Setting up Ubuntu environment...");
        vm.create(&app_config).map_err(|e| {
            emit_progress("error", 0, &e.to_string());
            e.to_string()
        })?;
    }

    emit_progress("vm", 60, "Starting virtual machine...");

    // Step 3: Start VM
    {
        let vm = state.vm_manager.lock().await;
        vm.start().map_err(|e| {
            emit_progress("error", 0, &e.to_string());
            e.to_string()
        })?;
    }

    emit_progress("openclaw", 70, "Installing OpenClaw...");

    // Step 4: Configure API keys
    emit_progress("config", 85, "Configuring API keys...");

    {
        let vm = state.vm_manager.lock().await;

        if let Some(key) = &config.anthropic_api_key {
            let cmd = format!(
                "sudo mkdir -p /home/openclaw/.openclaw && echo 'ANTHROPIC_API_KEY={}' | sudo tee -a /home/openclaw/.openclaw/.env > /dev/null",
                key
            );
            let _ = vm.exec(&cmd);
        }

        if let Some(key) = &config.openai_api_key {
            let cmd = format!(
                "echo 'OPENAI_API_KEY={}' | sudo tee -a /home/openclaw/.openclaw/.env > /dev/null",
                key
            );
            let _ = vm.exec(&cmd);
        }

        // Fix ownership
        let _ = vm.exec("sudo chown -R openclaw:openclaw /home/openclaw/.openclaw");
    }

    emit_progress("gateway", 90, "Starting OpenClaw gateway...");

    // Step 5: Restart OpenClaw service
    {
        let vm = state.vm_manager.lock().await;
        let _ = vm.exec("sudo systemctl restart openclaw");
    }

    // Give it a moment to start
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

    emit_progress("complete", 100, "Setup complete!");

    Ok(())
}

#[tauri::command]
pub async fn start_vm(state: State<'_, AppState>) -> Result<(), String> {
    let vm = state.vm_manager.lock().await;
    vm.start().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_vm(state: State<'_, AppState>) -> Result<(), String> {
    let vm = state.vm_manager.lock().await;
    vm.stop().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restart_vm(state: State<'_, AppState>) -> Result<(), String> {
    let vm = state.vm_manager.lock().await;
    vm.stop().map_err(|e| e.to_string())?;
    vm.start().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_vm(state: State<'_, AppState>) -> Result<(), String> {
    let vm = state.vm_manager.lock().await;
    vm.delete().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_gateway_url(state: State<'_, AppState>) -> Result<String, String> {
    let vm = state.vm_manager.lock().await;
    vm.get_gateway_url().map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub persona: String,
    pub name: String,
    pub preferences: std::collections::HashMap<String, String>,
    pub capabilities: Vec<String>,
    pub telegram_bot_token: Option<String>,
    pub telegram_bot_username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigureAgentResult {
    pub success: bool,
    pub telegram_chat_id: Option<String>,
    pub message: String,
}

/// Configure the OpenClaw agent with personality and Telegram
#[tauri::command]
pub async fn configure_agent(
    config: AgentConfig,
    state: State<'_, AppState>,
) -> Result<ConfigureAgentResult, String> {
    let vm = state.vm_manager.lock().await;

    // Step 1: Generate SOUL.md based on persona and preferences
    let soul_content = generate_soul_md(&config);

    // Use sudo to write to openclaw's directory
    let cmd = format!(
        "sudo mkdir -p /home/openclaw/.openclaw/workspace && sudo tee /home/openclaw/.openclaw/workspace/SOUL.md > /dev/null << 'EOFSOULMID'\n{}\nEOFSOULMID",
        soul_content
    );
    vm.exec(&cmd).map_err(|e| e.to_string())?;

    // Step 2: Generate IDENTITY.md
    let identity_content = generate_identity_md(&config);
    let cmd = format!(
        "sudo tee /home/openclaw/.openclaw/workspace/IDENTITY.md > /dev/null << 'EOFIDENTITYMID'\n{}\nEOFIDENTITYMID",
        identity_content
    );
    vm.exec(&cmd).map_err(|e| e.to_string())?;

    // Step 3: Configure Telegram if token provided
    if let Some(token) = &config.telegram_bot_token {
        // Write token to config
        let cmd = format!(
            "sudo mkdir -p /home/openclaw/.openclaw && echo '{}' | sudo tee /home/openclaw/.openclaw/telegram-token > /dev/null",
            token
        );
        vm.exec(&cmd).map_err(|e| e.to_string())?;

        // Update OpenClaw config with Telegram settings
        let telegram_config = format!(
            r#"
channels:
  telegram:
    botToken: "{}"
    dmPolicy: "open"
"#,
            token
        );
        let cmd = format!(
            "sudo tee -a /home/openclaw/.openclaw/config.yaml > /dev/null << 'EOFCFG'\n{}\nEOFCFG",
            telegram_config
        );
        vm.exec(&cmd).map_err(|e| e.to_string())?;
    }

    // Fix ownership
    let _ = vm.exec("sudo chown -R openclaw:openclaw /home/openclaw/.openclaw");

    // Step 4: Restart OpenClaw to pick up new config
    let _ = vm.exec("sudo systemctl restart openclaw");

    // Wait for service to start
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    Ok(ConfigureAgentResult {
        success: true,
        telegram_chat_id: None, // User needs to /start the bot first
        message: "Agent configured successfully! Start a chat with your Telegram bot to begin.".to_string(),
    })
}

/// Generate SOUL.md content based on agent configuration
fn generate_soul_md(config: &AgentConfig) -> String {
    let tone = config.preferences.get("tone").map(|s| s.as_str()).unwrap_or("friendly");
    let focus = config.preferences.get("focus").map(|s| s.as_str()).unwrap_or("");

    let tone_description = match tone {
        "friendly" => "Be warm, approachable, and conversational. Use casual language when appropriate.",
        "professional" => "Maintain a professional, polished tone. Be thorough and precise.",
        "witty" => "Be clever and playful. Add humor when appropriate, but stay helpful.",
        "concise" => "Be brief and to the point. Avoid unnecessary words.",
        _ => "Be helpful and adaptive to the user's communication style.",
    };

    let persona_description = match config.persona.as_str() {
        "assistant" => "You are a personal assistant focused on helping with everyday tasks, scheduling, and general questions.",
        "coder" => "You are an expert pair programmer. You help debug code, review pull requests, and discuss architecture.",
        "researcher" => "You are a research analyst. You synthesize information, fact-check claims, and provide thorough analysis.",
        "creative" => "You are a creative partner. You help brainstorm ideas, write content, and provide creative feedback.",
        "tutor" => "You are a patient tutor. You explain concepts clearly, provide examples, and adapt to the learner's pace.",
        "custom" => config.preferences.get("role").map(|s| s.as_str()).unwrap_or("You are a helpful AI assistant."),
        _ => "You are a helpful AI assistant.",
    };

    let personality = config.preferences.get("personality").map(|s| s.as_str()).unwrap_or("");

    format!(
        r#"# SOUL.md - Who You Are

## Identity
You are **{name}**, a personal AI assistant.

## Core Purpose
{persona}

## Communication Style
{tone}

## Focus Areas
{focus}

## Personality
{personality}

## Boundaries
- Always be helpful and honest
- Respect user privacy
- Ask clarifying questions when needed
- When in doubt, ask before taking action

## First Interaction
When you first meet the user, introduce yourself warmly. Tell them your name is {name} and briefly explain how you can help based on their interests. Ask them what they'd like to accomplish first. Make them feel welcome and excited to work with you.

Example first message:
"Hey! 👋 I'm {name}, your new AI {persona_short}. I'm here to help you with {focus_summary}. What would you like to tackle first?"
"#,
        name = config.name,
        persona = persona_description,
        tone = tone_description,
        focus = if focus.is_empty() { "General assistance and support" } else { focus },
        personality = if personality.is_empty() { "Adaptive and attentive to user needs" } else { personality },
        persona_short = match config.persona.as_str() {
            "assistant" => "assistant",
            "coder" => "coding companion",
            "researcher" => "research analyst",
            "creative" => "creative partner",
            "tutor" => "tutor",
            _ => "assistant",
        },
        focus_summary = if focus.is_empty() { "whatever you need" } else { focus },
    )
}

/// Generate IDENTITY.md content
fn generate_identity_md(config: &AgentConfig) -> String {
    let emoji = match config.persona.as_str() {
        "assistant" => "🦞",
        "coder" => "👨‍💻",
        "researcher" => "🔬",
        "creative" => "🎨",
        "tutor" => "📚",
        "custom" => "✨",
        _ => "🦞",
    };

    format!(
        r#"- **Name**: {name}
- **Emoji**: {emoji}
- **Creature**: "{persona} assistant"
- **Vibe**: "helpful, attentive, {tone}"
- **Theme**: "modern and clean"
"#,
        name = config.name,
        emoji = emoji,
        persona = config.persona,
        tone = config.preferences.get("tone").map(|s| s.as_str()).unwrap_or("friendly"),
    )
}

/// Send the first proactive message to the user on Telegram
#[tauri::command]
pub async fn send_first_message(
    telegram_chat_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let vm = state.vm_manager.lock().await;

    // Use OpenClaw's agent API to send a proactive message
    // The agent will use SOUL.md to craft an appropriate first message
    let cmd = format!(
        r#"curl -s -X POST http://localhost:18789/agent \
            -H "Content-Type: application/json" \
            -d '{{"message": "This is your first interaction with the user. Introduce yourself according to your SOUL.md and start a conversation to learn more about their needs.", "channel": "telegram", "to": "{}", "deliver": true, "agentId": "main"}}'"#,
        telegram_chat_id
    );

    vm.exec(&cmd).map_err(|e| e.to_string())?;

    Ok(())
}

/// Get chat history from the session file
#[tauri::command]
pub async fn get_chat_history(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let vm = state.vm_manager.lock().await;

    // Read the session JSONL files - need to find them first since glob doesn't work with sudo
    let cmd = r#"for f in $(sudo find /home/openclaw/.openclaw/agents/main/sessions -name '*.jsonl' 2>/dev/null); do sudo cat "$f"; done"#;

    match vm.exec(cmd) {
        Ok(output) => {
            let mut messages = Vec::new();
            for line in output.lines() {
                if let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) {
                    // The session file has entries with type="message" containing the actual message
                    if entry.get("type").and_then(|t| t.as_str()) == Some("message") {
                        if let Some(msg) = entry.get("message") {
                            if let Some(role) = msg.get("role").and_then(|r| r.as_str()) {
                                if role == "user" || role == "assistant" {
                                    // Extract text content from the content array
                                    let content = if let Some(content_arr) = msg.get("content").and_then(|c| c.as_array()) {
                                        content_arr.iter()
                                            .filter_map(|c| {
                                                // Skip thinking blocks, only get text
                                                if c.get("type").and_then(|t| t.as_str()) == Some("text") {
                                                    c.get("text").and_then(|t| t.as_str())
                                                } else {
                                                    None
                                                }
                                            })
                                            .collect::<Vec<_>>()
                                            .join("")
                                    } else {
                                        String::new()
                                    };

                                    // Build a simplified message object
                                    let simplified = serde_json::json!({
                                        "id": entry.get("id").and_then(|i| i.as_str()).unwrap_or(""),
                                        "role": role,
                                        "content": content,
                                        "timestamp": entry.get("timestamp").and_then(|t| t.as_str()).unwrap_or(""),
                                    });
                                    messages.push(simplified);
                                }
                            }
                        }
                    }
                }
            }
            Ok(messages)
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Get the gateway auth token for WebSocket connections
#[tauri::command]
pub async fn get_gateway_token(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let vm = state.vm_manager.lock().await;

    // Read the token from OpenClaw config using jq for reliable JSON parsing
    let cmd = r#"sudo cat /home/openclaw/.openclaw/openclaw.json 2>/dev/null | jq -r '.gateway.auth.token // empty'"#;

    match vm.exec(cmd) {
        Ok(output) => {
            let token = output.trim().to_string();
            if token.is_empty() {
                Ok(None)
            } else {
                Ok(Some(token))
            }
        }
        Err(_) => Ok(None),
    }
}

/// Send a chat message via the OpenClaw CLI
#[tauri::command]
pub async fn send_chat_message(
    message: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let vm = state.vm_manager.lock().await;

    // Escape the message for shell - escape single quotes and backslashes
    let escaped_message = message
        .replace("\\", "\\\\")
        .replace("'", "'\\''")
        .replace("\"", "\\\"");

    // Use openclaw agent command to send a message
    // --agent main targets the main agent's session
    let cmd = format!(
        r#"sudo -u openclaw bash -c 'cd /home/openclaw && OPENCLAW_STATE_DIR=/home/openclaw/.openclaw openclaw agent --agent main --message "{}" 2>&1'"#,
        escaped_message
    );

    match vm.exec(&cmd) {
        Ok(output) => Ok(output),
        Err(e) => Err(e.to_string()),
    }
}

/// Connect to the gateway WebSocket (proxied through Rust backend)
#[tauri::command]
pub async fn ws_connect(
    gateway_url: String,
    window: Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let proxy = state.ws_proxy.clone();

    // Check if already connected
    {
        let proxy_lock = proxy.lock().await;
        if proxy_lock.is_connected() {
            return Err("Already connected".to_string());
        }
    }

    // Spawn the connection task
    let proxy_clone = proxy.clone();
    tokio::spawn(async move {
        if let Err(e) = ws_proxy::connect_to_gateway(gateway_url, window, proxy_clone).await {
            eprintln!("[ws] Gateway connection error: {}", e);
        }
    });

    Ok(())
}

/// Send a message through the WebSocket proxy
#[tauri::command]
pub async fn ws_send(message: String, state: State<'_, AppState>) -> Result<(), String> {
    let proxy = state.ws_proxy.lock().await;
    proxy.send(message)
}

/// Disconnect from the gateway WebSocket
#[tauri::command]
pub async fn ws_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    let mut proxy = state.ws_proxy.lock().await;
    // The proxy will disconnect when sender is dropped
    *proxy = WsProxy::new();
    Ok(())
}

/// Channel configuration for adding messaging channels
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ChannelConfig {
    pub channel: String,
    pub bot_token: Option<String>,
    pub api_key: Option<String>,
    pub webhook_url: Option<String>,
    pub phone_number: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChannelResult {
    pub success: bool,
    pub message: String,
    pub instructions: Option<String>,
}

/// Add a new messaging channel
#[tauri::command]
pub async fn add_channel(
    config: ChannelConfig,
    state: State<'_, AppState>,
) -> Result<ChannelResult, String> {
    let vm = state.vm_manager.lock().await;

    // Use openclaw channels add CLI command
    let cmd = match config.channel.as_str() {
        "telegram" => {
            let token = config.bot_token.ok_or("Telegram requires a bot token")?;
            format!(
                "sudo -u openclaw openclaw channels add --channel telegram --token '{}'",
                token.replace("'", "'\\''")
            )
        }
        "discord" => {
            let token = config.bot_token.ok_or("Discord requires a bot token")?;
            format!(
                "sudo -u openclaw openclaw channels add --channel discord --token '{}'",
                token.replace("'", "'\\''")
            )
        }
        "slack" => {
            let token = config.bot_token.ok_or("Slack requires an app token")?;
            format!(
                "sudo -u openclaw openclaw channels add --channel slack --token '{}'",
                token.replace("'", "'\\''")
            )
        }
        "matrix" => {
            let token = config.bot_token.ok_or("Matrix requires an access token")?;
            format!(
                "sudo -u openclaw openclaw channels add --channel matrix --token '{}'",
                token.replace("'", "'\\''")
            )
        }
        "line" => {
            let token = config.bot_token.ok_or("LINE requires a channel access token")?;
            format!(
                "sudo -u openclaw openclaw channels add --channel line --token '{}'",
                token.replace("'", "'\\''")
            )
        }
        "whatsapp" | "signal" | "irc" | "nostr" | "tlon" | "googlechat" | "imessage" => {
            return Err(format!("{} channel setup requires interactive login. Please use the OpenClaw CLI directly.", config.channel));
        }
        _ => return Err(format!("Unsupported channel: {}", config.channel)),
    };

    // Run the openclaw channels add command
    let result = vm.exec(&cmd).map_err(|e| e.to_string())?;

    // Check if it succeeded
    if result.contains("error") || result.contains("Error") || result.contains("failed") {
        return Err(format!("Failed to add channel: {}", result));
    }

    // Set allowFrom to ["*"] so any user can message the bot (required when dmPolicy is "open")
    let allow_from_cmd = format!(
        "sudo -u openclaw openclaw config set 'channels.{}.allowFrom' '[\"*\"]'",
        config.channel
    );
    let _ = vm.exec(&allow_from_cmd);

    // Restart OpenClaw to pick up new config
    let _ = vm.exec("sudo systemctl restart openclaw");

    // Wait for service to start
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

    // Get channel-specific instructions
    let instructions = match config.channel.as_str() {
        "telegram" => Some("Open Telegram and search for your bot by username, then send /start to begin chatting!".to_string()),
        "discord" => Some("Add your bot to a Discord server and mention it to start chatting".to_string()),
        "slack" => Some("Install the app in your Slack workspace and mention it in a channel".to_string()),
        "matrix" => Some("Start a direct message with your Matrix bot to begin chatting".to_string()),
        "line" => Some("Add your LINE bot as a friend and send a message to start".to_string()),
        _ => None,
    };

    Ok(ChannelResult {
        success: true,
        message: format!("{} channel configured successfully!", config.channel),
        instructions,
    })
}

/// Result of uploading a file to the VM
#[derive(Debug, Serialize)]
pub struct UploadResult {
    pub path: String,
    pub name: String,
}

/// Sanitize filename to prevent path traversal and shell injection
fn sanitize_filename(name: &str) -> String {
    // Get just the filename part (in case of path)
    let filename = std::path::Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");

    // Replace any problematic characters
    filename
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Upload a file to the VM workspace
#[tauri::command]
pub async fn upload_file(
    name: String,
    content: String, // base64 encoded
    state: State<'_, AppState>,
) -> Result<UploadResult, String> {
    use base64::Engine;
    use std::io::Write;

    let vm = state.vm_manager.lock().await;

    // Create uploads directory in VM
    vm.exec("sudo -u openclaw mkdir -p /home/openclaw/.openclaw/workspace/uploads")
        .map_err(|e| e.to_string())?;

    // Sanitize the filename
    let safe_name = sanitize_filename(&name);

    // Generate unique filename
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let final_name = if safe_name.contains('.') {
        let parts: Vec<&str> = safe_name.rsplitn(2, '.').collect();
        if parts.len() == 2 {
            format!("{}_{}.{}", parts[1], timestamp, parts[0])
        } else {
            format!("{}_{}", safe_name, timestamp)
        }
    } else {
        format!("{}_{}", safe_name, timestamp)
    };

    // Decode base64 content
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&content)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Write to a temp file on the host
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("clawbox_upload_{}", timestamp));

    {
        let mut temp_file = std::fs::File::create(&temp_path)
            .map_err(|e| format!("Failed to create temp file: {}", e))?;
        temp_file.write_all(&decoded)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
    }

    // Use limactl copy to transfer the file to the VM
    // First copy to /tmp in VM, then move to final location with correct ownership
    let vm_temp_path = format!("/tmp/upload_{}", timestamp);
    let vm_final_path = format!("/home/openclaw/.openclaw/workspace/uploads/{}", final_name);

    // Get limactl path from the VM manager
    let config_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".clawbox");
    let limactl = config_dir.join("lima").join("bin").join("limactl");
    let limactl_bin = if limactl.exists() {
        limactl
    } else {
        std::path::PathBuf::from("limactl")
    };

    // Copy file to VM using limactl copy
    let copy_result = std::process::Command::new(&limactl_bin)
        .args([
            "copy",
            &temp_path.to_string_lossy(),
            &format!("clawbox:{}", vm_temp_path),
        ])
        .output()
        .map_err(|e| format!("Failed to copy file to VM: {}", e))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_path);

    if !copy_result.status.success() {
        let stderr = String::from_utf8_lossy(&copy_result.stderr);
        return Err(format!("Failed to copy file to VM: {}", stderr));
    }

    // Move file to final location with correct ownership
    let move_cmd = format!(
        "sudo mv {} {} && sudo chown openclaw:openclaw {}",
        vm_temp_path, vm_final_path, vm_final_path
    );
    vm.exec(&move_cmd).map_err(|e| e.to_string())?;

    Ok(UploadResult {
        path: format!("/workspace/uploads/{}", final_name),
        name: final_name,
    })
}

/// Get list of configured channels
#[tauri::command]
pub async fn get_channels(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let vm = state.vm_manager.lock().await;

    // Use openclaw channels list to get configured channels
    let cmd = "sudo -u openclaw openclaw channels list --json 2>/dev/null || echo '[]'";

    match vm.exec(cmd) {
        Ok(output) => {
            // Parse JSON output to extract channel names
            // The output format is an array of channel objects with "channel" field
            let channels: Vec<String> = if output.trim().starts_with('[') {
                // Try to parse JSON
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&output) {
                    if let Some(arr) = parsed.as_array() {
                        arr.iter()
                            .filter_map(|item| {
                                item.get("channel")
                                    .and_then(|c| c.as_str())
                                    .map(|s| s.to_string())
                            })
                            .collect()
                    } else {
                        vec![]
                    }
                } else {
                    vec![]
                }
            } else {
                vec![]
            };
            Ok(channels)
        }
        Err(_) => Ok(vec![]),
    }
}
