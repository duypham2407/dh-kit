use crate::bridge::{BridgeRpcRouter, RpcRequest};
use crate::host_lifecycle::{
    report_for_final_status, FailurePhase, FinalStatus, HealthState, HostLifecycleReport,
    RecoveryOutcome, TimeoutClass, WorkerState,
};
use crate::runtime_launch::RuntimeLaunchRequest;
use crate::worker_protocol::{jsonrpc_message_id, jsonrpc_message_method};
use crate::worker_supervisor::{
    ReplaySafety, WorkerRequestOutcome, WorkerSupervisor, WorkerSupervisorConfig,
    WorkerSupervisorError, WorkerSupervisorErrorKind,
};
use anyhow::{Context, Result};
use dh_storage::Database;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const DEFAULT_DB_NAME: &str = "dh-index.db";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostKnowledgeCommandKind {
    Ask,
    Explain,
    Trace,
}

impl HostKnowledgeCommandKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ask => "ask",
            Self::Explain => "explain",
            Self::Trace => "trace",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostKnowledgeCommandRequest {
    pub kind: HostKnowledgeCommandKind,
    pub input: String,
    pub workspace_root: PathBuf,
    pub node_runtime: PathBuf,
    pub worker_entry: PathBuf,
    pub worker_manifest: Option<PathBuf>,
    pub replay_safety: ReplaySafety,
    pub output_json: bool,
    pub resume_session_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RustHostedKnowledgeReport {
    pub command: &'static str,
    pub topology: &'static str,
    pub support_boundary: &'static str,
    pub legacy_path_label: &'static str,
    pub rust_lifecycle: HostLifecycleReport,
    pub worker_result: Option<Value>,
    pub rust_host_notes: Vec<String>,
}

pub fn run_hosted_knowledge_command(
    request: HostKnowledgeCommandRequest,
) -> Result<RustHostedKnowledgeReport> {
    let workspace = request
        .workspace_root
        .canonicalize()
        .unwrap_or_else(|_| request.workspace_root.clone());
    let db_path = workspace.join(DEFAULT_DB_NAME);
    let db = Database::new(&db_path).with_context(|| format!("open db: {}", db_path.display()))?;
    db.initialize()?;

    let mut launch = RuntimeLaunchRequest::new(&request.node_runtime, &request.worker_entry);
    if let Some(manifest) = &request.worker_manifest {
        launch = launch.with_manifest(manifest);
    }
    let config = WorkerSupervisorConfig::new(launch, workspace.clone());

    run_hosted_knowledge_command_with_config(request, &workspace, &db, config)
}

pub fn run_hosted_knowledge_command_with_config(
    request: HostKnowledgeCommandRequest,
    workspace: &Path,
    db: &Database,
    config: WorkerSupervisorConfig,
) -> Result<RustHostedKnowledgeReport> {
    let mut supervisor = WorkerSupervisor::new(config);
    match supervisor.launch() {
        Ok(report) => report,
        Err(error) => {
            return Ok(report_from_supervisor_error(
                request.kind,
                error,
                "Rust host could not launch the TypeScript worker; no legacy fallback was used for this supported path.",
            ));
        }
    };

    let router = BridgeRpcRouter::new(workspace, db);
    let worker_outcome = send_session_run_command(&mut supervisor, &request, workspace, &router);

    match worker_outcome {
        Ok(outcome) => {
            let shutdown = supervisor.shutdown();
            Ok(report_from_worker_success(
                request.kind,
                outcome,
                shutdown,
                None,
            ))
        }
        Err(error) => {
            let original_error_message = error.message.clone();
            let final_response_seen = final_response_seen_for_supervisor_error(&error);
            if final_response_seen {
                let shutdown = supervisor.shutdown();
                let mut report = report_from_supervisor_error(
                    request.kind,
                    error,
                    "Rust host classified a final worker request response as request failure; TypeScript did not provide final lifecycle truth.",
                );
                report.rust_lifecycle = merge_shutdown(report.rust_lifecycle, shutdown);
                return Ok(report);
            }

            let recovery_report = supervisor
                .maybe_recover_after_worker_failure(request.replay_safety, final_response_seen);
            let pre_final_failure_phase = error.report.failure_phase;

            if recovery_report.recovery_outcome == RecoveryOutcome::AttemptedSucceededDegraded {
                match send_session_run_command(&mut supervisor, &request, workspace, &router) {
                    Ok(outcome) => {
                        let shutdown = supervisor.shutdown();
                        Ok(report_from_worker_success(
                            request.kind,
                            outcome,
                            shutdown,
                            Some(format!(
                                "Rust host replay-safe recovery succeeded after a pre-final-response worker failure: {original_error_message}"
                            )),
                        ))
                    }
                    Err(replay_error) => {
                        let shutdown = supervisor.shutdown();
                        let lifecycle = failed_recovery_lifecycle(replay_error.report);
                        let mut report = report_from_lifecycle_error(
                            request.kind,
                            lifecycle,
                            format!(
                                "Rust supervisor error after replay-safe recovery attempt: {}",
                                replay_error.message
                            ),
                            "Rust host attempted one replay-safe recovery, but the replay failed; no further replay was attempted.",
                        );
                        report.rust_lifecycle = merge_shutdown(report.rust_lifecycle, shutdown);
                        Ok(report)
                    }
                }
            } else {
                let shutdown = supervisor.shutdown();
                let lifecycle = lifecycle_for_unreplayed_worker_failure(
                    recovery_report,
                    pre_final_failure_phase,
                );
                let mut report = report_from_lifecycle_error(
                    request.kind,
                    lifecycle,
                    format!("Rust supervisor error: {original_error_message}"),
                    "Rust host did not replay because the request was replay-unsafe or uncertain; TypeScript did not provide final lifecycle truth.",
                );
                report.rust_lifecycle = merge_shutdown(report.rust_lifecycle, shutdown);
                Ok(report)
            }
        }
    }
}

pub fn render_hosted_knowledge_text(report: &RustHostedKnowledgeReport) -> String {
    let mut lines = vec![
        format!("command: {}", report.command),
        format!("topology: {}", report.topology),
        format!("support boundary: {}", report.support_boundary),
        "lifecycle authority: rust".to_string(),
        format!("legacy path label: {}", report.legacy_path_label),
        "rust host lifecycle:".to_string(),
        format!("  worker state: {:?}", report.rust_lifecycle.worker_state),
        format!("  health state: {:?}", report.rust_lifecycle.health_state),
        format!("  failure phase: {:?}", report.rust_lifecycle.failure_phase),
        format!("  timeout class: {:?}", report.rust_lifecycle.timeout_class),
        format!(
            "  recovery outcome: {:?}",
            report.rust_lifecycle.recovery_outcome
        ),
        format!(
            "  cleanup outcome: {:?}",
            report.rust_lifecycle.cleanup_outcome
        ),
        format!("  final status: {:?}", report.rust_lifecycle.final_status),
        format!(
            "  final exit code: {}",
            report.rust_lifecycle.final_exit_code
        ),
    ];

    if let Some(issue) = report.rust_lifecycle.launchability_issue {
        lines.push(format!("  launchability issue: {issue:?}"));
    }

    if let Some(worker_report) = report
        .worker_result
        .as_ref()
        .and_then(|value| value.get("report"))
    {
        lines.push("".to_string());
        lines.push("answer/evidence state:".to_string());
        if let Some(answer_state) = worker_report.get("answerState").and_then(Value::as_str) {
            lines.push(format!("  answer state: {answer_state}"));
        } else {
            lines.push("  answer state: unknown".to_string());
        }
        if let Some(answer_type) = worker_report.get("answerType").and_then(Value::as_str) {
            lines.push(format!("  answer type: {answer_type}"));
        }
        if let Some(question_class) = worker_report.get("questionClass").and_then(Value::as_str) {
            lines.push(format!("  question class: {question_class}"));
        }
        if let Some(requested_question_class) = worker_report
            .get("requestedQuestionClass")
            .and_then(Value::as_str)
        {
            lines.push(format!(
                "  requested question class: {requested_question_class}"
            ));
        }

        if let Some(answer) = worker_report.get("answer").and_then(Value::as_str) {
            lines.push("".to_string());
            lines.push("answer:".to_string());
            lines.push(format!("  {answer}"));
        }
        if let Some(rust_evidence) = worker_report.get("rustEvidence") {
            append_rust_packet_text(&mut lines, rust_evidence);
        }
        if let Some(limitations) = worker_report.get("limitations").and_then(Value::as_array) {
            if !limitations.is_empty() {
                lines.push("limitations:".to_string());
                for limitation in limitations.iter().filter_map(Value::as_str) {
                    lines.push(format!("  - {limitation}"));
                }
            }
        }
        if let Some(message) = worker_report.get("message").and_then(Value::as_str) {
            lines.push("".to_string());
            lines.push("worker message:".to_string());
            lines.push(format!("  {message}"));
        }
    }

    if !report.rust_host_notes.is_empty() {
        lines.push("".to_string());
        lines.push("rust host notes:".to_string());
        lines.extend(
            report
                .rust_host_notes
                .iter()
                .map(|note| format!("  - {note}")),
        );
    }

    lines.join("\n")
}

fn append_rust_packet_text(lines: &mut Vec<String>, rust_evidence: &Value) {
    lines.push("rust packet:".to_string());
    lines.push(format!(
        "  answer state: {}",
        rust_evidence
            .get("answerState")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
    ));
    lines.push(format!(
        "  question class: {}",
        rust_evidence
            .get("questionClass")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
    ));
    for field in ["subject", "summary", "conclusion"] {
        if let Some(value) = rust_evidence.get(field).and_then(Value::as_str) {
            lines.push(format!("  {field}: {value}"));
        }
    }

    lines.push("  evidence:".to_string());
    let evidence = rust_evidence
        .get("evidence")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if evidence.is_empty() {
        lines.push("    - (none)".to_string());
    } else {
        for entry in evidence {
            let file_path = entry
                .get("filePath")
                .or_else(|| entry.get("file_path"))
                .and_then(Value::as_str)
                .unwrap_or("<unknown>");
            let reason = entry
                .get("reason")
                .and_then(Value::as_str)
                .unwrap_or("rust packet evidence");
            let line_start = entry
                .get("lineStart")
                .or_else(|| entry.get("line_start"))
                .and_then(Value::as_i64);
            let line_end = entry
                .get("lineEnd")
                .or_else(|| entry.get("line_end"))
                .and_then(Value::as_i64);
            let location = match (line_start, line_end) {
                (Some(start), Some(end)) => format!("[{start}-{end}]"),
                _ => "[line unknown]".to_string(),
            };
            let kind = entry
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let source = entry
                .get("source")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let confidence = entry
                .get("confidence")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            lines.push(format!(
                "    - {file_path} {location} reason={reason} kind={kind} source={source} confidence={confidence}"
            ));
        }
    }

    lines.push("  gaps:".to_string());
    let gaps = rust_evidence
        .get("gaps")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if gaps.is_empty() {
        lines.push("    - (none)".to_string());
    } else {
        for gap in gaps.iter().filter_map(Value::as_str) {
            lines.push(format!("    - {gap}"));
        }
    }

    lines.push("  bounds:".to_string());
    if let Some(bounds) = rust_evidence.get("bounds").and_then(Value::as_object) {
        let mut wrote_bound = false;
        for field in [
            "traversalScope",
            "traversal_scope",
            "stopReason",
            "stop_reason",
        ] {
            if let Some(value) = bounds.get(field).and_then(Value::as_str) {
                lines.push(format!("    {field}: {value}"));
                wrote_bound = true;
            }
        }
        for field in ["hopCount", "hop_count", "nodeLimit", "node_limit"] {
            if let Some(value) = bounds.get(field).and_then(Value::as_i64) {
                lines.push(format!("    {field}: {value}"));
                wrote_bound = true;
            }
        }
        if !wrote_bound {
            lines.push("    - (none)".to_string());
        }
    } else {
        lines.push("    - (none)".to_string());
    }
}

pub fn render_hosted_knowledge_json(report: &RustHostedKnowledgeReport) -> Result<String> {
    Ok(serde_json::to_string_pretty(report)?)
}

fn session_run_command_params(request: &HostKnowledgeCommandRequest, workspace: &Path) -> Value {
    let mut params = json!({
        "command": request.kind.as_str(),
        "input": request.input,
        "workspaceRoot": workspace,
        "repoRoot": workspace,
        "outputMode": if request.output_json { "json" } else { "text" },
        "replaySafety": request.replay_safety.as_str(),
    });
    if let Some(resume_session_id) = &request.resume_session_id {
        params["resumeSessionId"] = Value::String(resume_session_id.clone());
    }
    params
}

fn send_session_run_command(
    supervisor: &mut WorkerSupervisor,
    request: &HostKnowledgeCommandRequest,
    workspace: &Path,
    router: &BridgeRpcRouter<'_>,
) -> std::result::Result<WorkerRequestOutcome, WorkerSupervisorError> {
    let command_params = session_run_command_params(request, workspace);
    supervisor.send_worker_request_with_host_handler(
        "session.runCommand",
        command_params,
        |worker_message| route_worker_to_host_message(worker_message, router),
    )
}

fn route_worker_to_host_message(message: &Value, router: &BridgeRpcRouter<'_>) -> Option<Value> {
    let id = jsonrpc_message_id(message)?;
    let method = jsonrpc_message_method(message)?.to_string();
    let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
    Some(router.route_worker_query(RpcRequest {
        id: json!(id),
        method,
        params,
    }))
}

fn merge_shutdown(
    lifecycle: HostLifecycleReport,
    shutdown: HostLifecycleReport,
) -> HostLifecycleReport {
    if shutdown.final_status == FinalStatus::CleanupIncomplete {
        return report_for_final_status(
            lifecycle.platform,
            shutdown.worker_state,
            shutdown.health_state,
            if lifecycle.failure_phase == FailurePhase::Request {
                FailurePhase::Request
            } else {
                shutdown.failure_phase
            },
            shutdown.timeout_class,
            lifecycle.recovery_outcome,
            shutdown.cleanup_outcome,
            lifecycle
                .launchability_issue
                .or(shutdown.launchability_issue),
            if lifecycle.final_status == FinalStatus::RequestFailed {
                FinalStatus::RequestFailed
            } else {
                FinalStatus::CleanupIncomplete
            },
            Some(lifecycle.final_exit_code),
        );
    }

    report_for_final_status(
        lifecycle.platform,
        shutdown.worker_state,
        lifecycle.health_state,
        lifecycle.failure_phase,
        lifecycle.timeout_class,
        lifecycle.recovery_outcome,
        shutdown.cleanup_outcome,
        lifecycle.launchability_issue,
        lifecycle.final_status,
        Some(lifecycle.final_exit_code),
    )
}

fn report_from_supervisor_error(
    kind: HostKnowledgeCommandKind,
    error: WorkerSupervisorError,
    note: &str,
) -> RustHostedKnowledgeReport {
    report_from_lifecycle_error(
        kind,
        error.report,
        format!("Rust supervisor error: {}", error.message),
        note,
    )
}

fn report_from_lifecycle_error(
    kind: HostKnowledgeCommandKind,
    lifecycle: HostLifecycleReport,
    error_note: String,
    note: &str,
) -> RustHostedKnowledgeReport {
    RustHostedKnowledgeReport {
        command: kind.as_str(),
        topology: lifecycle.topology,
        support_boundary: lifecycle.support_boundary,
        legacy_path_label: "legacy_ts_host_bridge_compatibility_only",
        rust_lifecycle: lifecycle,
        worker_result: None,
        rust_host_notes: vec![note.into(), error_note],
    }
}

fn report_from_worker_success(
    kind: HostKnowledgeCommandKind,
    outcome: WorkerRequestOutcome,
    shutdown: HostLifecycleReport,
    recovery_note: Option<String>,
) -> RustHostedKnowledgeReport {
    let worker_result = outcome.result;
    let command_exit_code = worker_result
        .get("report")
        .and_then(|report| report.get("exitCode"))
        .and_then(Value::as_i64)
        .map(|code| code as i32);
    let mut lifecycle = outcome.report;
    let final_status = if command_exit_code.unwrap_or(0) != 0 {
        FinalStatus::RequestFailed
    } else if lifecycle.recovery_outcome == RecoveryOutcome::AttemptedSucceededDegraded {
        FinalStatus::RecoveredDegradedSuccess
    } else {
        FinalStatus::CleanSuccess
    };
    lifecycle = report_for_final_status(
        lifecycle.platform,
        WorkerState::Ready,
        health_state_for_final_status(final_status),
        if final_status == FinalStatus::RequestFailed {
            FailurePhase::Request
        } else {
            FailurePhase::None
        },
        TimeoutClass::None,
        lifecycle.recovery_outcome,
        lifecycle.cleanup_outcome,
        lifecycle.launchability_issue,
        final_status,
        command_exit_code,
    );

    lifecycle = merge_shutdown(lifecycle, shutdown);

    let mut rust_host_notes = Vec::new();
    if let Some(note) = recovery_note {
        rust_host_notes.push(note);
        rust_host_notes.push(
            "Recovered command success is intentionally reported as recovered/degraded, not clean first-pass success.".into(),
        );
    }
    rust_host_notes.extend([
        "Rust host launched and supervised the TypeScript worker for this first-wave knowledge command.".into(),
        "TypeScript worker result is command/output evidence only; Rust host lifecycle metadata is authoritative.".into(),
    ]);

    RustHostedKnowledgeReport {
        command: kind.as_str(),
        topology: lifecycle.topology,
        support_boundary: lifecycle.support_boundary,
        legacy_path_label: "legacy_ts_host_bridge_compatibility_only",
        rust_lifecycle: lifecycle,
        worker_result: Some(worker_result),
        rust_host_notes,
    }
}

fn health_state_for_final_status(final_status: FinalStatus) -> HealthState {
    match final_status {
        FinalStatus::CleanSuccess => HealthState::Healthy,
        FinalStatus::RecoveredDegradedSuccess | FinalStatus::DegradedSuccess => {
            HealthState::Degraded
        }
        FinalStatus::StartupFailed
        | FinalStatus::RequestFailed
        | FinalStatus::Cancelled
        | FinalStatus::CleanupIncomplete => HealthState::Unhealthy,
    }
}

fn final_response_seen_for_supervisor_error(error: &WorkerSupervisorError) -> bool {
    matches!(error.kind, WorkerSupervisorErrorKind::RequestFailed)
}

fn failed_recovery_lifecycle(lifecycle: HostLifecycleReport) -> HostLifecycleReport {
    report_for_final_status(
        lifecycle.platform,
        lifecycle.worker_state,
        HealthState::Unhealthy,
        FailurePhase::Request,
        lifecycle.timeout_class,
        RecoveryOutcome::AttemptedFailed,
        lifecycle.cleanup_outcome,
        lifecycle.launchability_issue,
        FinalStatus::RequestFailed,
        None,
    )
}

fn lifecycle_for_unreplayed_worker_failure(
    lifecycle: HostLifecycleReport,
    pre_recovery_failure_phase: FailurePhase,
) -> HostLifecycleReport {
    if pre_recovery_failure_phase == FailurePhase::Startup {
        lifecycle
    } else {
        report_for_final_status(
            lifecycle.platform,
            lifecycle.worker_state,
            lifecycle.health_state,
            FailurePhase::Request,
            lifecycle.timeout_class,
            lifecycle.recovery_outcome,
            lifecycle.cleanup_outcome,
            lifecycle.launchability_issue,
            FinalStatus::RequestFailed,
            None,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host_lifecycle::CleanupOutcome;
    use dh_storage::{Database, FileRepository, SymbolRepository};
    use dh_types::{
        File, FreshnessReason, FreshnessState, LanguageId, ParseStatus, Span, Symbol, SymbolKind,
        Visibility,
    };
    use std::fs;
    use std::time::Duration;

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[cfg(unix)]
    fn make_executable(path: &Path) -> anyhow::Result<()> {
        let mut permissions = fs::metadata(path)?.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions)?;
        Ok(())
    }

    fn setup_db() -> anyhow::Result<(tempfile::TempDir, Database)> {
        let tmp = tempfile::tempdir()?;
        let db_path = tmp.path().join(DEFAULT_DB_NAME);
        let db = Database::new(&db_path)?;
        db.initialize()?;
        db.connection().execute(
            "INSERT INTO workspaces(id, root_path, created_at, updated_at) VALUES (1, ?1, 0, 0)",
            [tmp.path().to_string_lossy().to_string()],
        )?;
        db.connection().execute(
            "INSERT INTO roots(id, workspace_id, abs_path, root_kind, marker_path) VALUES (1, 1, ?1, 'git_root', NULL)",
            [tmp.path().to_string_lossy().to_string()],
        )?;
        db.upsert_file(&File {
            id: 1,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/auth.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 1,
            mtime_unix_ms: 1,
            content_hash: "auth".into(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 1,
            chunk_count: 0,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-host-command".into()),
        })?;
        db.insert_symbols(&[Symbol {
            id: 1,
            workspace_id: 1,
            file_id: 1,
            parent_symbol_id: None,
            kind: SymbolKind::Function,
            name: "auth".into(),
            qualified_name: "auth".into(),
            signature: None,
            detail: None,
            visibility: Visibility::Public,
            exported: true,
            async_flag: false,
            static_flag: false,
            span: Span {
                start_byte: 0,
                end_byte: 1,
                start_line: 1,
                start_column: 0,
                end_line: 1,
                end_column: 1,
            },
            symbol_hash: "auth-symbol".into(),
        }])?;
        Ok((tmp, db))
    }

    #[cfg(unix)]
    fn runtime_fixture(temp: &tempfile::TempDir) -> anyhow::Result<PathBuf> {
        let runtime = temp.path().join("fake-node");
        fs::write(
            &runtime,
            r#"#!/bin/sh
exec /bin/sh "$1"
"#,
        )?;
        make_executable(&runtime)?;
        Ok(runtime)
    }

    #[cfg(unix)]
    fn worker_fixture(temp: &tempfile::TempDir, body: &str) -> anyhow::Result<PathBuf> {
        let worker = temp.path().join("worker.sh");
        fs::write(&worker, body)?;
        make_executable(&worker)?;
        Ok(worker)
    }

    #[cfg(unix)]
    fn replay_recovery_worker_body(marker: &Path) -> String {
        r#"#!/bin/sh
MARKER="__MARKER__"
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
if [ ! -f "$MARKER" ]; then
  touch "$MARKER"
  send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1","workerId":"fixture-first"}}'
  send '{"jsonrpc":"2.0","id":3,"result":{"protocolVersion":"1","workerId":"fixture-first"}}'
  send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
  exit 7
fi
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1","workerId":"fixture-recovered"}}'
send '{"jsonrpc":"2.0","id":3,"result":{"protocolVersion":"1","workerId":"fixture-recovered"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
send '{"jsonrpc":"2.0","id":4,"result":{"report":{"exitCode":0,"command":"ask","answer":"recovered answer","bridgeEvidence":{"rustBacked":true}}}}'
send '{"jsonrpc":"2.0","id":5,"result":{"accepted":true}}'
sleep 0.05
"#
        .replace("__MARKER__", &marker.to_string_lossy())
    }

    #[cfg(unix)]
    fn no_replay_worker_body(first_marker: &Path, replay_marker: &Path) -> String {
        r#"#!/bin/sh
FIRST_MARKER="__FIRST_MARKER__"
REPLAY_MARKER="__REPLAY_MARKER__"
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
if [ ! -f "$FIRST_MARKER" ]; then
  touch "$FIRST_MARKER"
  send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1","workerId":"fixture-first"}}'
  send '{"jsonrpc":"2.0","method":"event.warning","params":{"message":"pre-ready warning queued before crash"}}'
  send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
  exit 7
fi
touch "$REPLAY_MARKER"
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1","workerId":"fixture-replayed"}}'
send '{"jsonrpc":"2.0","id":3,"result":{"protocolVersion":"1","workerId":"fixture-replayed"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
send '{"jsonrpc":"2.0","id":4,"result":{"report":{"exitCode":0,"command":"ask","answer":"should not replay"}}}'
send '{"jsonrpc":"2.0","id":5,"result":{"accepted":true}}'
sleep 0.05
"#
        .replace("__FIRST_MARKER__", &first_marker.to_string_lossy())
        .replace("__REPLAY_MARKER__", &replay_marker.to_string_lossy())
    }

    #[cfg(unix)]
    fn assert_first_wave_command_does_not_replay(
        replay_safety: ReplaySafety,
    ) -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let runtime = runtime_fixture(&tmp)?;
        let first_marker = tmp.path().join("first-worker-crashed");
        let replay_marker = tmp.path().join("unexpected-replay");
        let worker = worker_fixture(&tmp, &no_replay_worker_body(&first_marker, &replay_marker))?;
        let request = HostKnowledgeCommandRequest {
            kind: HostKnowledgeCommandKind::Ask,
            input: "find auth".into(),
            workspace_root: tmp.path().to_path_buf(),
            node_runtime: runtime.clone(),
            worker_entry: worker.clone(),
            worker_manifest: None,
            replay_safety,
            output_json: true,
            resume_session_id: None,
        };
        let mut config = WorkerSupervisorConfig::new(
            RuntimeLaunchRequest::new(runtime, worker).with_platform("linux"),
            tmp.path(),
        )
        .with_ready_timeout(Duration::from_secs(3));
        config.request_timeout = Duration::from_secs(1);
        config.shutdown_timeout = Duration::from_millis(100);

        let report = run_hosted_knowledge_command_with_config(request, tmp.path(), &db, config)?;

        assert!(first_marker.exists());
        assert!(!replay_marker.exists());
        assert_eq!(report.command, "ask");
        assert_eq!(report.rust_lifecycle.failure_phase, FailurePhase::Request);
        assert_eq!(
            report.rust_lifecycle.recovery_outcome,
            RecoveryOutcome::ForbiddenReplayUnsafe
        );
        assert_eq!(
            report.rust_lifecycle.final_status,
            FinalStatus::RequestFailed
        );
        assert_eq!(report.rust_lifecycle.final_exit_code, 1);
        assert!(report.worker_result.is_none());

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn rust_hosted_command_wraps_worker_result_with_authoritative_lifecycle() -> anyhow::Result<()>
    {
        let (tmp, db) = setup_db()?;
        let runtime = runtime_fixture(&tmp)?;
        let worker = worker_fixture(
            &tmp,
            r#"#!/bin/sh
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1","workerId":"fixture"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
send '{"jsonrpc":"2.0","id":2,"result":{"report":{"exitCode":0,"command":"ask","answer":"fixture answer","bridgeEvidence":{"rustBacked":true}}}}'
send '{"jsonrpc":"2.0","id":3,"result":{"accepted":true}}'
sleep 0.05
"#,
        )?;
        let request = HostKnowledgeCommandRequest {
            kind: HostKnowledgeCommandKind::Ask,
            input: "find auth".into(),
            workspace_root: tmp.path().to_path_buf(),
            node_runtime: runtime.clone(),
            worker_entry: worker.clone(),
            worker_manifest: None,
            replay_safety: ReplaySafety::ReplaySafeReadOnly,
            output_json: true,
            resume_session_id: None,
        };
        let mut config = WorkerSupervisorConfig::new(
            RuntimeLaunchRequest::new(runtime, worker).with_platform("linux"),
            tmp.path(),
        )
        .with_ready_timeout(Duration::from_secs(3));
        config.request_timeout = Duration::from_secs(1);
        config.shutdown_timeout = Duration::from_secs(1);

        let report = run_hosted_knowledge_command_with_config(request, tmp.path(), &db, config)?;

        assert_eq!(report.command, "ask");
        assert_eq!(report.topology, "rust_host_ts_worker");
        assert_eq!(
            report.rust_lifecycle.final_status,
            FinalStatus::CleanSuccess
        );
        assert_eq!(
            report.rust_lifecycle.cleanup_outcome,
            CleanupOutcome::Graceful
        );
        assert_eq!(report.rust_lifecycle.final_exit_code, 0);
        assert_eq!(
            report.worker_result.as_ref().unwrap()["report"]["answer"],
            json!("fixture answer")
        );

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn hosted_text_keeps_lifecycle_success_separate_from_unsupported_answer_state(
    ) -> anyhow::Result<()> {
        let lifecycle = report_for_final_status(
            "linux",
            WorkerState::Stopped,
            HealthState::Healthy,
            FailurePhase::None,
            TimeoutClass::None,
            RecoveryOutcome::NotAttempted,
            CleanupOutcome::Graceful,
            None,
            FinalStatus::CleanSuccess,
            Some(0),
        );
        let report = RustHostedKnowledgeReport {
            command: "ask",
            topology: "rust_host_ts_worker",
            support_boundary: "knowledge_commands_first_wave",
            legacy_path_label: "legacy_ts_host_bridge_compatibility_only",
            rust_lifecycle: lifecycle,
            worker_result: Some(json!({
                "report": {
                    "exitCode": 0,
                    "command": "ask",
                    "answer": "Unsupported answer: Auth evidence is unsupported across the bounded Rust packet contract.",
                    "answerType": "unsupported",
                    "answerState": "unsupported",
                    "questionClass": "build_evidence",
                    "requestedQuestionClass": "graph_build_evidence",
                    "rustEvidence": {
                        "answerState": "unsupported",
                        "questionClass": "build_evidence",
                        "subject": "auth",
                        "summary": "Rust packet classified the request as unsupported.",
                        "conclusion": "Auth evidence is unsupported across the bounded Rust packet contract.",
                        "evidence": [],
                        "gaps": ["unsupported language or capability boundary prevents canonical packet proof"],
                        "bounds": {
                            "traversalScope": "build_evidence",
                            "stopReason": "unsupported_language_capability"
                        }
                    },
                    "limitations": ["unsupported language or capability boundary prevents canonical packet proof"]
                }
            })),
            rust_host_notes: vec![
                "Rust host launched and supervised the TypeScript worker for this first-wave knowledge command.".into(),
            ],
        };

        let text = render_hosted_knowledge_text(&report);

        assert!(text.contains("rust host lifecycle:"));
        assert!(text.contains("final status: CleanSuccess"));
        assert!(text.contains("answer/evidence state:"));
        assert!(text.contains("answer state: unsupported"));
        assert!(text.contains("answer type: unsupported"));
        assert!(text.contains("rust packet:"));
        assert!(text.contains("question class: build_evidence"));
        assert!(text.contains(
            "unsupported language or capability boundary prevents canonical packet proof"
        ));
        assert!(text.contains("stopReason: unsupported_language_capability"));

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn first_wave_command_recovered_degraded_success_on_replay_safe_pre_final_worker_crash(
    ) -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let runtime = runtime_fixture(&tmp)?;
        let crash_marker = tmp.path().join("first-worker-crashed");
        let worker = worker_fixture(&tmp, &replay_recovery_worker_body(&crash_marker))?;
        let request = HostKnowledgeCommandRequest {
            kind: HostKnowledgeCommandKind::Ask,
            input: "find auth".into(),
            workspace_root: tmp.path().to_path_buf(),
            node_runtime: runtime.clone(),
            worker_entry: worker.clone(),
            worker_manifest: None,
            replay_safety: ReplaySafety::ReplaySafeReadOnly,
            output_json: true,
            resume_session_id: None,
        };
        let mut config = WorkerSupervisorConfig::new(
            RuntimeLaunchRequest::new(runtime, worker).with_platform("linux"),
            tmp.path(),
        )
        .with_ready_timeout(Duration::from_secs(3));
        config.request_timeout = Duration::from_secs(1);
        config.shutdown_timeout = Duration::from_secs(1);

        let report = run_hosted_knowledge_command_with_config(request, tmp.path(), &db, config)?;

        assert!(crash_marker.exists());
        assert_eq!(report.command, "ask");
        assert_eq!(report.rust_lifecycle.failure_phase, FailurePhase::None);
        assert_eq!(
            report.rust_lifecycle.recovery_outcome,
            RecoveryOutcome::AttemptedSucceededDegraded
        );
        assert_eq!(
            report.rust_lifecycle.final_status,
            FinalStatus::RecoveredDegradedSuccess
        );
        assert_eq!(report.rust_lifecycle.health_state, HealthState::Degraded);
        assert_eq!(report.rust_lifecycle.final_exit_code, 0);
        assert_eq!(
            report.worker_result.as_ref().unwrap()["report"]["answer"],
            json!("recovered answer")
        );
        assert!(report.rust_host_notes.iter().any(|note| note
            .contains("replay-safe recovery succeeded after a pre-final-response worker failure")));

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn first_wave_command_replay_unsafe_pre_final_worker_crash_is_not_replayed(
    ) -> anyhow::Result<()> {
        assert_first_wave_command_does_not_replay(ReplaySafety::ReplayUnsafe)
    }

    #[cfg(unix)]
    #[test]
    fn first_wave_command_uncertain_pre_final_worker_crash_is_not_replayed() -> anyhow::Result<()> {
        assert_first_wave_command_does_not_replay(ReplaySafety::Uncertain)
    }

    #[cfg(unix)]
    #[test]
    fn request_failure_after_ready_is_classified_by_rust_host() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let runtime = runtime_fixture(&tmp)?;
        let worker = worker_fixture(
            &tmp,
            r#"#!/bin/sh
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1","workerId":"fixture"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
send '{"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"request failed after ready"}}'
sleep 0.05
"#,
        )?;
        let request = HostKnowledgeCommandRequest {
            kind: HostKnowledgeCommandKind::Explain,
            input: "auth".into(),
            workspace_root: tmp.path().to_path_buf(),
            node_runtime: runtime.clone(),
            worker_entry: worker.clone(),
            worker_manifest: None,
            replay_safety: ReplaySafety::ReplaySafeReadOnly,
            output_json: true,
            resume_session_id: None,
        };
        let mut config = WorkerSupervisorConfig::new(
            RuntimeLaunchRequest::new(runtime, worker).with_platform("linux"),
            tmp.path(),
        )
        .with_ready_timeout(Duration::from_secs(3));
        config.request_timeout = Duration::from_secs(1);
        config.shutdown_timeout = Duration::from_millis(100);

        let report = run_hosted_knowledge_command_with_config(request, tmp.path(), &db, config)?;

        assert_eq!(report.command, "explain");
        assert_eq!(report.rust_lifecycle.failure_phase, FailurePhase::Request);
        assert_eq!(
            report.rust_lifecycle.final_status,
            FinalStatus::RequestFailed
        );
        assert_eq!(report.rust_lifecycle.final_exit_code, 1);
        assert!(report.worker_result.is_none());

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn worker_reverse_rpc_is_answered_by_rust_host_without_second_spawn() -> anyhow::Result<()> {
        let (tmp, db) = setup_db()?;
        let runtime = runtime_fixture(&tmp)?;
        let worker = worker_fixture(
            &tmp,
            r#"#!/bin/sh
send() {
  body="$1"
  len=${#body}
  printf 'Content-Length: %s\r\n\r\n%s' "$len" "$body"
}
send '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1","workerId":"fixture"}}'
send '{"jsonrpc":"2.0","method":"dh.ready","params":{"ready":true}}'
send '{"jsonrpc":"2.0","id":98,"method":"query.definition","params":{"symbol":"auth","workspaceId":1}}'
send '{"jsonrpc":"2.0","id":2,"result":{"report":{"exitCode":0,"command":"explain","answer":"host query returned"}}}'
send '{"jsonrpc":"2.0","id":3,"result":{"accepted":true}}'
sleep 0.05
"#,
        )?;
        let request = HostKnowledgeCommandRequest {
            kind: HostKnowledgeCommandKind::Explain,
            input: "auth".into(),
            workspace_root: tmp.path().to_path_buf(),
            node_runtime: runtime.clone(),
            worker_entry: worker.clone(),
            worker_manifest: None,
            replay_safety: ReplaySafety::ReplaySafeReadOnly,
            output_json: true,
            resume_session_id: None,
        };
        let mut config = WorkerSupervisorConfig::new(
            RuntimeLaunchRequest::new(runtime, worker).with_platform("linux"),
            tmp.path(),
        )
        .with_ready_timeout(Duration::from_secs(3));
        config.request_timeout = Duration::from_secs(1);
        config.shutdown_timeout = Duration::from_secs(1);

        let report = run_hosted_knowledge_command_with_config(request, tmp.path(), &db, config)?;

        assert_eq!(
            report.rust_lifecycle.final_status,
            FinalStatus::CleanSuccess
        );
        assert_eq!(
            report.worker_result.as_ref().unwrap()["report"]["answer"],
            json!("host query returned")
        );

        Ok(())
    }
}
