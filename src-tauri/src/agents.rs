use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub persona: String,
    pub avatar: String,
    pub preferences: std::collections::HashMap<String, String>,
    pub capabilities: Vec<String>,
    pub channels: Vec<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentsState {
    pub agents: Vec<Agent>,
    pub active_agent_id: Option<String>,
}

impl Default for AgentsState {
    fn default() -> Self {
        Self {
            agents: Vec::new(),
            active_agent_id: None,
        }
    }
}

pub struct AgentsManager {
    config_path: PathBuf,
}

impl AgentsManager {
    pub fn new() -> Self {
        let config_path = dirs::home_dir()
            .unwrap_or_default()
            .join(".clawbox")
            .join("agents.json");
        Self { config_path }
    }

    fn ensure_config_dir(&self) -> Result<(), String> {
        if let Some(parent) = self.config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn load_state(&self) -> AgentsState {
        if self.config_path.exists() {
            match fs::read_to_string(&self.config_path) {
                Ok(content) => {
                    serde_json::from_str(&content).unwrap_or_default()
                }
                Err(_) => AgentsState::default(),
            }
        } else {
            AgentsState::default()
        }
    }

    pub fn save_state(&self, state: &AgentsState) -> Result<(), String> {
        self.ensure_config_dir()?;
        let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
        fs::write(&self.config_path, content).map_err(|e| e.to_string())
    }

    pub fn create_agent(&self, config: CreateAgentConfig) -> Result<Agent, String> {
        let mut state = self.load_state();

        let avatar = config.avatar.unwrap_or_else(|| config.persona.clone());
        let agent = Agent {
            id: Uuid::new_v4().to_string(),
            name: config.name,
            persona: config.persona,
            avatar,
            preferences: config.preferences,
            capabilities: config.capabilities,
            channels: Vec::new(),
            created_at: chrono::Utc::now().timestamp(),
        };

        // If this is the first agent, make it active
        if state.agents.is_empty() {
            state.active_agent_id = Some(agent.id.clone());
        }

        state.agents.push(agent.clone());
        self.save_state(&state)?;

        Ok(agent)
    }

    pub fn list_agents(&self) -> Vec<Agent> {
        self.load_state().agents
    }

    pub fn get_agent(&self, id: &str) -> Option<Agent> {
        self.load_state().agents.into_iter().find(|a| a.id == id)
    }

    pub fn get_active_agent(&self) -> Option<Agent> {
        let state = self.load_state();
        if let Some(active_id) = state.active_agent_id {
            state.agents.into_iter().find(|a| a.id == active_id)
        } else {
            state.agents.into_iter().next()
        }
    }

    pub fn get_active_agent_id(&self) -> Option<String> {
        self.load_state().active_agent_id
    }

    pub fn update_agent(&self, id: &str, config: UpdateAgentConfig) -> Result<Agent, String> {
        let mut state = self.load_state();

        let agent = state.agents.iter_mut().find(|a| a.id == id);
        match agent {
            Some(agent) => {
                if let Some(name) = config.name {
                    agent.name = name;
                }
                if let Some(persona) = config.persona {
                    agent.persona = persona;
                }
                if let Some(avatar) = config.avatar {
                    agent.avatar = avatar;
                }
                if let Some(preferences) = config.preferences {
                    agent.preferences = preferences;
                }
                if let Some(capabilities) = config.capabilities {
                    agent.capabilities = capabilities;
                }
                if let Some(channels) = config.channels {
                    agent.channels = channels;
                }

                let updated = agent.clone();
                self.save_state(&state)?;
                Ok(updated)
            }
            None => Err(format!("Agent not found: {}", id)),
        }
    }

    pub fn delete_agent(&self, id: &str) -> Result<(), String> {
        let mut state = self.load_state();

        let initial_len = state.agents.len();
        state.agents.retain(|a| a.id != id);

        if state.agents.len() == initial_len {
            return Err(format!("Agent not found: {}", id));
        }

        // If we deleted the active agent, switch to the first available
        if state.active_agent_id.as_deref() == Some(id) {
            state.active_agent_id = state.agents.first().map(|a| a.id.clone());
        }

        self.save_state(&state)
    }

    pub fn switch_agent(&self, id: &str) -> Result<Agent, String> {
        let mut state = self.load_state();

        // Verify agent exists
        let agent = state.agents.iter().find(|a| a.id == id).cloned();
        match agent {
            Some(agent) => {
                state.active_agent_id = Some(id.to_string());
                self.save_state(&state)?;
                Ok(agent)
            }
            None => Err(format!("Agent not found: {}", id)),
        }
    }

    /// Migrate from old single-agent config to multi-agent
    pub fn migrate_from_legacy(&self) -> Result<(), String> {
        let state = self.load_state();

        // If we already have agents, don't migrate
        if !state.agents.is_empty() {
            return Ok(());
        }

        // Check if there's a legacy agent config in localStorage
        // This will be handled on the frontend side
        // Here we just ensure the file exists
        self.ensure_config_dir()?;

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAgentConfig {
    pub name: String,
    pub persona: String,
    pub avatar: Option<String>,
    pub preferences: std::collections::HashMap<String, String>,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAgentConfig {
    pub name: Option<String>,
    pub persona: Option<String>,
    pub avatar: Option<String>,
    pub preferences: Option<std::collections::HashMap<String, String>>,
    pub capabilities: Option<Vec<String>>,
    pub channels: Option<Vec<String>>,
}

impl Default for AgentsManager {
    fn default() -> Self {
        Self::new()
    }
}
