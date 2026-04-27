use crate::host_lifecycle::{
    derive_final_exit_code, CleanupOutcome, FailurePhase, FinalStatus, HealthState,
    HostLifecycleReport, LaunchabilityIssue, RecoveryOutcome, TimeoutClass, WorkerState,
    SUPPORT_BOUNDARY_FIRST_WAVE, TOPOLOGY_RUST_HOST_TS_WORKER,
};
use crate::runtime_launch::{check_worker_launchability, LaunchabilityCheck, RuntimeLaunchRequest};
use crate::worker_protocol::{
    jsonrpc_message_error, jsonrpc_message_id, jsonrpc_message_method, jsonrpc_message_result,
    jsonrpc_notification, jsonrpc_request, read_content_length_message,
    write_content_length_message, WORKER_PROTOCOL_VERSION,
};
use serde_json::{json, Value};
use std::io::{self, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, TryRecvError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use std::{error::Error, fmt};

const DEFAULT_READY_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_HEALTH_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(20);
const POST_EXIT_DRAIN_TIMEOUT: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkerSupervisorConfig {
    pub launch: RuntimeLaunchRequest,
    pub workspace_root: PathBuf,
    pub ready_timeout: Duration,
    pub request_timeout: Duration,
    pub health_timeout: Duration,
    pub shutdown_timeout: Duration,
    pub max_replay_safe_restarts: u8,
}

#[allow(dead_code)]
impl WorkerSupervisorConfig {
    pub fn new(launch: RuntimeLaunchRequest, workspace_root: impl Into<PathBuf>) -> Self {
        Self {
            launch,
            workspace_root: workspace_root.into(),
            ready_timeout: DEFAULT_READY_TIMEOUT,
            request_timeout: DEFAULT_REQUEST_TIMEOUT,
            health_timeout: DEFAULT_HEALTH_TIMEOUT,
            shutdown_timeout: DEFAULT_SHUTDOWN_TIMEOUT,
            max_replay_safe_restarts: 1,
        }
    }

    pub fn with_ready_timeout(mut self, timeout: Duration) -> Self {
        self.ready_timeout = timeout;
        self
    }

    pub fn with_request_timeout(mut self, timeout: Duration) -> Self {
        self.request_timeout = timeout;
        self
    }

    pub fn with_health_timeout(mut self, timeout: Duration) -> Self {
        self.health_timeout = timeout;
        self
    }

    pub fn with_shutdown_timeout(mut self, timeout: Duration) -> Self {
        self.shutdown_timeout = timeout;
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum ReplaySafety {
    ReplaySafeReadOnly,
    ReplayUnsafe,
    Uncertain,
}

impl ReplaySafety {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReplaySafeReadOnly => "replay_safe_read_only",
            Self::ReplayUnsafe => "replay_unsafe",
            Self::Uncertain => "uncertain",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkerSupervisorErrorKind {
    LaunchabilityBlocked,
    SpawnFailed,
    ProtocolMismatch,
    WorkerExited,
    WorkerProtocolError,
    RequestFailed,
    Timeout,
    Io,
}

#[derive(Debug, Clone)]
pub struct WorkerSupervisorError {
    pub kind: WorkerSupervisorErrorKind,
    pub message: String,
    pub report: HostLifecycleReport,
}

impl fmt::Display for WorkerSupervisorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl Error for WorkerSupervisorError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkerRequestOutcome {
    pub result: Value,
    pub report: HostLifecycleReport,
}

struct WorkerProcess {
    child: Child,
    stdin: ChildStdin,
    messages: Receiver<WorkerMessage>,
    _stdout_reader: JoinHandle<()>,
    _stderr_drain: Option<JoinHandle<()>>,
}

#[derive(Debug)]
enum WorkerMessage {
    Payload(Value),
    ReadFailed(String),
}

pub struct WorkerSupervisor {
    config: WorkerSupervisorConfig,
    process: Option<WorkerProcess>,
    report: HostLifecycleReport,
    next_request_id: u64,
    recovery_attempts: u8,
    request_phase_started: bool,
    ready_seen: bool,
}

#[allow(dead_code)]
impl WorkerSupervisor {
    pub fn new(config: WorkerSupervisorConfig) -> Self {
        let platform = config.launch.platform.clone();
        Self {
            config,
            process: None,
            report: report_for(
                platform,
                WorkerState::NotRunning,
                HealthState::Unknown,
                FailurePhase::None,
                TimeoutClass::None,
                RecoveryOutcome::NotAttempted,
                CleanupOutcome::NotStarted,
                None,
                FinalStatus::CleanSuccess,
                None,
            ),
            next_request_id: 1,
            recovery_attempts: 0,
            request_phase_started: false,
            ready_seen: false,
        }
    }

    pub fn status_report(&self) -> HostLifecycleReport {
        self.report.clone()
    }

    pub fn launchability(&self) -> LaunchabilityCheck {
        check_worker_launchability(&self.config.launch)
    }

    pub fn launch(&mut self) -> Result<HostLifecycleReport, WorkerSupervisorError> {
        self.force_drop_existing_process();
        self.request_phase_started = false;
        self.ready_seen = false;

        let launchability = check_worker_launchability(&self.config.launch);
        if !launchability.is_launchable() {
            let report = launchability.failure_report.clone().unwrap_or_else(|| {
                startup_failure_report(
                    launchability.platform.clone(),
                    launchability.issue,
                    TimeoutClass::None,
                )
            });
            self.report = report.clone();
            return Err(self.error(
                WorkerSupervisorErrorKind::LaunchabilityBlocked,
                format!(
                    "worker is not launchable: {:?}",
                    launchability
                        .issue
                        .unwrap_or(LaunchabilityIssue::BundleMissing)
                ),
                report,
            ));
        }

        let runtime_path = launchability
            .resolved_runtime_path
            .clone()
            .expect("launchable runtime path should be resolved");
        let worker_entry_path = launchability.worker_entry_path.clone();

        let mut command = Command::new(&runtime_path);
        command.arg(&worker_entry_path);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(err) => {
                let report =
                    startup_failure_report(launchability.platform, None, TimeoutClass::None);
                self.report = report.clone();
                return Err(self.error(
                    WorkerSupervisorErrorKind::SpawnFailed,
                    format!(
                        "failed to spawn TypeScript worker runtime '{}' for entry '{}': {err}",
                        runtime_path.display(),
                        worker_entry_path.display()
                    ),
                    report,
                ));
            }
        };

        let Some(stdin) = child.stdin.take() else {
            let report = startup_failure_report(launchability.platform, None, TimeoutClass::None);
            self.report = report.clone();
            return Err(self.error(
                WorkerSupervisorErrorKind::Io,
                "worker stdin was not available after spawn".into(),
                report,
            ));
        };

        let Some(stdout) = child.stdout.take() else {
            let report = startup_failure_report(launchability.platform, None, TimeoutClass::None);
            self.report = report.clone();
            return Err(self.error(
                WorkerSupervisorErrorKind::Io,
                "worker stdout was not available after spawn".into(),
                report,
            ));
        };

        let stderr = child.stderr.take();
        let (messages, stdout_reader) = spawn_stdout_reader(stdout);
        let stderr_drain = stderr.map(spawn_stderr_drain);

        self.process = Some(WorkerProcess {
            child,
            stdin,
            messages,
            _stdout_reader: stdout_reader,
            _stderr_drain: stderr_drain,
        });

        self.report = report_for(
            launchability.platform.clone(),
            WorkerState::SpawnedNotReady,
            HealthState::Unknown,
            FailurePhase::None,
            TimeoutClass::None,
            RecoveryOutcome::NotAttempted,
            CleanupOutcome::NotStarted,
            None,
            FinalStatus::CleanSuccess,
            None,
        );

        let initialize_result = self.send_request_wait(
            "dh.initialize",
            json!({
                "protocolVersion": WORKER_PROTOCOL_VERSION,
                "topology": TOPOLOGY_RUST_HOST_TS_WORKER,
                "supportBoundary": SUPPORT_BOUNDARY_FIRST_WAVE,
                "workspaceRoot": self.config.workspace_root,
                "platform": launchability.platform,
                "lifecycleAuthority": "rust",
            }),
            self.config.ready_timeout,
            FailurePhase::Startup,
            TimeoutClass::ReadyTimeout,
            &mut |_| None,
        )?;

        if !worker_protocol_matches(
            &initialize_result,
            &self.config.launch.expected_protocol_version,
        ) {
            let report = startup_failure_report(
                self.config.launch.platform.clone(),
                Some(LaunchabilityIssue::ProtocolMismatch),
                TimeoutClass::None,
            );
            self.report = report.clone();
            self.force_drop_existing_process();
            return Err(self.error(
                WorkerSupervisorErrorKind::ProtocolMismatch,
                "worker initialize result did not match the expected protocol version".into(),
                report,
            ));
        }

        let ready_already_seen = match self.send_notification(
            "dh.initialized",
            json!({ "accepted": true }),
            FailurePhase::Startup,
        ) {
            Ok(()) => false,
            Err(error) => {
                if self.accept_queued_ready() {
                    true
                } else {
                    return Err(error);
                }
            }
        };

        if !ready_already_seen {
            self.wait_for_ready(self.config.ready_timeout)?;
        }

        Ok(self.report.clone())
    }

    pub fn ping(&mut self) -> Result<HostLifecycleReport, WorkerSupervisorError> {
        let result = self.send_request_wait(
            "runtime.ping",
            json!({}),
            self.config.health_timeout,
            FailurePhase::Health,
            TimeoutClass::HealthTimeout,
            &mut |_| None,
        )?;

        let worker_state = result
            .get("workerState")
            .and_then(Value::as_str)
            .and_then(parse_worker_state)
            .unwrap_or(WorkerState::Ready);
        let health_state = result
            .get("healthState")
            .and_then(Value::as_str)
            .and_then(parse_health_state)
            .unwrap_or_else(|| {
                if result.get("ok").and_then(Value::as_bool).unwrap_or(false) {
                    HealthState::Healthy
                } else {
                    HealthState::Unhealthy
                }
            });

        self.report = report_for(
            self.report.platform.clone(),
            worker_state,
            health_state,
            FailurePhase::None,
            TimeoutClass::None,
            self.report.recovery_outcome,
            self.report.cleanup_outcome,
            None,
            FinalStatus::CleanSuccess,
            None,
        );

        Ok(self.report.clone())
    }

    pub fn send_worker_request(
        &mut self,
        method: &str,
        params: Value,
    ) -> Result<WorkerRequestOutcome, WorkerSupervisorError> {
        self.send_worker_request_with_host_handler(method, params, |_| None)
    }

    pub fn send_worker_request_with_host_handler(
        &mut self,
        method: &str,
        params: Value,
        mut host_handler: impl FnMut(&Value) -> Option<Value>,
    ) -> Result<WorkerRequestOutcome, WorkerSupervisorError> {
        self.request_phase_started = true;
        self.report.worker_state = WorkerState::Busy;
        let result = self.send_request_wait(
            method,
            params,
            self.config.request_timeout,
            FailurePhase::Request,
            TimeoutClass::RequestTimeout,
            &mut host_handler,
        )?;

        self.report = report_for(
            self.report.platform.clone(),
            WorkerState::Busy,
            self.report.health_state,
            FailurePhase::None,
            TimeoutClass::None,
            self.report.recovery_outcome,
            self.report.cleanup_outcome,
            None,
            FinalStatus::CleanSuccess,
            None,
        );

        Ok(WorkerRequestOutcome {
            result,
            report: self.report.clone(),
        })
    }

    pub fn request_cancel(&mut self) -> HostLifecycleReport {
        let _ = self.send_notification(
            "session.cancel",
            json!({ "reason": "host_cancelled" }),
            FailurePhase::Request,
        );
        self.report = report_for(
            self.report.platform.clone(),
            WorkerState::ShuttingDown,
            self.report.health_state,
            FailurePhase::Request,
            TimeoutClass::None,
            self.report.recovery_outcome,
            self.report.cleanup_outcome,
            None,
            FinalStatus::Cancelled,
            None,
        );
        self.report.clone()
    }

    pub fn shutdown(&mut self) -> HostLifecycleReport {
        if self.process.is_none() {
            self.report = report_for(
                self.report.platform.clone(),
                WorkerState::Stopped,
                HealthState::Unknown,
                FailurePhase::None,
                TimeoutClass::None,
                self.report.recovery_outcome,
                CleanupOutcome::NotStarted,
                None,
                FinalStatus::CleanSuccess,
                None,
            );
            return self.report.clone();
        }

        self.report = report_for(
            self.report.platform.clone(),
            WorkerState::ShuttingDown,
            self.report.health_state,
            FailurePhase::Shutdown,
            TimeoutClass::None,
            self.report.recovery_outcome,
            self.report.cleanup_outcome,
            None,
            FinalStatus::CleanSuccess,
            None,
        );

        let shutdown_response = self.send_request_wait(
            "dh.shutdown",
            json!({}),
            self.config.shutdown_timeout,
            FailurePhase::Shutdown,
            TimeoutClass::ShutdownTimeout,
            &mut |_| None,
        );

        if shutdown_response.is_err() {
            return self.force_cleanup(TimeoutClass::ShutdownTimeout);
        }

        if self
            .wait_for_child_exit(self.config.shutdown_timeout)
            .is_some()
        {
            self.process = None;
            self.report = report_for(
                self.report.platform.clone(),
                WorkerState::Stopped,
                HealthState::Unknown,
                FailurePhase::None,
                TimeoutClass::None,
                self.report.recovery_outcome,
                CleanupOutcome::Graceful,
                None,
                FinalStatus::CleanSuccess,
                None,
            );
            self.report.clone()
        } else {
            self.force_cleanup(TimeoutClass::ShutdownTimeout)
        }
    }

    pub fn maybe_recover_after_worker_failure(
        &mut self,
        replay_safety: ReplaySafety,
        final_response_seen: bool,
    ) -> HostLifecycleReport {
        if replay_safety != ReplaySafety::ReplaySafeReadOnly || final_response_seen {
            self.report = report_for(
                self.report.platform.clone(),
                WorkerState::Stopped,
                HealthState::Unhealthy,
                FailurePhase::Request,
                TimeoutClass::None,
                RecoveryOutcome::ForbiddenReplayUnsafe,
                self.report.cleanup_outcome,
                None,
                FinalStatus::RequestFailed,
                None,
            );
            return self.report.clone();
        }

        if self.recovery_attempts >= self.config.max_replay_safe_restarts {
            self.report = report_for(
                self.report.platform.clone(),
                WorkerState::Stopped,
                HealthState::Unhealthy,
                FailurePhase::Request,
                TimeoutClass::None,
                RecoveryOutcome::AttemptedFailed,
                self.report.cleanup_outcome,
                None,
                FinalStatus::RequestFailed,
                None,
            );
            return self.report.clone();
        }

        self.recovery_attempts += 1;
        self.force_drop_existing_process();

        match self.launch() {
            Ok(_) => {
                self.report = report_for(
                    self.report.platform.clone(),
                    WorkerState::Ready,
                    HealthState::Degraded,
                    FailurePhase::None,
                    TimeoutClass::None,
                    RecoveryOutcome::AttemptedSucceededDegraded,
                    self.report.cleanup_outcome,
                    None,
                    FinalStatus::RecoveredDegradedSuccess,
                    None,
                );
                self.report.clone()
            }
            Err(_) => {
                self.report = report_for(
                    self.report.platform.clone(),
                    WorkerState::Stopped,
                    HealthState::Unhealthy,
                    FailurePhase::Request,
                    TimeoutClass::None,
                    RecoveryOutcome::AttemptedFailed,
                    self.report.cleanup_outcome,
                    self.report.launchability_issue,
                    FinalStatus::RequestFailed,
                    None,
                );
                self.report.clone()
            }
        }
    }

    fn wait_for_ready(&mut self, timeout: Duration) -> Result<(), WorkerSupervisorError> {
        let deadline = Instant::now() + timeout;
        loop {
            let message = self.recv_message_before(deadline).map_err(|failure| {
                self.classify_receive_failure(
                    failure,
                    FailurePhase::Startup,
                    TimeoutClass::ReadyTimeout,
                )
            })?;

            if jsonrpc_message_method(&message) == Some("dh.ready") {
                self.mark_ready_seen();
                return Ok(());
            }
        }
    }

    fn accept_queued_ready(&mut self) -> bool {
        loop {
            let message = match self.process.as_mut() {
                Some(process) => process.messages.try_recv(),
                None => return false,
            };

            match message {
                Ok(WorkerMessage::Payload(payload)) => {
                    if jsonrpc_message_method(&payload) == Some("dh.ready") {
                        self.mark_ready_seen();
                        return true;
                    }
                }
                Ok(WorkerMessage::ReadFailed(_)) => continue,
                Err(TryRecvError::Empty) | Err(TryRecvError::Disconnected) => return false,
            }
        }
    }

    fn mark_ready_seen(&mut self) {
        self.ready_seen = true;
        self.report = report_for(
            self.report.platform.clone(),
            WorkerState::Ready,
            HealthState::Unknown,
            FailurePhase::None,
            TimeoutClass::None,
            self.report.recovery_outcome,
            self.report.cleanup_outcome,
            None,
            FinalStatus::CleanSuccess,
            None,
        );
    }

    fn send_request_wait(
        &mut self,
        method: &str,
        params: Value,
        timeout: Duration,
        failure_phase: FailurePhase,
        timeout_class: TimeoutClass,
        host_handler: &mut impl FnMut(&Value) -> Option<Value>,
    ) -> Result<Value, WorkerSupervisorError> {
        let id = self.next_request_id;
        self.next_request_id += 1;
        let request = jsonrpc_request(id, method, params);
        self.write_message(&request)
            .map_err(|err| self.io_error(failure_phase, timeout_class, err))?;

        let deadline = Instant::now() + timeout;
        loop {
            let message = self.recv_message_before(deadline).map_err(|failure| {
                self.classify_receive_failure(failure, failure_phase, timeout_class)
            })?;

            if jsonrpc_message_method(&message) == Some("dh.ready") {
                self.ready_seen = true;
                continue;
            }

            if jsonrpc_message_id(&message).is_some() && jsonrpc_message_method(&message).is_some()
            {
                if let Some(response) = host_handler(&message) {
                    self.write_message(&response)
                        .map_err(|err| self.io_error(failure_phase, timeout_class, err))?;
                }
                continue;
            }

            if jsonrpc_message_id(&message) != Some(id) {
                continue;
            }

            if let Some(error) = jsonrpc_message_error(&message) {
                let report = report_for(
                    self.report.platform.clone(),
                    self.report.worker_state,
                    HealthState::Unhealthy,
                    failure_phase,
                    TimeoutClass::None,
                    self.report.recovery_outcome,
                    self.report.cleanup_outcome,
                    None,
                    terminal_status_for_phase(failure_phase),
                    None,
                );
                self.report = report.clone();
                return Err(self.error(
                    WorkerSupervisorErrorKind::RequestFailed,
                    format!("worker request '{method}' failed: {error}"),
                    report,
                ));
            }

            return jsonrpc_message_result(&message).cloned().ok_or_else(|| {
                let report = report_for(
                    self.report.platform.clone(),
                    self.report.worker_state,
                    HealthState::Unhealthy,
                    failure_phase,
                    TimeoutClass::None,
                    self.report.recovery_outcome,
                    self.report.cleanup_outcome,
                    None,
                    terminal_status_for_phase(failure_phase),
                    None,
                );
                self.report = report.clone();
                self.error(
                    WorkerSupervisorErrorKind::WorkerProtocolError,
                    format!("worker response to '{method}' did not include result or error"),
                    report,
                )
            });
        }
    }

    fn send_notification(
        &mut self,
        method: &str,
        params: Value,
        failure_phase: FailurePhase,
    ) -> Result<(), WorkerSupervisorError> {
        let notification = jsonrpc_notification(method, params);
        self.write_message(&notification)
            .map_err(|err| self.io_error(failure_phase, TimeoutClass::None, err))
    }

    fn write_message(&mut self, payload: &Value) -> io::Result<()> {
        let Some(process) = self.process.as_mut() else {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "worker process is not running",
            ));
        };
        write_content_length_message(&mut process.stdin, payload)
            .map_err(|err| io::Error::new(io::ErrorKind::BrokenPipe, err.to_string()))
    }

    fn recv_message_before(&mut self, deadline: Instant) -> Result<Value, ReceiveFailure> {
        loop {
            let Some(process) = self.process.as_mut() else {
                return Err(ReceiveFailure::Exited(None));
            };

            match process.messages.try_recv() {
                Ok(WorkerMessage::Payload(payload)) => return Ok(payload),
                Ok(WorkerMessage::ReadFailed(message)) => {
                    return Err(ReceiveFailure::ReadFailed(message))
                }
                Err(TryRecvError::Empty) => {}
                Err(TryRecvError::Disconnected) => {
                    return Err(ReceiveFailure::ReadFailed(
                        "worker stdout reader disconnected".into(),
                    ))
                }
            }

            if let Some(status) = process
                .child
                .try_wait()
                .map_err(|err| ReceiveFailure::ReadFailed(err.to_string()))?
            {
                let drain_timeout = deadline
                    .saturating_duration_since(Instant::now())
                    .min(POST_EXIT_DRAIN_TIMEOUT);
                if !drain_timeout.is_zero() {
                    if let Ok(WorkerMessage::Payload(payload)) =
                        process.messages.recv_timeout(drain_timeout)
                    {
                        return Ok(payload);
                    }
                }
                return Err(ReceiveFailure::Exited(Some(status)));
            }

            let now = Instant::now();
            if now >= deadline {
                return Err(ReceiveFailure::Timeout);
            }
            let remaining = deadline.saturating_duration_since(now).min(POLL_INTERVAL);

            match process.messages.recv_timeout(remaining) {
                Ok(WorkerMessage::Payload(payload)) => return Ok(payload),
                Ok(WorkerMessage::ReadFailed(message)) => {
                    return Err(ReceiveFailure::ReadFailed(message))
                }
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(ReceiveFailure::ReadFailed(
                        "worker stdout reader disconnected".into(),
                    ))
                }
            }
        }
    }

    fn wait_for_child_exit(&mut self, timeout: Duration) -> Option<ExitStatus> {
        let deadline = Instant::now() + timeout;
        loop {
            let process = self.process.as_mut()?;
            match process.child.try_wait() {
                Ok(Some(status)) => return Some(status),
                Ok(None) => {
                    if Instant::now() >= deadline {
                        return None;
                    }
                    thread::sleep(POLL_INTERVAL);
                }
                Err(_) => return None,
            }
        }
    }

    fn force_cleanup(&mut self, timeout_class: TimeoutClass) -> HostLifecycleReport {
        let cleanup_outcome = if let Some(mut process) = self.process.take() {
            match process.child.kill() {
                Ok(()) => {
                    let _ = process.child.wait();
                    CleanupOutcome::Forced
                }
                Err(_) => CleanupOutcome::Incomplete,
            }
        } else {
            CleanupOutcome::Incomplete
        };

        self.report = report_for(
            self.report.platform.clone(),
            WorkerState::Stopped,
            HealthState::Unhealthy,
            FailurePhase::Shutdown,
            timeout_class,
            self.report.recovery_outcome,
            cleanup_outcome,
            self.report.launchability_issue,
            FinalStatus::CleanupIncomplete,
            None,
        );
        self.report.clone()
    }

    fn force_drop_existing_process(&mut self) {
        if let Some(mut process) = self.process.take() {
            if process.child.try_wait().ok().flatten().is_none() {
                let _ = process.child.kill();
            }
            let _ = process.child.wait();
        }
    }

    fn classify_receive_failure(
        &mut self,
        failure: ReceiveFailure,
        failure_phase: FailurePhase,
        timeout_class: TimeoutClass,
    ) -> WorkerSupervisorError {
        let failure_phase = self.actual_failure_phase_for_receive_failure(failure_phase);
        let (kind, message, timeout) = match failure {
            ReceiveFailure::Timeout => (
                WorkerSupervisorErrorKind::Timeout,
                format!("worker response timed out during {failure_phase:?}"),
                timeout_class,
            ),
            ReceiveFailure::Exited(status) => (
                WorkerSupervisorErrorKind::WorkerExited,
                format!("worker exited before expected response: {status:?}"),
                TimeoutClass::None,
            ),
            ReceiveFailure::ReadFailed(message) => (
                WorkerSupervisorErrorKind::WorkerProtocolError,
                format!("worker protocol read failed: {message}"),
                TimeoutClass::None,
            ),
        };

        let report = report_for(
            self.report.platform.clone(),
            self.report.worker_state,
            HealthState::Unhealthy,
            failure_phase,
            timeout,
            self.report.recovery_outcome,
            self.report.cleanup_outcome,
            self.report.launchability_issue,
            terminal_status_for_phase(failure_phase),
            None,
        );
        self.report = report.clone();
        self.error(kind, message, report)
    }

    fn actual_failure_phase_for_receive_failure(
        &self,
        failure_phase: FailurePhase,
    ) -> FailurePhase {
        if self.request_phase_started
            && (self.ready_seen || self.report.worker_state == WorkerState::Busy)
        {
            FailurePhase::Request
        } else {
            failure_phase
        }
    }

    fn io_error(
        &self,
        failure_phase: FailurePhase,
        timeout_class: TimeoutClass,
        err: io::Error,
    ) -> WorkerSupervisorError {
        let report = report_for(
            self.report.platform.clone(),
            self.report.worker_state,
            HealthState::Unhealthy,
            failure_phase,
            timeout_class,
            self.report.recovery_outcome,
            self.report.cleanup_outcome,
            self.report.launchability_issue,
            terminal_status_for_phase(failure_phase),
            None,
        );
        self.error(
            WorkerSupervisorErrorKind::Io,
            format!("worker protocol write failed: {err}"),
            report,
        )
    }

    fn error(
        &self,
        kind: WorkerSupervisorErrorKind,
        message: String,
        report: HostLifecycleReport,
    ) -> WorkerSupervisorError {
        WorkerSupervisorError {
            kind,
            message,
            report,
        }
    }
}

impl Drop for WorkerSupervisor {
    fn drop(&mut self) {
        self.force_drop_existing_process();
    }
}

#[derive(Debug)]
enum ReceiveFailure {
    Timeout,
    Exited(Option<ExitStatus>),
    ReadFailed(String),
}

fn spawn_stdout_reader(
    stdout: impl Read + Send + 'static,
) -> (Receiver<WorkerMessage>, JoinHandle<()>) {
    let (tx, rx) = mpsc::channel();
    let handle = thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_content_length_message(&mut reader) {
                Ok(payload) => {
                    if tx.send(WorkerMessage::Payload(payload)).is_err() {
                        break;
                    }
                }
                Err(err) => {
                    let _ = tx.send(WorkerMessage::ReadFailed(err.to_string()));
                    break;
                }
            }
        }
    });

    (rx, handle)
}

fn spawn_stderr_drain(mut stderr: impl Read + Send + 'static) -> JoinHandle<()> {
    thread::spawn(move || {
        let _ = io::copy(&mut stderr, &mut io::sink());
    })
}

fn worker_protocol_matches(result: &Value, expected_protocol_version: &str) -> bool {
    let advertised = result
        .get("protocolVersion")
        .or_else(|| result.get("workerProtocolVersion"))
        .and_then(Value::as_str);

    advertised
        .map(|version| version == expected_protocol_version)
        .unwrap_or(false)
}

#[allow(dead_code)]
fn parse_worker_state(value: &str) -> Option<WorkerState> {
    match value {
        "not_running" => Some(WorkerState::NotRunning),
        "spawned_not_ready" => Some(WorkerState::SpawnedNotReady),
        "ready" => Some(WorkerState::Ready),
        "busy" => Some(WorkerState::Busy),
        "degraded" => Some(WorkerState::Degraded),
        "shutting_down" => Some(WorkerState::ShuttingDown),
        "stopped" => Some(WorkerState::Stopped),
        _ => None,
    }
}

#[allow(dead_code)]
fn parse_health_state(value: &str) -> Option<HealthState> {
    match value {
        "unknown" => Some(HealthState::Unknown),
        "healthy" => Some(HealthState::Healthy),
        "degraded" => Some(HealthState::Degraded),
        "blocked" => Some(HealthState::Blocked),
        "unhealthy" => Some(HealthState::Unhealthy),
        _ => None,
    }
}

fn terminal_status_for_phase(phase: FailurePhase) -> FinalStatus {
    match phase {
        FailurePhase::Startup => FinalStatus::StartupFailed,
        FailurePhase::Request | FailurePhase::Health => FinalStatus::RequestFailed,
        FailurePhase::Shutdown => FinalStatus::CleanupIncomplete,
        FailurePhase::None => FinalStatus::CleanSuccess,
    }
}

fn startup_failure_report(
    platform: String,
    issue: Option<LaunchabilityIssue>,
    timeout_class: TimeoutClass,
) -> HostLifecycleReport {
    report_for(
        platform,
        WorkerState::NotRunning,
        HealthState::Blocked,
        FailurePhase::Startup,
        timeout_class,
        RecoveryOutcome::NotAttempted,
        CleanupOutcome::NotStarted,
        issue,
        FinalStatus::StartupFailed,
        None,
    )
}

fn report_for(
    platform: String,
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
        platform,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[cfg(unix)]
    fn make_executable(path: &std::path::Path) -> anyhow::Result<()> {
        let mut permissions = fs::metadata(path)?.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions)?;
        Ok(())
    }

    #[cfg(unix)]
    fn write_fixture(path: &std::path::Path, contents: &str) -> anyhow::Result<()> {
        fs::write(path, contents)?;
        make_executable(path)
    }

    #[cfg(unix)]
    fn fake_runtime(temp: &tempfile::TempDir) -> anyhow::Result<PathBuf> {
        let runtime = temp.path().join("fake-node");
        write_fixture(
            &runtime,
            r#"#!/bin/sh
exec /bin/sh "$1"
"#,
        )?;
        Ok(runtime)
    }

    #[cfg(unix)]
    fn worker_fixture(temp: &tempfile::TempDir, body: &str) -> anyhow::Result<PathBuf> {
        let worker = temp.path().join("worker.sh");
        write_fixture(&worker, body)?;
        Ok(worker)
    }

    #[test]
    fn replay_unsafe_failure_is_not_recovered() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let config = WorkerSupervisorConfig::new(
            RuntimeLaunchRequest::new(
                temp.path().join("missing-node"),
                temp.path().join("worker.mjs"),
            )
            .with_platform("linux"),
            temp.path(),
        );
        let mut supervisor = WorkerSupervisor::new(config);

        let report =
            supervisor.maybe_recover_after_worker_failure(ReplaySafety::ReplayUnsafe, false);

        assert_eq!(report.failure_phase, FailurePhase::Request);
        assert_eq!(
            report.recovery_outcome,
            RecoveryOutcome::ForbiddenReplayUnsafe
        );
        assert_eq!(report.final_status, FinalStatus::RequestFailed);

        Ok(())
    }

    #[test]
    fn uncertain_failure_is_not_recovered() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let config = WorkerSupervisorConfig::new(
            RuntimeLaunchRequest::new(
                temp.path().join("missing-node"),
                temp.path().join("worker.mjs"),
            )
            .with_platform("linux"),
            temp.path(),
        );
        let mut supervisor = WorkerSupervisor::new(config);

        let report = supervisor.maybe_recover_after_worker_failure(ReplaySafety::Uncertain, false);

        assert_eq!(report.failure_phase, FailurePhase::Request);
        assert_eq!(
            report.recovery_outcome,
            RecoveryOutcome::ForbiddenReplayUnsafe
        );
        assert_eq!(report.final_status, FinalStatus::RequestFailed);

        Ok(())
    }

    #[test]
    fn request_cancel_reports_rust_host_cancellation_authority() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let config = WorkerSupervisorConfig::new(
            RuntimeLaunchRequest::new(
                temp.path().join("missing-node"),
                temp.path().join("worker.mjs"),
            )
            .with_platform("linux"),
            temp.path(),
        );
        let mut supervisor = WorkerSupervisor::new(config);

        let report = supervisor.request_cancel();

        assert_eq!(report.worker_state, WorkerState::ShuttingDown);
        assert_eq!(report.failure_phase, FailurePhase::Request);
        assert_eq!(report.final_status, FinalStatus::Cancelled);
        assert_eq!(report.final_exit_code, 130);

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn launch_performs_initialize_ready_and_ping_without_production_bundle() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = fake_runtime(&temp)?;
        let worker = worker_fixture(
            &temp,
            r#"#!/bin/sh
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1","workerId":"fixture"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
send '{"jsonrpc":"2.0","id":2,"result":{"ok":true,"workerState":"ready","healthState":"healthy"}}'
send '{"jsonrpc":"2.0","id":3,"result":{"accepted":true}}'
sleep 0.05
"#,
        )?;

        let launch = RuntimeLaunchRequest::new(runtime, worker).with_platform("linux");
        let config = WorkerSupervisorConfig::new(launch, temp.path())
            .with_ready_timeout(Duration::from_secs(3))
            .with_health_timeout(Duration::from_secs(1))
            .with_shutdown_timeout(Duration::from_secs(1));
        let mut supervisor = WorkerSupervisor::new(config);

        let launched = supervisor.launch()?;
        assert_eq!(launched.worker_state, WorkerState::Ready);
        assert_eq!(launched.health_state, HealthState::Unknown);
        assert_eq!(launched.failure_phase, FailurePhase::None);

        let pinged = supervisor.ping()?;
        assert_eq!(pinged.worker_state, WorkerState::Ready);
        assert_eq!(pinged.health_state, HealthState::Healthy);

        let shutdown = supervisor.shutdown();
        assert_eq!(shutdown.worker_state, WorkerState::Stopped);
        assert_eq!(shutdown.cleanup_outcome, CleanupOutcome::Graceful);
        assert_eq!(shutdown.final_status, FinalStatus::CleanSuccess);

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn ready_timeout_is_startup_classified() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = fake_runtime(&temp)?;
        let worker = worker_fixture(
            &temp,
            r#"#!/bin/sh
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1"}}'
sleep 2
"#,
        )?;

        let launch = RuntimeLaunchRequest::new(runtime, worker).with_platform("linux");
        let config = WorkerSupervisorConfig::new(launch, temp.path())
            .with_ready_timeout(Duration::from_millis(100));
        let mut supervisor = WorkerSupervisor::new(config);

        let err = supervisor
            .launch()
            .expect_err("ready timeout should fail launch");
        assert_eq!(err.kind, WorkerSupervisorErrorKind::Timeout);
        assert_eq!(err.report.failure_phase, FailurePhase::Startup);
        assert_eq!(err.report.timeout_class, TimeoutClass::ReadyTimeout);
        assert_eq!(err.report.final_status, FinalStatus::StartupFailed);

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn missing_initialize_protocol_version_is_startup_protocol_mismatch() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = fake_runtime(&temp)?;
        let worker = worker_fixture(
            &temp,
            r#"#!/bin/sh
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
send '{"jsonrpc":"2.0","id":1,"result":{"workerId":"fixture"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
sleep 0.05
"#,
        )?;

        let launch = RuntimeLaunchRequest::new(runtime, worker).with_platform("linux");
        let config = WorkerSupervisorConfig::new(launch, temp.path())
            .with_ready_timeout(Duration::from_secs(3));
        let mut supervisor = WorkerSupervisor::new(config);

        let err = supervisor
            .launch()
            .expect_err("missing protocol version should fail launch");
        assert_eq!(err.kind, WorkerSupervisorErrorKind::ProtocolMismatch);
        assert_eq!(err.report.failure_phase, FailurePhase::Startup);
        assert_eq!(
            err.report.launchability_issue,
            Some(LaunchabilityIssue::ProtocolMismatch)
        );
        assert_eq!(err.report.final_status, FinalStatus::StartupFailed);

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn worker_request_error_is_request_classified_after_ready() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = fake_runtime(&temp)?;
        let worker = worker_fixture(
            &temp,
            r#"#!/bin/sh
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
send '{"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"fixture request failed"}}'
sleep 0.05
"#,
        )?;

        let launch = RuntimeLaunchRequest::new(runtime, worker).with_platform("linux");
        let config = WorkerSupervisorConfig::new(launch, temp.path())
            .with_ready_timeout(Duration::from_secs(3))
            .with_request_timeout(Duration::from_secs(1));
        let mut supervisor = WorkerSupervisor::new(config);

        supervisor.launch()?;
        let err = supervisor
            .send_worker_request("session.runCommand", json!({ "command": "ask" }))
            .expect_err("worker request error should fail as request");

        assert_eq!(err.kind, WorkerSupervisorErrorKind::RequestFailed);
        assert_eq!(err.report.failure_phase, FailurePhase::Request);
        assert_eq!(err.report.final_status, FinalStatus::RequestFailed);
        assert_eq!(err.report.final_exit_code, 1);

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn shutdown_timeout_forces_cleanup_and_reports_incomplete_status() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = fake_runtime(&temp)?;
        let worker = worker_fixture(
            &temp,
            r#"#!/bin/sh
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
send '{"jsonrpc":"2.0","id":2,"result":{"accepted":true}}'
sleep 2
"#,
        )?;

        let launch = RuntimeLaunchRequest::new(runtime, worker).with_platform("linux");
        let config = WorkerSupervisorConfig::new(launch, temp.path())
            .with_ready_timeout(Duration::from_secs(3))
            .with_shutdown_timeout(Duration::from_millis(100));
        let mut supervisor = WorkerSupervisor::new(config);

        supervisor.launch()?;
        let shutdown = supervisor.shutdown();

        assert_eq!(shutdown.failure_phase, FailurePhase::Shutdown);
        assert_eq!(shutdown.timeout_class, TimeoutClass::ShutdownTimeout);
        assert_eq!(shutdown.cleanup_outcome, CleanupOutcome::Forced);
        assert_eq!(shutdown.final_status, FinalStatus::CleanupIncomplete);
        assert_eq!(shutdown.final_exit_code, 1);

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn one_replay_safe_recovery_attempt_relaunches_as_degraded() -> anyhow::Result<()> {
        let temp = tempfile::tempdir()?;
        let runtime = fake_runtime(&temp)?;
        let worker = worker_fixture(
            &temp,
            r#"#!/bin/sh
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
sleep 1
"#,
        )?;

        let launch = RuntimeLaunchRequest::new(runtime, worker).with_platform("linux");
        let config = WorkerSupervisorConfig::new(launch, temp.path())
            .with_ready_timeout(Duration::from_secs(3));
        let mut supervisor = WorkerSupervisor::new(config);

        let report =
            supervisor.maybe_recover_after_worker_failure(ReplaySafety::ReplaySafeReadOnly, false);

        assert_eq!(report.worker_state, WorkerState::Ready);
        assert_eq!(report.health_state, HealthState::Degraded);
        assert_eq!(
            report.recovery_outcome,
            RecoveryOutcome::AttemptedSucceededDegraded
        );
        assert_eq!(report.final_status, FinalStatus::RecoveredDegradedSuccess);

        let second =
            supervisor.maybe_recover_after_worker_failure(ReplaySafety::ReplaySafeReadOnly, false);
        assert_eq!(second.recovery_outcome, RecoveryOutcome::AttemptedFailed);
        assert_eq!(second.final_status, FinalStatus::RequestFailed);

        Ok(())
    }
}
