use std::path::PathBuf;
use std::process::Command;

pub struct SetupManager {
    config_dir: PathBuf,
}

impl SetupManager {
    pub fn new() -> Self {
        let config_dir = dirs::home_dir()
            .unwrap_or_default()
            .join(".clawbox");
        Self { config_dir }
    }

    fn lima_dir(&self) -> PathBuf {
        self.config_dir.join("lima")
    }

    fn lima_bin(&self) -> PathBuf {
        self.lima_dir().join("bin").join("limactl")
    }

    pub fn is_lima_installed(&self) -> bool {
        // Check bundled Lima first
        if self.lima_bin().exists() {
            return true;
        }
        // Check system Lima
        Command::new("limactl")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    pub async fn download_lima(&self) -> Result<(), String> {
        let lima_dir = self.lima_dir();
        std::fs::create_dir_all(&lima_dir).map_err(|e| e.to_string())?;

        // Detect architecture
        let arch = if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            "x86_64"
        };

        // Lima release URL (latest stable)
        let version = "2.1.0";
        let filename = format!("lima-{}-Darwin-{}.tar.gz", version, arch);
        let url = format!(
            "https://github.com/lima-vm/lima/releases/download/v{}/{}",
            version, filename
        );

        let tarball_path = lima_dir.join(&filename);

        // Download using curl (available on all macOS)
        // -L follows redirects, -f fails on HTTP errors, --progress-bar shows progress
        let output = Command::new("curl")
            .args([
                "-L",
                "-f",
                "--progress-bar",
                "-o",
                &tarball_path.to_string_lossy(),
                &url,
            ])
            .output()
            .map_err(|e| format!("Failed to download Lima: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Failed to download Lima (HTTP error): {}. URL: {}",
                stderr, url
            ));
        }

        // Verify the download is actually a gzip file
        let file_check = Command::new("file")
            .arg(&tarball_path)
            .output()
            .map_err(|e| format!("Failed to check file type: {}", e))?;

        let file_type = String::from_utf8_lossy(&file_check.stdout);
        if !file_type.contains("gzip") {
            let _ = std::fs::remove_file(&tarball_path);
            return Err(format!(
                "Downloaded file is not a valid gzip archive. Got: {}",
                file_type.trim()
            ));
        }

        // Extract tarball
        let output = Command::new("tar")
            .args([
                "-xzf",
                &tarball_path.to_string_lossy(),
                "-C",
                &lima_dir.to_string_lossy(),
            ])
            .output()
            .map_err(|e| format!("Failed to extract Lima: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to extract Lima: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        // Clean up tarball
        let _ = std::fs::remove_file(&tarball_path);

        Ok(())
    }

    pub fn get_limactl_path(&self) -> PathBuf {
        if self.lima_bin().exists() {
            self.lima_bin()
        } else {
            PathBuf::from("limactl")
        }
    }
}

impl Default for SetupManager {
    fn default() -> Self {
        Self::new()
    }
}
