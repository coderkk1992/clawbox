use super::{VmConfig, VmError, VmManager, VmResult, VmStatus};
use serde::Deserialize;
use std::path::PathBuf;
use std::process::Command;

const VM_NAME: &str = "clawbox";
const OPENCLAW_PORT: u16 = 18789;

pub struct LimaManager {
    config_dir: PathBuf,
}

#[derive(Debug, Deserialize)]
struct LimaInstance {
    name: String,
    status: String,
}

impl LimaManager {
    pub fn new() -> Self {
        let config_dir = dirs::home_dir()
            .unwrap_or_default()
            .join(".clawbox");
        Self { config_dir }
    }

    fn limactl_bin(&self) -> PathBuf {
        // Check bundled Lima first
        let bundled = self.config_dir.join("lima").join("bin").join("limactl");
        if bundled.exists() {
            bundled
        } else {
            PathBuf::from("limactl")
        }
    }

    fn lima_yaml_path(&self) -> PathBuf {
        self.config_dir.join("lima.yaml")
    }

    fn generate_lima_yaml(&self, config: &VmConfig) -> String {
        format!(
            r#"# ClawBox Lima configuration
# Auto-generated - do not edit manually

vmType: "vz"

vmOpts:
  vz:
    rosetta:
      enabled: true
      binfmt: true

images:
  - location: "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-arm64.img"
    arch: "aarch64"
  - location: "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img"
    arch: "x86_64"

cpus: {cpus}
memory: "{ram_mb}MiB"
disk: "{disk_gb}GiB"

mounts: []

portForwards:
  - guestPort: {port}
    hostPort: {port}

provision:
  - mode: system
    script: |
      #!/bin/bash
      set -eux

      # Install Node.js 24
      curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
      apt-get install -y nodejs

      # Install pnpm and OpenClaw (pinned to working version)
      npm install -g pnpm openclaw@2026.3.31

      # Create openclaw user and home directory
      useradd -m -s /bin/bash openclaw || true
      mkdir -p /home/openclaw/.openclaw
      chown -R openclaw:openclaw /home/openclaw

      # Create initial OpenClaw config with required settings
      sudo -u openclaw mkdir -p /home/openclaw/.openclaw
      cat > /home/openclaw/.openclaw/openclaw.json << 'EOFCONFIG'
      {{
        "gateway": {{
          "mode": "local",
          "bind": "lan",
          "auth": {{
            "mode": "token"
          }}
        }}
      }}
      EOFCONFIG
      chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json

      # Create systemd service for OpenClaw
      cat > /etc/systemd/system/openclaw.service << 'EOF'
      [Unit]
      Description=OpenClaw Gateway
      After=network.target

      [Service]
      Type=simple
      User=openclaw
      WorkingDirectory=/home/openclaw
      Environment=HOME=/home/openclaw
      Environment=OPENCLAW_STATE_DIR=/home/openclaw/.openclaw
      EnvironmentFile=-/home/openclaw/.openclaw/.env
      ExecStart=/usr/bin/openclaw gateway --bind lan --port {port}
      Restart=always
      RestartSec=5

      [Install]
      WantedBy=multi-user.target
      EOF

      systemctl daemon-reload
      systemctl enable openclaw
      systemctl start openclaw
"#,
            cpus = config.cpus,
            ram_mb = config.ram_mb,
            disk_gb = config.disk_gb,
            port = OPENCLAW_PORT,
        )
    }

    fn run_limactl(&self, args: &[&str]) -> VmResult<String> {
        let limactl = self.limactl_bin();
        eprintln!("[lima] Running: {:?} {:?}", limactl, args);

        let output = Command::new(&limactl)
            .args(args)
            .output()
            .map_err(|e| {
                eprintln!("[lima] Command spawn error: {:?}", e);
                if e.kind() == std::io::ErrorKind::NotFound {
                    VmError::LimaNotInstalled
                } else {
                    VmError::IoError(e)
                }
            })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        eprintln!("[lima] Exit status: {:?}", output.status);
        if !stdout.is_empty() {
            eprintln!("[lima] Stdout (first 200 chars): {}", stdout.chars().take(200).collect::<String>());
        }
        if !stderr.is_empty() {
            eprintln!("[lima] Stderr: {}", stderr);
        }

        if output.status.success() {
            Ok(stdout)
        } else {
            Err(VmError::CommandFailed(format!("Exit code: {:?}, stderr: {}", output.status.code(), stderr)))
        }
    }

    fn parse_status(&self, status_str: &str) -> VmStatus {
        match status_str.to_lowercase().as_str() {
            "running" => VmStatus::Running,
            "stopped" => VmStatus::Stopped,
            "starting" => VmStatus::Starting,
            "stopping" => VmStatus::Stopping,
            _ => VmStatus::Error(format!("Unknown status: {}", status_str)),
        }
    }

    /// Quick check if limactl binary exists and is executable
    fn limactl_exists(&self) -> bool {
        let path = self.limactl_bin();
        if path.to_string_lossy() == "limactl" {
            // Check if limactl is in PATH
            Command::new("which")
                .arg("limactl")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        } else {
            path.exists()
        }
    }
}

impl VmManager for LimaManager {
    fn is_available(&self) -> bool {
        if !self.limactl_exists() {
            return false;
        }

        Command::new(self.limactl_bin())
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn create(&self, config: &VmConfig) -> VmResult<()> {
        // Check if VM already exists
        if let Ok(VmStatus::Running) | Ok(VmStatus::Stopped) = self.status() {
            return Err(VmError::VmAlreadyExists(VM_NAME.to_string()));
        }

        // Create config directory
        std::fs::create_dir_all(&self.config_dir)?;
        std::fs::create_dir_all(&config.workspace_path)?;

        // Write Lima YAML
        let yaml_content = self.generate_lima_yaml(config);
        std::fs::write(self.lima_yaml_path(), yaml_content)?;

        // Create the VM
        self.run_limactl(&["create", "--name", VM_NAME, &self.lima_yaml_path().to_string_lossy()])?;

        Ok(())
    }

    fn start(&self) -> VmResult<()> {
        self.run_limactl(&["start", VM_NAME])?;
        Ok(())
    }

    fn stop(&self) -> VmResult<()> {
        self.run_limactl(&["stop", VM_NAME])?;
        Ok(())
    }

    fn force_stop(&self) -> VmResult<()> {
        self.run_limactl(&["stop", "--force", VM_NAME])?;
        Ok(())
    }

    fn delete(&self) -> VmResult<()> {
        self.run_limactl(&["delete", "--force", VM_NAME])?;
        Ok(())
    }

    fn status(&self) -> VmResult<VmStatus> {
        // Quick check - if limactl doesn't exist, return NotCreated immediately
        if !self.limactl_exists() {
            return Ok(VmStatus::NotCreated);
        }

        let output = match self.run_limactl(&["list", "--json"]) {
            Ok(o) => o,
            Err(VmError::LimaNotInstalled) => return Ok(VmStatus::NotCreated),
            Err(_) => return Ok(VmStatus::NotCreated),
        };

        // Handle empty output
        let trimmed = output.trim();
        if trimmed.is_empty() || trimmed == "[]" || trimmed == "null" {
            return Ok(VmStatus::NotCreated);
        }

        // Lima 2.x outputs a single JSON object per instance, not an array
        // Try parsing as single instance first
        if let Ok(instance) = serde_json::from_str::<LimaInstance>(trimmed) {
            if instance.name == VM_NAME {
                return Ok(self.parse_status(&instance.status));
            }
        }

        // Fall back to array parsing for older Lima versions
        if let Ok(instances) = serde_json::from_str::<Vec<LimaInstance>>(trimmed) {
            for instance in instances {
                if instance.name == VM_NAME {
                    return Ok(self.parse_status(&instance.status));
                }
            }
        }

        Ok(VmStatus::NotCreated)
    }

    fn exec(&self, cmd: &str) -> VmResult<String> {
        self.run_limactl(&["shell", VM_NAME, "--", "bash", "-c", cmd])
    }

    fn get_gateway_url(&self) -> VmResult<String> {
        Ok(format!("http://localhost:{}", OPENCLAW_PORT))
    }

    fn set_resources(&self, ram_mb: u32, cpus: u32) -> VmResult<()> {
        // Read existing config
        let yaml_path = self.lima_yaml_path();
        if !yaml_path.exists() {
            return Err(VmError::VmNotFound(VM_NAME.to_string()));
        }

        let content = std::fs::read_to_string(&yaml_path)?;

        // Update RAM and CPU values (simple string replacement)
        let updated = content
            .lines()
            .map(|line| {
                if line.starts_with("cpus:") {
                    format!("cpus: {}", cpus)
                } else if line.starts_with("memory:") {
                    format!("memory: \"{}MiB\"", ram_mb)
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");

        std::fs::write(&yaml_path, updated)?;

        Ok(())
    }
}

impl Default for LimaManager {
    fn default() -> Self {
        Self::new()
    }
}
