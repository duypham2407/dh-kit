# Rust Runtime Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Rust the lifecycle authority for existing DH knowledge and lane command paths, while preserving TypeScript workflow logic behind the worker boundary and keeping direct TypeScript lane execution available only through an explicit compatibility flag.

**Architecture:** Rust already owns first-wave knowledge lifecycle and has `quick`, `delivery`, and `migrate` engine subcommands. This milestone closes the remaining authority gap by adding a stable runtime-authority contract, normalizing Rust-hosted lane envelopes, routing TypeScript CLI lane commands through the Rust engine by default, and updating doctor/parity/help output so DH no longer claims the lane path is TypeScript-hosted. TypeScript still owns workflow body execution, provider calls, and stage-specific business logic; Rust owns launchability, worker supervision, session identity capture, final status, degraded reason, and top-level exit.

**Tech Stack:** Rust `dh-engine`, TypeScript ESM CLI/runtime packages, Vitest, Cargo tests, JSON command envelopes, existing worker JSON-RPC stdio protocol.

---

## File Structure

- Modify: `rust-engine/crates/dh-engine/src/host_lifecycle.rs`
  - Add runtime-authority family vocabulary and expose it through `LifecycleContract`.
- Modify: `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - Add `session.runLane` to host-to-worker protocol truth and expose runtime-authority families in `WorkerProtocolContract`.
- Modify: `rust-engine/crates/dh-engine/src/host_commands.rs`
  - Replace lane-as-ask sentinel reporting with first-class lane report metadata, `runtimeAuthority`, `sessionId`, `finalStatus`, and `degradedReason`.
- Modify: `rust-engine/crates/dh-engine/src/main.rs`
  - Render lane reports through the same envelope renderer and keep launchability failure JSON in the new envelope shape.
- Create: `packages/shared/src/types/runtime-authority.ts`
  - Define TypeScript-facing runtime authority fields shared by CLI presenters and workflow reports.
- Modify: `packages/opencode-app/src/workflows/run-lane-command.ts`
  - Mark direct TypeScript lane workflow as explicit compatibility mode in returned reports.
- Create: `packages/opencode-app/src/workflows/run-rust-hosted-lane-command.ts`
  - Spawn the Rust engine lane command, parse its JSON envelope, and adapt it into `LaneWorkflowReport`.
- Create: `packages/opencode-app/src/workflows/run-rust-hosted-lane-command.test.ts`
  - Prove Rust-hosted lane adapter preserves authority/session/final status and that failures are degraded honestly.
- Modify: `apps/cli/src/runtime-client.ts`
  - Route `runLane` to Rust-hosted lane adapter by default; use direct TypeScript lane only when `DH_ENABLE_TS_LANE_COMPAT=1`.
- Modify: `apps/cli/src/commands/root.ts`
  - Update help text from TypeScript-hosted lane compatibility to Rust-hosted lane lifecycle authority.
- Modify: `apps/cli/src/presenters/lane-workflow.ts`
  - Show runtime authority, final status, and degraded reason when present.
- Modify: `apps/cli/src/presenters/lane-workflow.test.ts`
  - Verify text and JSON presenter output.
- Modify: `packages/opencode-app/src/worker/worker-main.ts`
  - Include `runtimeAuthority: "typescript_worker"` in `session.runLane` worker results for Rust to wrap.
- Modify: `packages/opencode-app/src/worker/host-bridge-client.ts`
  - Advertise runtime-authority capability fields from host-backed bridge initialization snapshots.
- Modify: `packages/opencode-app/src/worker/host-bridge-client.test.ts`
  - Verify authority capability fields.
- Modify: `packages/runtime/src/session/session-manager.ts`
  - Add a small metadata marker to session bootstrap checkpoints showing whether the caller is `rust_host` or `typescript_compatibility`.
- Modify: `packages/runtime/src/workflow/stage-runner.ts`
  - Carry authority metadata through post-stage checkpoints.
- Modify: `packages/storage/src/sqlite/repositories/sessions-repo.ts`
  - Keep existing schema and add a `findLatestByLane()` helper for verification and manual inspection.
- Modify: `packages/runtime/src/diagnostics/parity-report.ts`
  - Move runtime/lane parity status forward after Rust-hosted lane routing exists.
- Modify tests near each touched module.

## Contract Shape

Rust-hosted command JSON must include these top-level fields:

```json
{
  "command": "quick",
  "commandFamily": "lane",
  "runtimeAuthority": "rust",
  "sessionId": "session-...",
  "finalStatus": "clean_success",
  "degradedReason": null,
  "rustLifecycle": {
    "finalStatus": "clean_success",
    "finalExitCode": 0
  },
  "workerResult": {
    "exitCode": 0,
    "lane": "quick"
  }
}
```

Direct TypeScript compatibility lane reports must include:

```json
{
  "runtimeAuthority": "typescript_compatibility",
  "finalStatus": "typescript_compatibility",
  "degradedReason": "Direct TypeScript lane execution is a compatibility path; Rust did not own lifecycle for this run."
}
```

## Task 1: Rust Runtime-Authority Contract

**Files:**
- Modify: `rust-engine/crates/dh-engine/src/host_lifecycle.rs`
- Modify: `rust-engine/crates/dh-engine/src/worker_protocol.rs`

- [ ] **Step 1: Write failing Rust contract tests**

In `rust-engine/crates/dh-engine/src/host_lifecycle.rs`, extend `contract_freezes_required_vocabulary_and_boundaries` with:

```rust
assert_eq!(value["runtimeAuthority"]["owner"], json!("rust"));
assert_eq!(
    value["runtimeAuthority"]["families"],
    json!([
        {"family":"knowledge","state":"supported","owner":"rust"},
        {"family":"lane","state":"supported","owner":"rust"},
        {"family":"run","state":"planned","owner":"rust"},
        {"family":"session","state":"partial","owner":"rust"},
        {"family":"provider","state":"planned","owner":"rust"},
        {"family":"mcp","state":"planned","owner":"rust"},
        {"family":"tool","state":"planned","owner":"rust"}
    ])
);
assert!(contract.boundaries.workflow_lane_parity);
```

In `rust-engine/crates/dh-engine/src/worker_protocol.rs`, extend `worker_protocol_contract_freezes_first_wave_methods_and_transport` with:

```rust
assert!(contract.host_to_worker_request_methods.contains(&"session.runLane"));
assert_eq!(serde_json::to_value(&contract.runtime_authority)?["owner"], json!("rust"));
```

- [ ] **Step 2: Run tests to verify RED**

Run: `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine host_lifecycle::tests::contract_freezes_required_vocabulary_and_boundaries worker_protocol::tests::worker_protocol_contract_freezes_first_wave_methods_and_transport`

Expected: FAIL because `runtimeAuthority`, `runtime_authority`, and `session.runLane` are absent.

- [ ] **Step 3: Add runtime-authority structs**

In `rust-engine/crates/dh-engine/src/host_lifecycle.rs`, add:

```rust
pub const SUPPORT_BOUNDARY_RUNTIME_AUTHORITY_SPINE: &str = "runtime_authority_spine";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeAuthorityFamily {
    Knowledge,
    Lane,
    Run,
    Session,
    Provider,
    Mcp,
    Tool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeAuthorityState {
    Supported,
    Partial,
    Planned,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAuthorityFamilyContract {
    pub family: RuntimeAuthorityFamily,
    pub state: RuntimeAuthorityState,
    pub owner: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAuthorityContract {
    pub owner: &'static str,
    pub families: Vec<RuntimeAuthorityFamilyContract>,
}
```

Add this field to `LifecycleContract`:

```rust
pub runtime_authority: RuntimeAuthorityContract,
```

Add this helper:

```rust
pub fn runtime_authority_contract() -> RuntimeAuthorityContract {
    RuntimeAuthorityContract {
        owner: LIFECYCLE_AUTHORITY_OWNER,
        families: vec![
            RuntimeAuthorityFamilyContract { family: RuntimeAuthorityFamily::Knowledge, state: RuntimeAuthorityState::Supported, owner: LIFECYCLE_AUTHORITY_OWNER },
            RuntimeAuthorityFamilyContract { family: RuntimeAuthorityFamily::Lane, state: RuntimeAuthorityState::Supported, owner: LIFECYCLE_AUTHORITY_OWNER },
            RuntimeAuthorityFamilyContract { family: RuntimeAuthorityFamily::Run, state: RuntimeAuthorityState::Planned, owner: LIFECYCLE_AUTHORITY_OWNER },
            RuntimeAuthorityFamilyContract { family: RuntimeAuthorityFamily::Session, state: RuntimeAuthorityState::Partial, owner: LIFECYCLE_AUTHORITY_OWNER },
            RuntimeAuthorityFamilyContract { family: RuntimeAuthorityFamily::Provider, state: RuntimeAuthorityState::Planned, owner: LIFECYCLE_AUTHORITY_OWNER },
            RuntimeAuthorityFamilyContract { family: RuntimeAuthorityFamily::Mcp, state: RuntimeAuthorityState::Planned, owner: LIFECYCLE_AUTHORITY_OWNER },
            RuntimeAuthorityFamilyContract { family: RuntimeAuthorityFamily::Tool, state: RuntimeAuthorityState::Planned, owner: LIFECYCLE_AUTHORITY_OWNER },
        ],
    }
}
```

Inside `lifecycle_contract()`, set:

```rust
support_boundary: SUPPORT_BOUNDARY_RUNTIME_AUTHORITY_SPINE,
supported_commands: vec!["ask", "explain", "trace", "quick", "delivery", "migrate"],
runtime_authority: runtime_authority_contract(),
boundaries: LifecycleBoundaries {
    local_only: true,
    network_transport: false,
    daemon_mode: false,
    windows_support: false,
    generic_process_supervisor: false,
    workflow_lane_parity: true,
},
```

- [ ] **Step 4: Update worker protocol contract**

In `rust-engine/crates/dh-engine/src/worker_protocol.rs`, update constants:

```rust
pub const HOST_TO_WORKER_REQUEST_METHODS: [&str; 5] = [
    "session.runCommand",
    "session.runLane",
    "runtime.ping",
    "session.cancel",
    "dh.shutdown",
];

pub const BRIDGE_LIFECYCLE_CONTROL_METHODS: [&str; 6] = [
    "dh.initialized",
    "dh.ready",
    "session.runCommand",
    "session.runLane",
    "runtime.ping",
    "dh.shutdown",
];
```

Import `RuntimeAuthorityContract` and add to `WorkerProtocolContract`:

```rust
pub runtime_authority: RuntimeAuthorityContract,
```

Set it in `worker_protocol_contract()`:

```rust
runtime_authority: crate::host_lifecycle::runtime_authority_contract(),
```

- [ ] **Step 5: Run tests to verify GREEN**

Run: `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine host_lifecycle::tests::contract_freezes_required_vocabulary_and_boundaries worker_protocol::tests::worker_protocol_contract_freezes_first_wave_methods_and_transport`

Expected: PASS.

## Task 2: Normalize Rust-Hosted Command Envelope

**Files:**
- Modify: `rust-engine/crates/dh-engine/src/host_commands.rs`
- Modify: `rust-engine/crates/dh-engine/src/main.rs`

- [ ] **Step 1: Write failing Rust host command tests**

In `rust-engine/crates/dh-engine/src/host_commands.rs`, add this test inside `mod tests`:

```rust
#[test]
fn lane_report_uses_lane_identity_and_authority_envelope() {
    let lifecycle = report_for_final_status(
        "linux",
        WorkerState::Ready,
        HealthState::Healthy,
        FailurePhase::None,
        TimeoutClass::None,
        RecoveryOutcome::NotAttempted,
        CleanupOutcome::Graceful,
        None,
        FinalStatus::CleanSuccess,
        Some(0),
    );
    let outcome = WorkerRequestOutcome {
        result: serde_json::json!({
            "exitCode": 0,
            "lane": "quick",
            "sessionId": "session-rust-lane",
            "workflowSummary": ["lane ran"]
        }),
        report: lifecycle.clone(),
    };
    let report = report_from_lane_worker_success(
        dh_types::WorkflowLane::Quick,
        outcome,
        lifecycle,
        None,
    );

    assert_eq!(report.command, "quick");
    assert_eq!(report.command_family, "lane");
    assert_eq!(report.runtime_authority, "rust");
    assert_eq!(report.session_id.as_deref(), Some("session-rust-lane"));
    assert_eq!(report.final_status, FinalStatus::CleanSuccess);
    assert_eq!(report.degraded_reason, None);
}
```

- [ ] **Step 2: Run test to verify RED**

Run: `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine host_commands::tests::lane_report_uses_lane_identity_and_authority_envelope`

Expected: FAIL because `report_from_lane_worker_success` and the new fields are absent.

- [ ] **Step 3: Replace sentinel report fields**

In `rust-engine/crates/dh-engine/src/host_commands.rs`, change `RustHostedKnowledgeReport` to:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RustHostedKnowledgeReport {
    pub command: String,
    pub command_family: &'static str,
    pub runtime_authority: &'static str,
    pub session_id: Option<String>,
    pub final_status: FinalStatus,
    pub degraded_reason: Option<String>,
    pub topology: &'static str,
    pub support_boundary: &'static str,
    pub legacy_path_label: &'static str,
    pub rust_lifecycle: HostLifecycleReport,
    pub worker_result: Option<Value>,
    pub rust_host_notes: Vec<String>,
}
```

Update `report_from_lifecycle_error()` to set:

```rust
command: kind.as_str().to_string(),
command_family: "knowledge",
runtime_authority: "rust",
session_id: None,
final_status: lifecycle.final_status,
degraded_reason: Some(error_note.clone()),
```

Update `report_from_worker_success()` to set:

```rust
command: kind.as_str().to_string(),
command_family: "knowledge",
runtime_authority: "rust",
session_id: session_id_from_worker_result(&worker_result),
final_status: lifecycle.final_status,
degraded_reason: degraded_reason_for_lifecycle(&lifecycle, recovery_note.as_deref()),
```

Add helpers:

```rust
fn session_id_from_worker_result(worker_result: &Value) -> Option<String> {
    worker_result
        .get("sessionId")
        .or_else(|| worker_result.get("report").and_then(|report| report.get("sessionId")))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn degraded_reason_for_lifecycle(
    lifecycle: &HostLifecycleReport,
    recovery_note: Option<&str>,
) -> Option<String> {
    if let Some(note) = recovery_note {
        return Some(note.to_string());
    }
    match lifecycle.final_status {
        FinalStatus::CleanSuccess => None,
        FinalStatus::RecoveredDegradedSuccess => Some("Rust host recovered after a pre-final worker failure.".into()),
        FinalStatus::DegradedSuccess => Some("Rust host completed with degraded health.".into()),
        FinalStatus::StartupFailed => Some("Rust host startup failed before worker execution.".into()),
        FinalStatus::RequestFailed => Some("Rust host request failed during worker execution.".into()),
        FinalStatus::Cancelled => Some("Rust host cancelled the command.".into()),
        FinalStatus::CleanupIncomplete => Some("Rust host cleanup was incomplete.".into()),
    }
}

fn lane_command_name(lane: dh_types::WorkflowLane) -> &'static str {
    match lane {
        dh_types::WorkflowLane::Quick => "quick",
        dh_types::WorkflowLane::Delivery => "delivery",
        dh_types::WorkflowLane::Migration => "migrate",
    }
}
```

- [ ] **Step 4: Add lane-specific success/error reports**

In `rust-engine/crates/dh-engine/src/host_commands.rs`, add:

```rust
fn report_from_lane_worker_success(
    lane: dh_types::WorkflowLane,
    outcome: WorkerRequestOutcome,
    shutdown: HostLifecycleReport,
    recovery_note: Option<String>,
) -> RustHostedKnowledgeReport {
    let worker_result = outcome.result;
    let command_exit_code = worker_result
        .get("exitCode")
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
        if final_status == FinalStatus::RequestFailed { FailurePhase::Request } else { FailurePhase::None },
        TimeoutClass::None,
        lifecycle.recovery_outcome,
        lifecycle.cleanup_outcome,
        lifecycle.launchability_issue,
        final_status,
        command_exit_code,
    );
    lifecycle = merge_shutdown(lifecycle, shutdown);
    let degraded_reason = degraded_reason_for_lifecycle(&lifecycle, recovery_note.as_deref());

    RustHostedKnowledgeReport {
        command: lane_command_name(lane).to_string(),
        command_family: "lane",
        runtime_authority: "rust",
        session_id: session_id_from_worker_result(&worker_result),
        final_status: lifecycle.final_status,
        degraded_reason,
        topology: lifecycle.topology,
        support_boundary: lifecycle.support_boundary,
        legacy_path_label: "legacy_ts_host_bridge_compatibility_only",
        rust_lifecycle: lifecycle,
        worker_result: Some(worker_result),
        rust_host_notes: vec![
            "Rust host launched and supervised the TypeScript worker for this lane workflow.".into(),
            "TypeScript worker result is workflow body output only; Rust host lifecycle metadata is authoritative.".into(),
        ],
    }
}
```

In `run_hosted_lane_command()`, replace `report_from_worker_success(HostKnowledgeCommandKind::Ask, ...)` with `report_from_lane_worker_success(request.lane, ...)`. Replace lane failure sentinel with a lane-aware error helper:

```rust
fn report_from_lane_lifecycle_error(
    lane: dh_types::WorkflowLane,
    lifecycle: HostLifecycleReport,
    error_note: String,
    note: &str,
) -> RustHostedKnowledgeReport {
    RustHostedKnowledgeReport {
        command: lane_command_name(lane).to_string(),
        command_family: "lane",
        runtime_authority: "rust",
        session_id: None,
        final_status: lifecycle.final_status,
        degraded_reason: Some(error_note.clone()),
        topology: lifecycle.topology,
        support_boundary: lifecycle.support_boundary,
        legacy_path_label: "legacy_ts_host_bridge_compatibility_only",
        rust_lifecycle: lifecycle,
        worker_result: None,
        rust_host_notes: vec![note.into(), error_note],
    }
}
```

- [ ] **Step 5: Update renderer**

In `render_hosted_knowledge_text()`, insert after `command`:

```rust
format!("command family: {}", report.command_family),
format!("runtime authority: {}", report.runtime_authority),
format!("final status: {:?}", report.final_status),
format!("degraded reason: {}", report.degraded_reason.as_deref().unwrap_or("<none>")),
```

If `report.session_id` is present, append:

```rust
lines.push(format!("session id: {session_id}"));
```

- [ ] **Step 6: Run Rust host command tests**

Run: `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine host_commands`

Expected: PASS.

## Task 3: TypeScript Runtime Authority Types And Direct Compatibility Marking

**Files:**
- Create: `packages/shared/src/types/runtime-authority.ts`
- Modify: `packages/opencode-app/src/workflows/run-lane-command.ts`
- Modify: `packages/opencode-app/src/workflows/run-lane-command.test.ts`

- [ ] **Step 1: Write failing lane workflow test**

In `packages/opencode-app/src/workflows/run-lane-command.test.ts`, add:

```ts
  it("marks direct TypeScript lane execution as compatibility-only", async () => {
    const repo = makeTmpRepo();

    const report = await runLaneWorkflow({
      lane: "quick",
      objective: "compatibility run",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.runtimeAuthority).toBe("typescript_compatibility");
    expect(report.finalStatus).toBe("typescript_compatibility");
    expect(report.degradedReason).toContain("Direct TypeScript lane execution is a compatibility path");
  });
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- run-lane-command`

Expected: FAIL because the new fields are absent.

- [ ] **Step 3: Add shared TS runtime authority types**

Create `packages/shared/src/types/runtime-authority.ts`:

```ts
export type RuntimeAuthorityOwner = "rust" | "typescript_worker" | "typescript_compatibility";

export type RuntimeAuthorityFinalStatus =
  | "clean_success"
  | "recovered_degraded_success"
  | "degraded_success"
  | "startup_failed"
  | "request_failed"
  | "cancelled"
  | "cleanup_incomplete"
  | "typescript_compatibility";

export type RuntimeAuthorityFields = {
  runtimeAuthority: RuntimeAuthorityOwner;
  finalStatus: RuntimeAuthorityFinalStatus;
  degradedReason?: string | null;
  hostLifecycle?: {
    topology: string;
    supportBoundary: string;
    finalStatus: string;
    finalExitCode: number;
    workerState?: string;
    healthState?: string;
    failurePhase?: string;
    timeoutClass?: string;
    recoveryOutcome?: string;
    cleanupOutcome?: string;
  };
};
```

- [ ] **Step 4: Extend `LaneWorkflowReport`**

In `packages/opencode-app/src/workflows/run-lane-command.ts`, import:

```ts
import type { RuntimeAuthorityFields } from "../../../shared/src/types/runtime-authority.js";
```

Change:

```ts
export type LaneWorkflowReport = {
```

to:

```ts
export type LaneWorkflowReport = RuntimeAuthorityFields & {
```

For every early failure return, add:

```ts
runtimeAuthority: "typescript_compatibility",
finalStatus: "typescript_compatibility",
degradedReason: "Direct TypeScript lane execution is a compatibility path; Rust did not own lifecycle for this run.",
```

For the successful final return, add the same three fields.

- [ ] **Step 5: Run lane tests to verify GREEN**

Run: `npm test -- run-lane-command`

Expected: PASS.

## Task 4: Rust-Hosted Lane Adapter For TypeScript CLI

**Files:**
- Create: `packages/opencode-app/src/workflows/run-rust-hosted-lane-command.ts`
- Create: `packages/opencode-app/src/workflows/run-rust-hosted-lane-command.test.ts`
- Modify: `apps/cli/src/runtime-client.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `packages/opencode-app/src/workflows/run-rust-hosted-lane-command.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { runRustHostedLaneWorkflow } from "./run-rust-hosted-lane-command.js";

describe("runRustHostedLaneWorkflow", () => {
  it("adapts Rust-hosted lane JSON into LaneWorkflowReport", async () => {
    const report = await runRustHostedLaneWorkflow({
      lane: "quick",
      objective: "inspect runtime authority",
      repoRoot: "/repo",
      spawnEngine: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          command: "quick",
          commandFamily: "lane",
          runtimeAuthority: "rust",
          sessionId: "session-rust-1",
          finalStatus: "clean_success",
          degradedReason: null,
          rustLifecycle: {
            topology: "rust_host_ts_worker",
            supportBoundary: "runtime_authority_spine",
            workerState: "ready",
            healthState: "healthy",
            failurePhase: "none",
            timeoutClass: "none",
            recoveryOutcome: "not_attempted",
            cleanupOutcome: "graceful",
            finalStatus: "clean_success",
            finalExitCode: 0
          },
          workerResult: {
            exitCode: 0,
            lane: "quick",
            sessionId: "session-rust-1",
            stage: "quick_execute",
            agent: "Quick Agent",
            model: "openai/gpt-5/default",
            objective: "inspect runtime authority",
            workflowSummary: ["ran through rust host"]
          }
        }),
        stderr: ""
      }),
    });

    expect(report.exitCode).toBe(0);
    expect(report.lane).toBe("quick");
    expect(report.runtimeAuthority).toBe("rust");
    expect(report.sessionId).toBe("session-rust-1");
    expect(report.finalStatus).toBe("clean_success");
    expect(report.degradedReason).toBeNull();
    expect(report.workflowSummary).toEqual(["ran through rust host"]);
  });

  it("returns a degraded report when Rust engine output is not valid JSON", async () => {
    const report = await runRustHostedLaneWorkflow({
      lane: "delivery",
      objective: "bad output",
      repoRoot: "/repo",
      spawnEngine: async () => ({
        exitCode: 1,
        stdout: "not-json",
        stderr: "engine failed"
      }),
    });

    expect(report.exitCode).toBe(1);
    expect(report.runtimeAuthority).toBe("rust");
    expect(report.finalStatus).toBe("request_failed");
    expect(report.degradedReason).toContain("Could not parse Rust-hosted lane JSON");
    expect(report.workflowSummary.join("\n")).toContain("engine failed");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- run-rust-hosted-lane-command`

Expected: FAIL because the adapter file does not exist.

- [ ] **Step 3: Implement adapter**

Create `packages/opencode-app/src/workflows/run-rust-hosted-lane-command.ts`:

```ts
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import type { LaneWorkflowReport } from "./run-lane-command.js";
import type { RuntimeAuthorityFinalStatus } from "../../../shared/src/types/runtime-authority.js";

type SpawnResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type SpawnEngine = (input: {
  lane: WorkflowLane;
  objective: string;
  repoRoot: string;
  resumeSessionId?: string;
}) => Promise<SpawnResult>;

export async function runRustHostedLaneWorkflow(input: {
  lane: WorkflowLane;
  objective: string;
  repoRoot: string;
  resumeSessionId?: string;
  spawnEngine?: SpawnEngine;
}): Promise<LaneWorkflowReport> {
  const spawnEngine = input.spawnEngine ?? spawnRustEngineLane;
  const result = await spawnEngine(input);
  try {
    return adaptRustLaneEnvelope(JSON.parse(result.stdout), result.exitCode);
  } catch (error) {
    return {
      exitCode: result.exitCode === 0 ? 1 : result.exitCode,
      lane: input.lane,
      sessionId: "",
      stage: "",
      agent: "",
      model: "",
      objective: input.objective,
      workflowSummary: [
        `Could not parse Rust-hosted lane JSON: ${(error as Error).message}`,
        result.stderr.trim() || result.stdout.trim() || "Rust engine produced no diagnostic output.",
      ],
      runtimeAuthority: "rust",
      finalStatus: "request_failed",
      degradedReason: `Could not parse Rust-hosted lane JSON: ${(error as Error).message}`,
    };
  }
}

async function spawnRustEngineLane(input: {
  lane: WorkflowLane;
  objective: string;
  repoRoot: string;
  resumeSessionId?: string;
}): Promise<SpawnResult> {
  const rustEngineDir = resolveRustEngineDir(input.repoRoot);
  const args = ["run", "-q", "-p", "dh-engine", "--", laneCommand(input.lane), input.objective, "--workspace", input.repoRoot, "--json"];
  if (input.resumeSessionId) {
    args.push("--resume-session", input.resumeSessionId);
  }
  return runChild("cargo", args, rustEngineDir);
}

function adaptRustLaneEnvelope(envelope: Record<string, unknown>, fallbackExitCode: number): LaneWorkflowReport {
  const workerResult = (envelope.workerResult && typeof envelope.workerResult === "object"
    ? envelope.workerResult
    : {}) as Record<string, unknown>;
  const lifecycle = (envelope.rustLifecycle && typeof envelope.rustLifecycle === "object"
    ? envelope.rustLifecycle
    : {}) as Record<string, unknown>;

  return {
    exitCode: numberValue(workerResult.exitCode, numberValue(lifecycle.finalExitCode, fallbackExitCode)),
    lane: laneValue(workerResult.lane, envelope.command),
    sessionId: stringValue(envelope.sessionId, stringValue(workerResult.sessionId, "")),
    stage: stringValue(workerResult.stage, ""),
    agent: stringValue(workerResult.agent, ""),
    model: stringValue(workerResult.model, ""),
    objective: stringValue(workerResult.objective, ""),
    workflowSummary: stringArray(workerResult.workflowSummary),
    runtimeAuthority: "rust",
    finalStatus: finalStatusValue(envelope.finalStatus, lifecycle.finalStatus),
    degradedReason: nullableString(envelope.degradedReason),
    hostLifecycle: {
      topology: stringValue(lifecycle.topology, "rust_host_ts_worker"),
      supportBoundary: stringValue(lifecycle.supportBoundary, "runtime_authority_spine"),
      finalStatus: stringValue(lifecycle.finalStatus, stringValue(envelope.finalStatus, "request_failed")),
      finalExitCode: numberValue(lifecycle.finalExitCode, fallbackExitCode),
      workerState: optionalString(lifecycle.workerState),
      healthState: optionalString(lifecycle.healthState),
      failurePhase: optionalString(lifecycle.failurePhase),
      timeoutClass: optionalString(lifecycle.timeoutClass),
      recoveryOutcome: optionalString(lifecycle.recoveryOutcome),
      cleanupOutcome: optionalString(lifecycle.cleanupOutcome),
    },
  };
}

function laneCommand(lane: WorkflowLane): "quick" | "delivery" | "migrate" {
  return lane === "migration" ? "migrate" : lane;
}

function laneValue(...values: unknown[]): WorkflowLane {
  for (const value of values) {
    if (value === "quick" || value === "delivery" || value === "migration") return value;
    if (value === "migrate") return "migration";
  }
  return "quick";
}

function finalStatusValue(...values: unknown[]): RuntimeAuthorityFinalStatus {
  for (const value of values) {
    if (
      value === "clean_success" ||
      value === "recovered_degraded_success" ||
      value === "degraded_success" ||
      value === "startup_failed" ||
      value === "request_failed" ||
      value === "cancelled" ||
      value === "cleanup_incomplete"
    ) return value;
  }
  return "request_failed";
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function runChild(command: string, args: string[], cwd: string): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${stderr ? "\n" : ""}${error.message}` });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function resolveRustEngineDir(repoRoot: string): string {
  const fromRepoRoot = path.join(repoRoot, "rust-engine");
  if (pathExists(fromRepoRoot)) return fromRepoRoot;
  return fileURLToPath(new URL("../../../../rust-engine", import.meta.url));
}

function pathExists(candidate: string): boolean {
  try {
    return Boolean(candidate && require("node:fs").existsSync(candidate));
  } catch {
    return false;
  }
}
```

Before running TypeScript check, replace the `require("node:fs")` helper with an ESM import:

```ts
import fs from "node:fs";
```

and:

```ts
function pathExists(candidate: string): boolean {
  return fs.existsSync(candidate);
}
```

- [ ] **Step 4: Route runtime client**

In `apps/cli/src/runtime-client.ts`, import:

```ts
import { runRustHostedLaneWorkflow } from "../../../packages/opencode-app/src/workflows/run-rust-hosted-lane-command.js";
```

Change `runLane` in `createRuntimeClient()` to:

```ts
runLane: (input) => {
  if (process.env.DH_ENABLE_TS_LANE_COMPAT === "1") {
    return runLaneWorkflow(input);
  }
  return runRustHostedLaneWorkflow(input);
},
```

- [ ] **Step 5: Run adapter and runtime client tests**

Run: `npm test -- run-rust-hosted-lane-command`

Expected: PASS.

Run: `npm test -- root`

Expected before help update: may fail because help text still says TypeScript-hosted lane compatibility.

## Task 5: CLI Output And Help

**Files:**
- Modify: `apps/cli/src/commands/root.ts`
- Modify: `apps/cli/src/commands/root.test.ts`
- Modify: `apps/cli/src/presenters/lane-workflow.ts`
- Modify: `apps/cli/src/presenters/lane-workflow.test.ts`

- [ ] **Step 1: Update root help test**

In `apps/cli/src/commands/root.test.ts`, change assertions:

```ts
expect(output).toContain("quick <task> [--json]       (Rust-hosted lane workflow path)");
expect(output).toContain("delivery <goal> [--json]    (Rust-hosted lane workflow path)");
expect(output).toContain("migrate <goal> [--json]     (Rust-hosted lane workflow path)");
expect(output).toContain("Rust-host lifecycle authority covers knowledge commands and lane workflows: ask, explain, trace, quick, delivery, migrate.");
expect(output).toContain("Direct TypeScript lane execution is available only with DH_ENABLE_TS_LANE_COMPAT=1.");
expect(output).not.toContain("TypeScript-hosted workflow compatibility path");
expect(output).not.toContain("full workflow-lane parity is claimed");
```

- [ ] **Step 2: Update presenter test**

In `apps/cli/src/presenters/lane-workflow.test.ts`, add:

```ts
it("renders runtime authority metadata for lane workflows", () => {
  const text = renderLaneWorkflowText({
    exitCode: 0,
    lane: "quick",
    sessionId: "session-1",
    stage: "quick_execute",
    agent: "Quick Agent",
    model: "openai/gpt-5/default",
    objective: "inspect",
    workflowSummary: ["done"],
    runtimeAuthority: "rust",
    finalStatus: "clean_success",
    degradedReason: null,
  });

  expect(text).toContain("runtime authority: rust");
  expect(text).toContain("final status: clean_success");
  expect(text).not.toContain("degraded reason:");
});
```

- [ ] **Step 3: Run tests to verify RED**

Run: `npm test -- root lane-workflow`

Expected: FAIL until help and presenter output are updated.

- [ ] **Step 4: Update help text**

In `apps/cli/src/commands/root.ts`, change command labels:

```text
quick <task> [--json]       (Rust-hosted lane workflow path)
delivery <goal> [--json]    (Rust-hosted lane workflow path)
migrate <goal> [--json]     (Rust-hosted lane workflow path)
```

Change lifecycle boundary text to:

```text
Rust-host lifecycle authority covers knowledge commands and lane workflows: ask, explain, trace, quick, delivery, migrate.
TypeScript workers still own workflow logic, agent orchestration, prompt context assembly, provider interaction, and command output body.
Direct TypeScript lane execution is available only with DH_ENABLE_TS_LANE_COMPAT=1.
No universal repository reasoning, runtime tracing support, daemon mode, worker pool, remote/local socket control plane, Windows platform support, or OpenCode run/server/provider/MCP/tool parity is claimed.
```

- [ ] **Step 5: Update lane presenter**

In `apps/cli/src/presenters/lane-workflow.ts`, add after `objective`:

```ts
`runtime authority: ${report.runtimeAuthority}`,
`final status: ${report.finalStatus}`,
```

After building lines, append degraded reason only when truthy:

```ts
if (report.degradedReason) {
  lines.push(`degraded reason: ${report.degradedReason}`);
}
```

- [ ] **Step 6: Run CLI tests to verify GREEN**

Run: `npm test -- root lane-workflow`

Expected: PASS.

## Task 6: Worker And Host-Bridge Capability Metadata

**Files:**
- Modify: `packages/opencode-app/src/worker/worker-main.ts`
- Modify: `packages/opencode-app/src/worker/host-bridge-client.ts`
- Modify: `packages/opencode-app/src/worker/host-bridge-client.test.ts`

- [ ] **Step 1: Add failing host-bridge test**

In `packages/opencode-app/src/worker/host-bridge-client.test.ts`, add:

```ts
it("advertises Rust runtime authority families from host-backed bridge snapshots", async () => {
  const { workerPeer, hostPeer, start } = connectPeers();
  start();

  const client = new HostBridgeClient(workerPeer);
  const snapshot = await client.getInitializeSnapshot();

  expect(snapshot.capabilities.runtimeAuthority).toEqual({
    owner: "rust",
    families: expect.arrayContaining([
      { family: "knowledge", state: "supported", owner: "rust" },
      { family: "lane", state: "supported", owner: "rust" },
      { family: "session", state: "partial", owner: "rust" },
    ]),
  });
  hostPeer.close();
  workerPeer.close();
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- host-bridge-client`

Expected: FAIL because `runtimeAuthority` is not present on capabilities.

- [ ] **Step 3: Extend bridge capability type**

In `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`, extend `BridgeInitializeCapabilities`:

```ts
runtimeAuthority?: {
  owner: "rust";
  families: Array<{
    family: "knowledge" | "lane" | "run" | "session" | "provider" | "mcp" | "tool";
    state: "supported" | "partial" | "planned";
    owner: "rust";
  }>;
};
```

- [ ] **Step 4: Add default host-backed runtime authority**

In `packages/opencode-app/src/worker/host-bridge-client.ts`, add to `defaultHostBridgeCapabilities()`:

```ts
runtimeAuthority: {
  owner: "rust",
  families: [
    { family: "knowledge", state: "supported", owner: "rust" },
    { family: "lane", state: "supported", owner: "rust" },
    { family: "run", state: "planned", owner: "rust" },
    { family: "session", state: "partial", owner: "rust" },
    { family: "provider", state: "planned", owner: "rust" },
    { family: "mcp", state: "planned", owner: "rust" },
    { family: "tool", state: "planned", owner: "rust" },
  ],
},
```

- [ ] **Step 5: Mark worker runLane result**

In `packages/opencode-app/src/worker/worker-main.ts`, in the `session.runLane` handler, change:

```ts
return runtime.router.runLane(asRunLaneParams(params));
```

to:

```ts
const result = await runtime.router.runLane(asRunLaneParams(params));
return {
  ...result,
  runtimeAuthority: "typescript_worker",
};
```

- [ ] **Step 6: Run worker tests**

Run: `npm test -- host-bridge-client worker-main`

Expected: PASS.

## Task 7: Session Metadata And Storage Inspection

**Files:**
- Modify: `packages/runtime/src/session/session-manager.ts`
- Modify: `packages/runtime/src/workflow/stage-runner.ts`
- Modify: `packages/storage/src/sqlite/repositories/sessions-repo.ts`
- Add or modify nearby tests.

- [ ] **Step 1: Add failing repository helper test**

In `packages/storage/src/sqlite/repositories/repos.test.ts`, add:

```ts
import { SessionsRepo } from "./sessions-repo.js";
import type { SessionState } from "../../../../shared/src/types/session.js";

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-test",
    repoRoot: overrides.repoRoot ?? "/repo",
    lane: overrides.lane ?? "quick",
    laneLocked: overrides.laneLocked ?? true,
    currentStage: overrides.currentStage ?? "quick_plan",
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z",
    semanticMode: overrides.semanticMode ?? "always",
    toolEnforcementLevel: overrides.toolEnforcementLevel ?? "standard",
    activeWorkItemIds: overrides.activeWorkItemIds ?? [],
    latestSummaryId: overrides.latestSummaryId,
    latestCheckpointId: overrides.latestCheckpointId,
    latestRevertId: overrides.latestRevertId,
  };
}

it("finds the latest session by lane for runtime authority inspection", () => {
  const repo = makeTmpRepo();
  const sessions = new SessionsRepo(repo);
  sessions.save(makeSession({ sessionId: "session-old", lane: "quick", updatedAt: "2026-05-10T01:00:00.000Z" }));
  sessions.save(makeSession({ sessionId: "session-new", lane: "quick", updatedAt: "2026-05-10T02:00:00.000Z" }));

  expect(sessions.findLatestByLane("quick")?.sessionId).toBe("session-new");
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- repos`

Expected: FAIL because `findLatestByLane()` is absent.

- [ ] **Step 3: Add repository helper**

In `packages/storage/src/sqlite/repositories/sessions-repo.ts`, add:

```ts
  findLatestByLane(lane: SessionState["lane"]): SessionState | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare(`
      SELECT session_id
      FROM sessions
      WHERE lane = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `).get(lane) as { session_id: string } | undefined;
    return row ? this.findById(row.session_id) : undefined;
  }
```

- [ ] **Step 4: Add checkpoint metadata source**

In `packages/runtime/src/session/session-manager.ts`, change `createSession()` signature to:

```ts
async createSession(
  lane: WorkflowLane,
  agent: AgentRegistryEntry,
  options?: { runtimeAuthority?: "rust_host" | "typescript_compatibility" },
): Promise<SessionBootstrapResult> {
```

When calling `recordSessionBootstrap`, preserve existing behavior. When saving bootstrap metadata in callers, use `options?.runtimeAuthority ?? "typescript_compatibility"`.

In `packages/opencode-app/src/workflows/run-lane-command.ts`, pass:

```ts
await sessionManager.createSession(lane, agent, { runtimeAuthority: "typescript_compatibility" })
```

In the Rust-hosted worker path, do not create TS-level Rust authority; Rust wraps the final report. The worker remains `typescript_worker`.

In `packages/runtime/src/workflow/stage-runner.ts`, add `runtimeAuthority: "typescript_worker"` to `metadataJson` for `post_stage_advance` checkpoints.

- [ ] **Step 5: Run session/storage tests**

Run: `npm test -- session-manager stage-runner repos`

Expected: PASS.

## Task 8: Parity Report Update After Runtime Authority Lands

**Files:**
- Modify: `packages/runtime/src/diagnostics/parity-report.ts`
- Modify: `packages/runtime/src/diagnostics/parity-report.test.ts`
- Modify: `packages/runtime/src/diagnostics/doctor.test.ts`

- [ ] **Step 1: Add failing parity assertion**

In `packages/runtime/src/diagnostics/parity-report.test.ts`, add:

```ts
it("marks runtime authority as supported once lane commands are Rust-hosted", () => {
  const report = buildOpenCodeParityReport();
  const runtime = report.features.find((feature) => feature.category === "runtime");
  const cli = report.features.find((feature) => feature.category === "cli");

  expect(runtime?.status).toBe("supported");
  expect(runtime?.missingRuntimeCapabilities).not.toEqual(
    expect.arrayContaining(["single Rust lifecycle authority for lane, run, session, provider, MCP, and tool paths"]),
  );
  expect(cli?.dhSurface).toEqual(expect.arrayContaining(["quick (rust-hosted)", "delivery (rust-hosted)", "migrate (rust-hosted)"]));
});
```

- [ ] **Step 2: Run parity test to verify RED**

Run: `npm test -- parity-report`

Expected: FAIL until parity data changes.

- [ ] **Step 3: Update parity matrix**

In `packages/runtime/src/diagnostics/parity-report.ts`:

- Change runtime feature `status` from `"partial"` to `"supported"`.
- Change runtime feature `dhSurface` to include:

```ts
"Rust-hosted ask/explain/trace lifecycle",
"Rust-hosted quick/delivery/migrate lane lifecycle",
"TypeScript worker compatibility boundary"
```

- Change runtime feature `missingRuntimeCapabilities` to:

```ts
["OpenCode run/session/provider/MCP/tool lifecycle authority remains planned in later milestones"]
```

- In CLI feature `dhSurface`, change lane entries to:

```ts
"quick (rust-hosted)",
"delivery (rust-hosted)",
"migrate (rust-hosted)"
```

- [ ] **Step 4: Run doctor/parity tests**

Run: `npm test -- parity-report doctor`

Expected: PASS.

## Task 9: Final Verification

**Files:**
- All files touched by this milestone.

- [ ] **Step 1: Run Rust focused tests**

Run: `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine`

Expected: PASS.

- [ ] **Step 2: Run TypeScript focused tests**

Run: `npm test -- run-lane-command run-rust-hosted-lane-command host-bridge-client worker-main root lane-workflow repos parity-report doctor`

Expected: PASS.

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`

Expected: PASS.

- [ ] **Step 4: Run full Rust tests**

Run: `cargo test --manifest-path rust-engine/Cargo.toml`

Expected: PASS.

- [ ] **Step 5: Manual JSON smoke**

Run: `cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- quick "inspect runtime contract" --workspace . --json`

Expected: JSON contains:

```json
{
  "commandFamily": "lane",
  "runtimeAuthority": "rust",
  "finalStatus": "clean_success"
}
```

If local worker bundle artifacts are missing, expected output is a Rust-owned startup failure envelope with:

```json
{
  "runtimeAuthority": "rust",
  "finalStatus": "startup_failed"
}
```

- [ ] **Step 6: Inspect diff**

Run: `git diff --stat`

Expected: Changes are limited to Rust runtime authority, TypeScript lane routing/presenters/tests, parity report update, and this plan file.

## Self-Review

Spec coverage:

- Bridge capability advertisement is covered by Task 1 and Task 6.
- Lane routing through Rust supervision is covered by Task 4 and Task 5.
- Session identity and final status envelope are covered by Task 2 and Task 4.
- Hook dispatch remains through existing Rust `BridgeRpcRouter` and worker workflow logic; Task 2 ensures the Rust lane host wraps the final lifecycle truth.
- Explicit TypeScript fallback is covered by `DH_ENABLE_TS_LANE_COMPAT=1` in Task 4.
- Doctor/parity truth update is covered by Task 8.

Placeholder scan:

- The plan contains concrete files, commands, code snippets, and expected outcomes for each task.

Type consistency:

- Rust uses `runtimeAuthority` in JSON via `runtime_authority` fields under `serde(rename_all = "camelCase")`.
- TypeScript uses `runtimeAuthority`, `finalStatus`, and `degradedReason` from `RuntimeAuthorityFields`.
- Lane command naming maps Rust `migrate` to TypeScript lane `"migration"` at the adapter boundary.
