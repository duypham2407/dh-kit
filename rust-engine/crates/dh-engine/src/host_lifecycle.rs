use serde::{Deserialize, Serialize};

pub const LIFECYCLE_CONTRACT_VERSION: &str = "2026-04-22.rust-host-lifecycle.v1";
pub const TOPOLOGY_RUST_HOST_TS_WORKER: &str = "rust_host_ts_worker";
pub const SUPPORT_BOUNDARY_FIRST_WAVE: &str = "knowledge_commands_first_wave";
pub const LIFECYCLE_AUTHORITY_OWNER: &str = "rust";
pub const WORKER_ROLE: &str = "typescript_worker";
pub const SUPPORTED_COMMANDS_FIRST_WAVE: [&str; 3] = ["ask", "explain", "trace"];
pub const SUPPORTED_PLATFORMS: [&str; 2] = ["linux", "macos"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkerState {
    NotRunning,
    SpawnedNotReady,
    Ready,
    Busy,
    Degraded,
    ShuttingDown,
    Stopped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthState {
    Unknown,
    Healthy,
    Degraded,
    Blocked,
    Unhealthy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FailurePhase {
    None,
    Startup,
    Request,
    Health,
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeoutClass {
    None,
    StartupTimeout,
    ReadyTimeout,
    RequestTimeout,
    HealthTimeout,
    ShutdownTimeout,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryOutcome {
    NotAttempted,
    AttemptedSucceededDegraded,
    AttemptedFailed,
    ForbiddenReplayUnsafe,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CleanupOutcome {
    Graceful,
    Forced,
    Incomplete,
    NotStarted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinalStatus {
    CleanSuccess,
    RecoveredDegradedSuccess,
    DegradedSuccess,
    StartupFailed,
    RequestFailed,
    Cancelled,
    CleanupIncomplete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchabilityIssue {
    UnsupportedPlatform,
    RuntimeMissing,
    RuntimeNotExecutable,
    RuntimePrerequisiteMismatch,
    BundleMissing,
    BundleManifestMismatch,
    BundleCorrupt,
    ProtocolMismatch,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleVocabulary {
    pub worker_states: Vec<WorkerState>,
    pub health_states: Vec<HealthState>,
    pub failure_phases: Vec<FailurePhase>,
    pub timeout_classes: Vec<TimeoutClass>,
    pub recovery_outcomes: Vec<RecoveryOutcome>,
    pub cleanup_outcomes: Vec<CleanupOutcome>,
    pub final_statuses: Vec<FinalStatus>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleBoundaries {
    pub local_only: bool,
    pub network_transport: bool,
    pub daemon_mode: bool,
    pub windows_support: bool,
    pub generic_process_supervisor: bool,
    pub workflow_lane_parity: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleAuthority {
    pub owner: &'static str,
    pub rust_owns: Vec<&'static str>,
    pub typescript_worker_owns: Vec<&'static str>,
    pub typescript_must_not_own: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleContract {
    pub contract_version: &'static str,
    pub topology: &'static str,
    pub support_boundary: &'static str,
    pub supported_commands: Vec<&'static str>,
    pub supported_platforms: Vec<&'static str>,
    pub authority_owner: &'static str,
    pub worker_role: &'static str,
    pub authority: LifecycleAuthority,
    pub vocabulary: LifecycleVocabulary,
    pub boundaries: LifecycleBoundaries,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformClassification {
    pub platform: String,
    pub supported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launchability_issue: Option<LaunchabilityIssue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostLifecycleReport {
    pub topology: &'static str,
    pub support_boundary: &'static str,
    pub platform: String,
    pub worker_state: WorkerState,
    pub health_state: HealthState,
    pub failure_phase: FailurePhase,
    pub timeout_class: TimeoutClass,
    pub recovery_outcome: RecoveryOutcome,
    pub cleanup_outcome: CleanupOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launchability_issue: Option<LaunchabilityIssue>,
    pub final_status: FinalStatus,
    pub final_exit_code: i32,
}

pub fn lifecycle_contract() -> LifecycleContract {
    LifecycleContract {
        contract_version: LIFECYCLE_CONTRACT_VERSION,
        topology: TOPOLOGY_RUST_HOST_TS_WORKER,
        support_boundary: SUPPORT_BOUNDARY_FIRST_WAVE,
        supported_commands: SUPPORTED_COMMANDS_FIRST_WAVE.to_vec(),
        supported_platforms: SUPPORTED_PLATFORMS.to_vec(),
        authority_owner: LIFECYCLE_AUTHORITY_OWNER,
        worker_role: WORKER_ROLE,
        authority: LifecycleAuthority {
            owner: LIFECYCLE_AUTHORITY_OWNER,
            rust_owns: vec![
                "startup_eligibility",
                "spawned_vs_ready_state",
                "ready_deadline",
                "health_classification",
                "timeout_classification",
                "replay_safe_recovery_decision",
                "shutdown_cleanup_outcome",
                "final_exit_status",
            ],
            typescript_worker_owns: vec![
                "workflow_logic",
                "agent_orchestration",
                "prompt_context_assembly",
                "llm_provider_interaction",
                "session_memory",
                "command_output_body",
            ],
            typescript_must_not_own: vec![
                "top_level_process_supervision",
                "host_launchability_truth",
                "host_timeout_authority",
                "host_recovery_authority",
                "final_process_tree_exit_code",
            ],
        },
        vocabulary: LifecycleVocabulary {
            worker_states: vec![
                WorkerState::NotRunning,
                WorkerState::SpawnedNotReady,
                WorkerState::Ready,
                WorkerState::Busy,
                WorkerState::Degraded,
                WorkerState::ShuttingDown,
                WorkerState::Stopped,
            ],
            health_states: vec![
                HealthState::Unknown,
                HealthState::Healthy,
                HealthState::Degraded,
                HealthState::Blocked,
                HealthState::Unhealthy,
            ],
            failure_phases: vec![
                FailurePhase::None,
                FailurePhase::Startup,
                FailurePhase::Request,
                FailurePhase::Health,
                FailurePhase::Shutdown,
            ],
            timeout_classes: vec![
                TimeoutClass::None,
                TimeoutClass::StartupTimeout,
                TimeoutClass::ReadyTimeout,
                TimeoutClass::RequestTimeout,
                TimeoutClass::HealthTimeout,
                TimeoutClass::ShutdownTimeout,
            ],
            recovery_outcomes: vec![
                RecoveryOutcome::NotAttempted,
                RecoveryOutcome::AttemptedSucceededDegraded,
                RecoveryOutcome::AttemptedFailed,
                RecoveryOutcome::ForbiddenReplayUnsafe,
            ],
            cleanup_outcomes: vec![
                CleanupOutcome::Graceful,
                CleanupOutcome::Forced,
                CleanupOutcome::Incomplete,
                CleanupOutcome::NotStarted,
            ],
            final_statuses: vec![
                FinalStatus::CleanSuccess,
                FinalStatus::RecoveredDegradedSuccess,
                FinalStatus::DegradedSuccess,
                FinalStatus::StartupFailed,
                FinalStatus::RequestFailed,
                FinalStatus::Cancelled,
                FinalStatus::CleanupIncomplete,
            ],
        },
        boundaries: LifecycleBoundaries {
            local_only: true,
            network_transport: false,
            daemon_mode: false,
            windows_support: false,
            generic_process_supervisor: false,
            workflow_lane_parity: false,
        },
    }
}

pub fn classify_platform(os: &str) -> PlatformClassification {
    let platform = normalize_platform(os);
    let supported = SUPPORTED_PLATFORMS.contains(&platform.as_str());
    PlatformClassification {
        platform,
        supported,
        launchability_issue: (!supported).then_some(LaunchabilityIssue::UnsupportedPlatform),
    }
}

pub fn classify_launchability_failure(
    platform: impl Into<String>,
    issue: LaunchabilityIssue,
) -> HostLifecycleReport {
    let platform = platform.into();
    HostLifecycleReport {
        topology: TOPOLOGY_RUST_HOST_TS_WORKER,
        support_boundary: SUPPORT_BOUNDARY_FIRST_WAVE,
        platform,
        worker_state: WorkerState::NotRunning,
        health_state: HealthState::Blocked,
        failure_phase: FailurePhase::Startup,
        timeout_class: match issue {
            LaunchabilityIssue::UnsupportedPlatform
            | LaunchabilityIssue::RuntimeMissing
            | LaunchabilityIssue::RuntimeNotExecutable
            | LaunchabilityIssue::RuntimePrerequisiteMismatch
            | LaunchabilityIssue::BundleMissing
            | LaunchabilityIssue::BundleManifestMismatch
            | LaunchabilityIssue::BundleCorrupt
            | LaunchabilityIssue::ProtocolMismatch => TimeoutClass::None,
        },
        recovery_outcome: RecoveryOutcome::NotAttempted,
        cleanup_outcome: CleanupOutcome::NotStarted,
        launchability_issue: Some(issue),
        final_status: FinalStatus::StartupFailed,
        final_exit_code: derive_final_exit_code(FinalStatus::StartupFailed, None),
    }
}

pub fn derive_final_exit_code(status: FinalStatus, command_exit_code: Option<i32>) -> i32 {
    match status {
        FinalStatus::CleanSuccess => command_exit_code.unwrap_or(0),
        FinalStatus::RecoveredDegradedSuccess | FinalStatus::DegradedSuccess => 0,
        FinalStatus::StartupFailed
        | FinalStatus::RequestFailed
        | FinalStatus::CleanupIncomplete => {
            command_exit_code.filter(|code| *code != 0).unwrap_or(1)
        }
        FinalStatus::Cancelled => 130,
    }
}

pub fn report_for_final_status(
    platform: impl Into<String>,
    worker_state: WorkerState,
    health_state: HealthState,
    failure_phase: FailurePhase,
    timeout_class: TimeoutClass,
    recovery_outcome: RecoveryOutcome,
    cleanup_outcome: CleanupOutcome,
    launchability_issue: Option<LaunchabilityIssue>,
    final_status: FinalStatus,
    command_exit_code: Option<i32>,
) -> HostLifecycleReport {
    HostLifecycleReport {
        topology: TOPOLOGY_RUST_HOST_TS_WORKER,
        support_boundary: SUPPORT_BOUNDARY_FIRST_WAVE,
        platform: platform.into(),
        worker_state,
        health_state,
        failure_phase,
        timeout_class,
        recovery_outcome,
        cleanup_outcome,
        launchability_issue,
        final_exit_code: derive_final_exit_code(final_status, command_exit_code),
        final_status,
    }
}

fn normalize_platform(os: &str) -> String {
    match os {
        "macos" | "darwin" => "macos".to_string(),
        "linux" => "linux".to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn contract_freezes_required_vocabulary_and_boundaries() -> anyhow::Result<()> {
        let contract = lifecycle_contract();
        let value = serde_json::to_value(&contract)?;

        assert_eq!(value["topology"], json!("rust_host_ts_worker"));
        assert_eq!(
            value["supportBoundary"],
            json!("knowledge_commands_first_wave")
        );
        assert_eq!(
            value["supportedCommands"],
            json!(["ask", "explain", "trace"])
        );
        assert_eq!(value["authorityOwner"], json!("rust"));
        assert_eq!(value["workerRole"], json!("typescript_worker"));
        assert_eq!(value["boundaries"]["localOnly"], json!(true));
        assert_eq!(value["boundaries"]["networkTransport"], json!(false));
        assert_eq!(value["boundaries"]["daemonMode"], json!(false));
        assert_eq!(value["boundaries"]["windowsSupport"], json!(false));
        assert!(contract
            .vocabulary
            .worker_states
            .contains(&WorkerState::SpawnedNotReady));
        assert!(contract
            .vocabulary
            .worker_states
            .contains(&WorkerState::Ready));
        assert!(contract
            .vocabulary
            .health_states
            .contains(&HealthState::Healthy));
        assert!(contract
            .vocabulary
            .health_states
            .contains(&HealthState::Degraded));
        assert!(contract
            .vocabulary
            .final_statuses
            .contains(&FinalStatus::RecoveredDegradedSuccess));

        Ok(())
    }

    #[test]
    fn platform_and_launchability_failures_are_startup_classified() {
        let windows = classify_platform("windows");
        assert!(!windows.supported);
        assert_eq!(
            windows.launchability_issue,
            Some(LaunchabilityIssue::UnsupportedPlatform)
        );

        for issue in [
            LaunchabilityIssue::UnsupportedPlatform,
            LaunchabilityIssue::RuntimeMissing,
            LaunchabilityIssue::RuntimePrerequisiteMismatch,
            LaunchabilityIssue::BundleMissing,
            LaunchabilityIssue::BundleCorrupt,
            LaunchabilityIssue::ProtocolMismatch,
        ] {
            let report = classify_launchability_failure("linux", issue);
            assert_eq!(report.topology, TOPOLOGY_RUST_HOST_TS_WORKER);
            assert_eq!(report.failure_phase, FailurePhase::Startup);
            assert_eq!(report.worker_state, WorkerState::NotRunning);
            assert_eq!(report.health_state, HealthState::Blocked);
            assert_eq!(report.final_status, FinalStatus::StartupFailed);
            assert_eq!(report.final_exit_code, 1);
            assert_eq!(report.launchability_issue, Some(issue));
        }
    }

    #[test]
    fn final_exit_code_mapping_stays_rust_authoritative() {
        assert_eq!(derive_final_exit_code(FinalStatus::CleanSuccess, None), 0);
        assert_eq!(
            derive_final_exit_code(FinalStatus::RecoveredDegradedSuccess, None),
            0
        );
        assert_eq!(
            derive_final_exit_code(FinalStatus::DegradedSuccess, Some(0)),
            0
        );
        assert_eq!(derive_final_exit_code(FinalStatus::RequestFailed, None), 1);
        assert_eq!(
            derive_final_exit_code(FinalStatus::RequestFailed, Some(42)),
            42
        );
        assert_eq!(
            derive_final_exit_code(FinalStatus::StartupFailed, Some(0)),
            1
        );
        assert_eq!(
            derive_final_exit_code(FinalStatus::CleanupIncomplete, Some(0)),
            1
        );
        assert_eq!(derive_final_exit_code(FinalStatus::Cancelled, None), 130);
    }
}
