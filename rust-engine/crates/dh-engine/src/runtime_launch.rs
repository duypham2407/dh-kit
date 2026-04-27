use crate::host_lifecycle::{
    classify_launchability_failure, classify_platform, HostLifecycleReport, LaunchabilityIssue,
};
use crate::worker_protocol::WORKER_PROTOCOL_VERSION;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const RUNTIME_PREREQUISITE_TIMEOUT: Duration = Duration::from_secs(2);
const RUNTIME_PREREQUISITE_POLL_INTERVAL: Duration = Duration::from_millis(20);
const DEFAULT_WORKER_BUNDLE_DIR: [&str; 2] = ["dist", "ts-worker"];
const DEFAULT_WORKER_ENTRY_NAME: &str = "worker.mjs";
const DEFAULT_WORKER_MANIFEST_NAME: &str = "manifest.json";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeLaunchRequest {
    pub platform: String,
    pub runtime_path: PathBuf,
    pub worker_entry_path: PathBuf,
    pub manifest_path: Option<PathBuf>,
    pub expected_protocol_version: String,
}

#[allow(dead_code)]
impl RuntimeLaunchRequest {
    pub fn new(runtime_path: impl Into<PathBuf>, worker_entry_path: impl Into<PathBuf>) -> Self {
        Self {
            platform: current_platform(),
            runtime_path: runtime_path.into(),
            worker_entry_path: worker_entry_path.into(),
            manifest_path: None,
            expected_protocol_version: WORKER_PROTOCOL_VERSION.to_string(),
        }
    }

    pub fn with_platform(mut self, platform: impl Into<String>) -> Self {
        self.platform = platform.into();
        self
    }

    pub fn with_manifest(mut self, manifest_path: impl Into<PathBuf>) -> Self {
        self.manifest_path = Some(manifest_path.into());
        self
    }

    pub fn with_expected_protocol_version(mut self, protocol_version: impl Into<String>) -> Self {
        self.expected_protocol_version = protocol_version.into();
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchabilityStatus {
    Launchable,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchabilityCheck {
    pub status: LaunchabilityStatus,
    pub platform: String,
    pub resolved_runtime_path: Option<PathBuf>,
    pub worker_entry_path: PathBuf,
    pub manifest_path: Option<PathBuf>,
    pub issue: Option<LaunchabilityIssue>,
    pub failure_report: Option<HostLifecycleReport>,
}

impl LaunchabilityCheck {
    pub fn is_launchable(&self) -> bool {
        self.status == LaunchabilityStatus::Launchable
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerBundleManifest {
    pub worker_version: Option<String>,
    pub protocol_version: Option<String>,
    pub entry_path: Option<PathBuf>,
    pub checksum_sha256: Option<String>,
    pub required_node_major: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerBundlePathSource {
    ExplicitEntry,
    ExplicitManifest,
    DefaultSearchRoot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedWorkerBundlePaths {
    pub worker_entry_path: PathBuf,
    pub manifest_path: Option<PathBuf>,
    pub source: WorkerBundlePathSource,
}

pub fn current_platform() -> String {
    classify_platform(env::consts::OS).platform
}

pub fn resolve_worker_bundle_paths(
    worker_entry: Option<PathBuf>,
    worker_manifest: Option<PathBuf>,
    search_roots: &[PathBuf],
) -> ResolvedWorkerBundlePaths {
    if let Some(entry) = worker_entry {
        return ResolvedWorkerBundlePaths {
            manifest_path: worker_manifest.or_else(|| sibling_manifest_path(&entry)),
            worker_entry_path: entry,
            source: WorkerBundlePathSource::ExplicitEntry,
        };
    }

    if let Some(manifest) = worker_manifest {
        if let Ok(bundle_manifest) = read_manifest(&manifest) {
            if let Some(entry) = bundle_manifest.entry_path {
                let entry = if entry.is_absolute() {
                    entry
                } else {
                    manifest
                        .parent()
                        .unwrap_or_else(|| Path::new("."))
                        .join(entry)
                };
                return ResolvedWorkerBundlePaths {
                    worker_entry_path: entry,
                    manifest_path: Some(manifest),
                    source: WorkerBundlePathSource::ExplicitManifest,
                };
            }
        }

        return ResolvedWorkerBundlePaths {
            worker_entry_path: manifest
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join(DEFAULT_WORKER_ENTRY_NAME),
            manifest_path: Some(manifest),
            source: WorkerBundlePathSource::ExplicitManifest,
        };
    }

    if let Some(candidate) = search_roots
        .iter()
        .flat_map(|root| default_worker_bundle_candidates(root))
        .find(|candidate| candidate.worker_entry_path.is_file())
    {
        return candidate;
    }

    let root = search_roots
        .first()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("."));
    let worker_entry_path = installed_worker_entry_path(&root);
    let manifest_path = Some(installed_worker_manifest_path(&root));

    ResolvedWorkerBundlePaths {
        worker_entry_path,
        manifest_path,
        source: WorkerBundlePathSource::DefaultSearchRoot,
    }
}

pub fn check_worker_launchability(request: &RuntimeLaunchRequest) -> LaunchabilityCheck {
    let platform = classify_platform(&request.platform);
    if !platform.supported {
        return blocked(
            platform.platform,
            &request.worker_entry_path,
            request.manifest_path.as_ref(),
            LaunchabilityIssue::UnsupportedPlatform,
        );
    }

    let runtime_path = match resolve_runtime_path(&request.runtime_path) {
        Some(path) => path,
        None => {
            return blocked(
                platform.platform,
                &request.worker_entry_path,
                request.manifest_path.as_ref(),
                LaunchabilityIssue::RuntimeMissing,
            )
        }
    };

    if !is_executable_file(&runtime_path) {
        return blocked(
            platform.platform,
            &request.worker_entry_path,
            request.manifest_path.as_ref(),
            LaunchabilityIssue::RuntimeNotExecutable,
        );
    }

    if !request.worker_entry_path.is_file() {
        return blocked(
            platform.platform,
            &request.worker_entry_path,
            request.manifest_path.as_ref(),
            LaunchabilityIssue::BundleMissing,
        );
    }

    if fs::metadata(&request.worker_entry_path)
        .map(|metadata| metadata.len() == 0)
        .unwrap_or(true)
    {
        return blocked(
            platform.platform,
            &request.worker_entry_path,
            request.manifest_path.as_ref(),
            LaunchabilityIssue::BundleCorrupt,
        );
    }

    if let Some(manifest_path) = &request.manifest_path {
        if let Err(issue) = validate_manifest(request, manifest_path, &runtime_path) {
            return blocked(
                platform.platform,
                &request.worker_entry_path,
                request.manifest_path.as_ref(),
                issue,
            );
        }
    }

    LaunchabilityCheck {
        status: LaunchabilityStatus::Launchable,
        platform: platform.platform,
        resolved_runtime_path: Some(runtime_path),
        worker_entry_path: request.worker_entry_path.clone(),
        manifest_path: request.manifest_path.clone(),
        issue: None,
        failure_report: None,
    }
}

pub fn resolve_runtime_path(runtime_path: &Path) -> Option<PathBuf> {
    if runtime_path.is_absolute() || runtime_path.components().count() > 1 {
        return runtime_path.exists().then(|| runtime_path.to_path_buf());
    }

    if runtime_path.exists() {
        return Some(runtime_path.to_path_buf());
    }

    let runtime_name = runtime_path.to_string_lossy();
    env::var_os("PATH").and_then(|paths| {
        env::split_paths(&paths)
            .map(|path| path.join(runtime_name.as_ref()))
            .find(|candidate| candidate.exists())
    })
}

fn validate_manifest(
    request: &RuntimeLaunchRequest,
    manifest_path: &Path,
    runtime_path: &Path,
) -> std::result::Result<(), LaunchabilityIssue> {
    let manifest =
        read_manifest(manifest_path).map_err(|_| LaunchabilityIssue::BundleManifestMismatch)?;

    let Some(protocol_version) = manifest.protocol_version.as_deref() else {
        return Err(LaunchabilityIssue::BundleManifestMismatch);
    };
    if protocol_version != request.expected_protocol_version {
        return Err(LaunchabilityIssue::ProtocolMismatch);
    }

    let Some(entry_path) = manifest.entry_path.as_ref() else {
        return Err(LaunchabilityIssue::BundleManifestMismatch);
    };
    let declared_entry_path = if entry_path.is_absolute() {
        entry_path.clone()
    } else {
        manifest_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(entry_path)
    };
    if !same_existing_path(&declared_entry_path, &request.worker_entry_path) {
        return Err(LaunchabilityIssue::BundleManifestMismatch);
    }

    if let Some(expected_checksum) = manifest.checksum_sha256.as_deref() {
        let actual_checksum = sha256_file(&request.worker_entry_path)
            .map_err(|_| LaunchabilityIssue::BundleCorrupt)?;
        if !expected_checksum.eq_ignore_ascii_case(&actual_checksum) {
            return Err(LaunchabilityIssue::BundleCorrupt);
        }
    }

    if let Some(required_node_major) = manifest.required_node_major {
        validate_required_node_major(runtime_path, required_node_major)?;
    }

    Ok(())
}

fn validate_required_node_major(
    runtime_path: &Path,
    required_node_major: u32,
) -> std::result::Result<(), LaunchabilityIssue> {
    let actual_node_major = runtime_node_major_version(runtime_path)?;
    if actual_node_major >= required_node_major {
        Ok(())
    } else {
        Err(LaunchabilityIssue::RuntimePrerequisiteMismatch)
    }
}

fn runtime_node_major_version(runtime_path: &Path) -> std::result::Result<u32, LaunchabilityIssue> {
    let mut child = Command::new(runtime_path)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| LaunchabilityIssue::RuntimeNotExecutable)?;

    let deadline = Instant::now() + RUNTIME_PREREQUISITE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = String::new();
                if let Some(mut stream) = child.stdout.take() {
                    stream
                        .read_to_string(&mut stdout)
                        .map_err(|_| LaunchabilityIssue::RuntimePrerequisiteMismatch)?;
                }

                if !status.success() {
                    return Err(LaunchabilityIssue::RuntimePrerequisiteMismatch);
                }

                return parse_node_major_version(&stdout)
                    .ok_or(LaunchabilityIssue::RuntimePrerequisiteMismatch);
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(LaunchabilityIssue::RuntimePrerequisiteMismatch);
                }
                thread::sleep(RUNTIME_PREREQUISITE_POLL_INTERVAL);
            }
            Err(_) => return Err(LaunchabilityIssue::RuntimePrerequisiteMismatch),
        }
    }
}

fn parse_node_major_version(output: &str) -> Option<u32> {
    let version = output
        .trim()
        .strip_prefix('v')
        .unwrap_or_else(|| output.trim());
    version.split('.').next()?.parse().ok()
}

fn read_manifest(path: &Path) -> Result<WorkerBundleManifest> {
    let raw =
        fs::read_to_string(path).with_context(|| format!("read manifest: {}", path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("parse manifest: {}", path.display()))
}

fn sibling_manifest_path(worker_entry: &Path) -> Option<PathBuf> {
    let manifest = worker_entry.parent()?.join(DEFAULT_WORKER_MANIFEST_NAME);
    manifest.is_file().then_some(manifest)
}

fn default_worker_entry_path(root: &Path) -> PathBuf {
    DEFAULT_WORKER_BUNDLE_DIR
        .iter()
        .fold(root.to_path_buf(), |path, segment| path.join(segment))
        .join(DEFAULT_WORKER_ENTRY_NAME)
}

fn default_worker_manifest_path(root: &Path) -> PathBuf {
    DEFAULT_WORKER_BUNDLE_DIR
        .iter()
        .fold(root.to_path_buf(), |path, segment| path.join(segment))
        .join(DEFAULT_WORKER_MANIFEST_NAME)
}

fn installed_worker_entry_path(root: &Path) -> PathBuf {
    root.join("ts-worker").join(DEFAULT_WORKER_ENTRY_NAME)
}

fn installed_worker_manifest_path(root: &Path) -> PathBuf {
    root.join("ts-worker").join(DEFAULT_WORKER_MANIFEST_NAME)
}

fn default_worker_bundle_candidates(root: &Path) -> Vec<ResolvedWorkerBundlePaths> {
    vec![
        ResolvedWorkerBundlePaths {
            worker_entry_path: installed_worker_entry_path(root),
            manifest_path: Some(installed_worker_manifest_path(root)),
            source: WorkerBundlePathSource::DefaultSearchRoot,
        },
        ResolvedWorkerBundlePaths {
            worker_entry_path: default_worker_entry_path(root),
            manifest_path: Some(default_worker_manifest_path(root)),
            source: WorkerBundlePathSource::DefaultSearchRoot,
        },
    ]
}

fn same_existing_path(left: &Path, right: &Path) -> bool {
    let Ok(left) = left.canonicalize() else {
        return false;
    };
    let Ok(right) = right.canonicalize() else {
        return false;
    };
    left == right
}

fn sha256_file(path: &Path) -> Result<String> {
    let bytes = fs::read(path).with_context(|| format!("read worker entry: {}", path.display()))?;
    let digest = Sha256::digest(bytes);
    Ok(format!("{digest:x}"))
}

fn blocked(
    platform: String,
    worker_entry_path: &Path,
    manifest_path: Option<&PathBuf>,
    issue: LaunchabilityIssue,
) -> LaunchabilityCheck {
    LaunchabilityCheck {
        status: LaunchabilityStatus::Blocked,
        platform: platform.clone(),
        resolved_runtime_path: None,
        worker_entry_path: worker_entry_path.to_path_buf(),
        manifest_path: manifest_path.cloned(),
        issue: Some(issue),
        failure_report: Some(classify_launchability_failure(platform, issue)),
    }
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    path.metadata()
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable_file(_path: &Path) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[cfg(unix)]
    fn make_executable(path: &Path) -> anyhow::Result<()> {
        let mut permissions = fs::metadata(path)?.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions)?;
        Ok(())
    }

    fn write_file(path: &Path, contents: &str) -> anyhow::Result<()> {
        fs::write(path, contents)?;
        Ok(())
    }

    #[test]
    fn unsupported_platform_blocks_as_startup_failure() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let request =
            RuntimeLaunchRequest::new(temp.path().join("node"), temp.path().join("worker.mjs"))
                .with_platform("windows");

        let check = check_worker_launchability(&request);

        assert_eq!(check.status, LaunchabilityStatus::Blocked);
        assert_eq!(check.issue, Some(LaunchabilityIssue::UnsupportedPlatform));
        let report = check.failure_report.expect("failure report");
        assert_eq!(
            report.failure_phase,
            crate::host_lifecycle::FailurePhase::Startup
        );
        assert_eq!(
            report.final_status,
            crate::host_lifecycle::FinalStatus::StartupFailed
        );

        Ok(())
    }

    #[test]
    fn missing_runtime_blocks_before_bundle_checks() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let worker = temp.path().join("worker.mjs");
        write_file(&worker, "console.error('worker');")?;
        let request = RuntimeLaunchRequest::new(temp.path().join("missing-node"), worker)
            .with_platform("linux");

        let check = check_worker_launchability(&request);

        assert_eq!(check.status, LaunchabilityStatus::Blocked);
        assert_eq!(check.issue, Some(LaunchabilityIssue::RuntimeMissing));

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn non_executable_runtime_is_not_launchable() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = temp.path().join("node");
        let worker = temp.path().join("worker.mjs");
        write_file(&runtime, "#!/bin/sh\nexit 0\n")?;
        write_file(&worker, "console.error('worker');")?;
        let request = RuntimeLaunchRequest::new(runtime, worker).with_platform("linux");

        let check = check_worker_launchability(&request);

        assert_eq!(check.status, LaunchabilityStatus::Blocked);
        assert_eq!(check.issue, Some(LaunchabilityIssue::RuntimeNotExecutable));

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn missing_or_empty_worker_entry_is_classified() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = temp.path().join("node");
        write_file(&runtime, "#!/bin/sh\nexit 0\n")?;
        make_executable(&runtime)?;

        let missing_worker = temp.path().join("missing-worker.mjs");
        let missing =
            RuntimeLaunchRequest::new(runtime.clone(), missing_worker).with_platform("linux");
        let missing_check = check_worker_launchability(&missing);
        assert_eq!(missing_check.issue, Some(LaunchabilityIssue::BundleMissing));

        let empty_worker = temp.path().join("empty-worker.mjs");
        write_file(&empty_worker, "")?;
        let empty = RuntimeLaunchRequest::new(runtime, empty_worker).with_platform("linux");
        let empty_check = check_worker_launchability(&empty);
        assert_eq!(empty_check.issue, Some(LaunchabilityIssue::BundleCorrupt));

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn resolves_default_worker_bundle_from_search_root_manifest() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let bundle_dir = temp.path().join("ts-worker");
        fs::create_dir_all(&bundle_dir)?;
        let worker = bundle_dir.join("worker.mjs");
        let manifest = bundle_dir.join("manifest.json");
        write_file(&worker, "console.error('worker');")?;
        write_file(
            &manifest,
            r#"{"protocolVersion":"1","entryPath":"worker.mjs","requiredNodeMajor":22}"#,
        )?;

        let resolved = resolve_worker_bundle_paths(None, None, &[temp.path().to_path_buf()]);

        assert_eq!(resolved.worker_entry_path, worker);
        assert_eq!(resolved.manifest_path, Some(manifest));
        assert_eq!(resolved.source, WorkerBundlePathSource::DefaultSearchRoot);

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn default_worker_bundle_resolution_keeps_missing_bundle_classifiable() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;

        let resolved = resolve_worker_bundle_paths(None, None, &[temp.path().to_path_buf()]);

        assert_eq!(
            resolved.worker_entry_path,
            temp.path().join("ts-worker").join("worker.mjs")
        );
        assert_eq!(
            resolved.manifest_path,
            Some(temp.path().join("ts-worker").join("manifest.json"))
        );

        let runtime = temp.path().join("node");
        write_file(&runtime, "#!/bin/sh\nexit 0\n")?;
        make_executable(&runtime)?;
        let request = RuntimeLaunchRequest::new(runtime, resolved.worker_entry_path)
            .with_platform("linux")
            .with_manifest(resolved.manifest_path.expect("manifest path"));
        let check = check_worker_launchability(&request);

        assert_eq!(check.issue, Some(LaunchabilityIssue::BundleMissing));

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn manifest_mismatch_protocol_mismatch_and_corrupt_checksum_are_classified(
    ) -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = temp.path().join("node");
        let worker = temp.path().join("worker.mjs");
        let manifest = temp.path().join("manifest.json");
        write_file(&runtime, "#!/bin/sh\nexit 0\n")?;
        make_executable(&runtime)?;
        write_file(&worker, "console.error('worker');")?;

        write_file(
            &manifest,
            r#"{"protocolVersion":"2","entryPath":"worker.mjs"}"#,
        )?;
        let protocol = RuntimeLaunchRequest::new(runtime.clone(), worker.clone())
            .with_platform("linux")
            .with_manifest(manifest.clone())
            .with_expected_protocol_version("1");
        let protocol_check = check_worker_launchability(&protocol);
        assert_eq!(
            protocol_check.issue,
            Some(LaunchabilityIssue::ProtocolMismatch)
        );

        write_file(
            &manifest,
            r#"{"protocolVersion":"1","entryPath":"other-worker.mjs"}"#,
        )?;
        let entry = RuntimeLaunchRequest::new(runtime.clone(), worker.clone())
            .with_platform("linux")
            .with_manifest(manifest.clone());
        let entry_check = check_worker_launchability(&entry);
        assert_eq!(
            entry_check.issue,
            Some(LaunchabilityIssue::BundleManifestMismatch)
        );

        write_file(
            &manifest,
            r#"{"protocolVersion":"1","entryPath":"worker.mjs","checksumSha256":"deadbeef"}"#,
        )?;
        let corrupt = RuntimeLaunchRequest::new(runtime.clone(), worker.clone())
            .with_platform("linux")
            .with_manifest(manifest.clone());
        let corrupt_check = check_worker_launchability(&corrupt);
        assert_eq!(corrupt_check.issue, Some(LaunchabilityIssue::BundleCorrupt));

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn launchable_when_platform_runtime_entry_and_manifest_match() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = temp.path().join("node");
        let worker = temp.path().join("worker.mjs");
        let manifest = temp.path().join("manifest.json");
        write_file(
            &runtime,
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'v22.0.0'; exit 0; fi\nexit 0\n",
        )?;
        make_executable(&runtime)?;
        write_file(&worker, "console.error('worker');")?;
        let checksum = sha256_file(&worker)?;
        write_file(
            &manifest,
            &format!(
                r#"{{"protocolVersion":"1","entryPath":"worker.mjs","checksumSha256":"{checksum}","requiredNodeMajor":22}}"#
            ),
        )?;

        let request = RuntimeLaunchRequest::new(runtime.clone(), worker.clone())
            .with_platform("macos")
            .with_manifest(manifest.clone());
        let check = check_worker_launchability(&request);

        assert_eq!(check.status, LaunchabilityStatus::Launchable);
        assert!(check.is_launchable());
        assert_eq!(check.resolved_runtime_path, Some(runtime));
        assert_eq!(check.issue, None);
        assert_eq!(check.failure_report, None);

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn required_node_major_mismatch_is_blocked_before_spawn() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = temp.path().join("node");
        let worker = temp.path().join("worker.mjs");
        let manifest = temp.path().join("manifest.json");
        write_file(
            &runtime,
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'v20.0.0'; exit 0; fi\nexit 0\n",
        )?;
        make_executable(&runtime)?;
        write_file(&worker, "console.error('worker');")?;
        write_file(
            &manifest,
            r#"{"protocolVersion":"1","entryPath":"worker.mjs","requiredNodeMajor":22}"#,
        )?;

        let request = RuntimeLaunchRequest::new(runtime, worker)
            .with_platform("linux")
            .with_manifest(manifest);
        let check = check_worker_launchability(&request);

        assert_eq!(check.status, LaunchabilityStatus::Blocked);
        assert_eq!(
            check.issue,
            Some(LaunchabilityIssue::RuntimePrerequisiteMismatch)
        );
        let report = check.failure_report.expect("failure report");
        assert_eq!(
            report.failure_phase,
            crate::host_lifecycle::FailurePhase::Startup
        );
        assert_eq!(
            report.final_status,
            crate::host_lifecycle::FinalStatus::StartupFailed
        );

        Ok(())
    }
}
