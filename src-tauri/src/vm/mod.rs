pub mod lima;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VmConfig {
    pub ram_mb: u32,
    pub cpus: u32,
    pub disk_gb: u32,
    pub workspace_path: PathBuf,
}

impl Default for VmConfig {
    fn default() -> Self {
        Self {
            ram_mb: 4096,
            cpus: 2,
            disk_gb: 20,
            workspace_path: dirs::home_dir()
                .unwrap_or_default()
                .join(".clawbox")
                .join("workspace"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VmStatus {
    NotCreated,
    Stopped,
    Starting,
    Running,
    Stopping,
    Error(String),
}

#[derive(Error, Debug)]
pub enum VmError {
    #[error("Lima not installed. Please install Lima first.")]
    LimaNotInstalled,

    #[error("VM not found: {0}")]
    VmNotFound(String),

    #[error("VM already exists: {0}")]
    VmAlreadyExists(String),

    #[error("Failed to execute command: {0}")]
    CommandFailed(String),

    #[error("Failed to parse output: {0}")]
    ParseError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("VM operation failed: {0}")]
    OperationFailed(String),
}

pub type VmResult<T> = Result<T, VmError>;

/// Trait for VM management backends
pub trait VmManager: Send + Sync {
    /// Create a new VM with the given configuration
    fn create(&self, config: &VmConfig) -> VmResult<()>;

    /// Start the VM
    fn start(&self) -> VmResult<()>;

    /// Stop the VM gracefully
    fn stop(&self) -> VmResult<()>;

    /// Force stop the VM
    fn force_stop(&self) -> VmResult<()>;

    /// Delete the VM
    fn delete(&self) -> VmResult<()>;

    /// Get the current VM status
    fn status(&self) -> VmResult<VmStatus>;

    /// Execute a command inside the VM
    fn exec(&self, cmd: &str) -> VmResult<String>;

    /// Get the gateway URL (OpenClaw WebUI)
    fn get_gateway_url(&self) -> VmResult<String>;

    /// Update VM resources (requires restart)
    fn set_resources(&self, ram_mb: u32, cpus: u32) -> VmResult<()>;

    /// Check if the VM backend is available on this system
    fn is_available(&self) -> bool;
}
