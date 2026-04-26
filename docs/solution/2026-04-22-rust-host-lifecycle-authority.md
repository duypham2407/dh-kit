---
artifact_type: solution_package
version: 2
status: solution_lead_handoff
feature_id: RUST-HOST-LIFECYCLE-AUTHORITY
feature_slug: rust-host-lifecycle-authority
source_scope_package: docs/scope/2026-04-22-rust-host-lifecycle-authority.md
architecture_source: docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Rust Host Lifecycle Authority

## Problem Framing

The approved scope package (`docs/scope/2026-04-22-rust-host-lifecycle-authority.md`) deliberately follows the lifecycle seam work that left the repository in this truthful state: TypeScript currently acts as the command-path host/orchestrator and starts a Rust bridge subprocess. That prior topology is no longer enough for this feature. The product truth must move to a bounded Rust-hosted path where Rust is the parent process, directly starts the TypeScript worker, and owns host lifecycle truth for startup, readiness, health, timeout, recovery, shutdown, cleanup, and final command exit status.

The architecture source (`docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`) and process-model reference both point to the same target boundary: Rust is the native CLI/engine/foundation host and TypeScript is the workflow/agent worker. This solution implements that boundary only for a first-wave supported local on-demand worker-backed path rather than claiming universal parity.

## Recommended Path

Add a new Rust-hosted supported path for the first-wave local knowledge commands: `ask`, `explain`, and `trace`. Rust becomes the process parent and lifecycle authority for those commands. It validates launchability, spawns a TypeScript worker bundle, drives the worker readiness handshake, handles request timeouts/cancellation/recovery/cleanup, serves worker reverse-RPC requests for existing Rust code-intelligence queries, and writes the final command lifecycle envelope and exit status. TypeScript remains the workflow worker for command routing, prompt/report assembly, session behavior, and output shaping, but it no longer spawns Rust or owns host lifecycle truth on this supported path.

This is enough because it satisfies the approved host-inversion product truth on an inspectable command path without widening into daemon mode, remote control planes, worker pools, all workflow-lane parity, shell/tool orchestration redesign, bundled-Node packaging redesign, or Windows support. Any remaining TypeScript-hosted path must be explicitly labeled legacy/compatibility/out-of-scope until separately migrated.

## Explicit Supported Boundary

### First-wave supported Rust-hosted path

- `dh ask <question>` when routed through the Rust host binary.
- `dh explain <symbol-or-file>` when routed through the Rust host binary.
- `dh trace <target>` when routed through the Rust host binary; the command may still return the existing bounded `unsupported` answer for trace-flow capability, but the process lifecycle is Rust-hosted and Rust-authoritative.
- `dh doctor` / diagnostic wording touched by this feature may report the Rust-hosted knowledge-command lifecycle path, but this feature does not require a full Rust rewrite of every existing doctor check.

### Explicitly legacy or out of scope for this feature unless implementation proves they are already using the new host boundary

- Existing TypeScript-hosted bridge path where `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` spawns `cargo run -p dh-engine -- serve`.
- Workflow lane commands (`quick`, `delivery`, `migration`) when they still run through the TypeScript CLI host.
- Indexing, config, clean, operator-safe-maintenance, release/install scripts, and maintainer utilities unless they are only touched for wording or runtime-launch truth.
- Any path that still requires TypeScript to spawn Rust must be labeled compatibility-only and must not be included in the Rust-host lifecycle-authority completion claim.

## Non-Goals And Hard Boundaries

- No daemon mode, `dhd`, background service, persistent worker pool, warm-worker pool, or generic process supervisor.
- No TCP/HTTP/gRPC/local-socket control plane and no remote execution surface.
- No Windows-specific support, Windows packaging, PowerShell flow, Windows CI, or Windows hardening. Preserve Linux/macOS target-platform truth.
- No full workflow-lane parity in this feature. Do not migrate `quick`, `delivery`, or `migration` unless a small shared worker seam is needed and the path remains explicitly outside completion claims.
- No rewrite of the TypeScript workflow brain into Rust.
- No generic shell/tool orchestration redesign. Existing tool/file/runtime bridge methods are not widened as part of host inversion.
- No bundled-Node or single-binary packaging optimization unless needed only to report launchability truth. The current repository documents Node.js v22+ as an operational requirement; this feature may continue to rely on that requirement while making Rust responsible for validating and launching the worker.
- No broad code-intelligence query expansion. Existing bounded query surfaces remain the first-wave worker-to-host calls.

## Impacted Surfaces

### Rust host and lifecycle authority

- `rust-engine/crates/dh-engine/src/main.rs`
  - Add or route first-wave `ask`, `explain`, and `trace` subcommands through the Rust host path.
  - Keep existing `serve`, `init`, `status`, `index`, `parity`, `benchmark`, and legacy compatibility flags intact unless a later slice explicitly labels them.
- `rust-engine/crates/dh-engine/src/bridge.rs`
  - Reuse/extract current query and runtime RPC handlers so the new host can answer worker reverse-RPC requests without spawning a second Rust process.
  - Preserve the existing `serve` command as compatibility-only during rollout.
- New likely Rust modules under `rust-engine/crates/dh-engine/src/`:
  - `host_lifecycle.rs` — canonical lifecycle state, failure, timeout, recovery, cleanup, and final-exit vocabulary.
  - `worker_supervisor.rs` — worker runtime/bundle resolution, spawn, signal handling, restart, shutdown, and child process ownership.
  - `worker_protocol.rs` — JSON-RPC framing, request correlation, bidirectional routing, cancellation, and protocol-version handling.
  - `host_commands.rs` — mapping Rust CLI commands into worker `session.runCommand` requests and final command reports.
  - `runtime_launch.rs` — Node/runtime/bundle/manifest/platform launchability checks.
- `rust-engine/crates/dh-engine/Cargo.toml`
  - Add only dependencies actually needed by the host supervisor (for example `tokio.workspace = true` if async process supervision is used). Do not add network/server dependencies for this feature.

### TypeScript worker boundary

- New likely worker files under `packages/opencode-app/src/worker/`:
  - `worker-main.ts` — TypeScript worker entrypoint invoked by Rust.
  - `worker-jsonrpc-stdio.ts` — worker-side framed JSON-RPC transport.
  - `host-bridge-client.ts` — `BridgeClient` implementation that calls the Rust host over the already-open worker bridge instead of spawning Rust.
  - `worker-command-router.ts` — maps host `session.runCommand` requests to existing `runKnowledgeCommand` behavior.
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - Keep workflow/report assembly in TypeScript.
  - Ensure worker mode always receives an injected host-backed `BridgeClient`; it must not call `createDhJsonRpcStdioClient()` and spawn Rust on the Rust-hosted supported path.
  - Keep TypeScript output limited to command/workflow result and presentation metadata; do not create host lifecycle status locally.
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - Keep the existing TS-hosted Rust bridge client as legacy/compatibility.
  - If shared types are extracted, keep compatibility imports stable or update tests in the same slice.
- `apps/cli/src/presenters/knowledge-command.ts` and related tests
  - Continue rendering command result evidence, but distinguish command/query evidence from Rust host lifecycle evidence.
  - Presenter wording must not imply TypeScript host authority on the supported path.

### Build, release, and runtime-launch truth

- `scripts/build-cli-bundle.sh` or a new adjacent worker-bundle script
  - Produce a worker entry bundle for Rust to launch, using existing `esbuild` tooling.
- `Makefile`
  - Wire worker-bundle production into the appropriate build/release target if the Rust-hosted binary depends on it.
- `scripts/package-release.sh`, `scripts/verify-release-artifacts.sh`, and `scripts/test-installers.sh`
  - Touch only if release artifacts must include or verify the worker bundle/manifest for the first-wave Rust-hosted path.
  - Do not introduce Windows assets or Windows-specific validation.
- `README.md`, `docs/user-guide.md`, `docs/operations/release-and-install.md`
  - Update only product/operator wording needed to distinguish the Rust-hosted supported knowledge path from legacy TypeScript-hosted compatibility paths and preserve Linux/macOS platform truth.

## Rust/TypeScript Boundary Contract

### Ownership model

| Surface | Rust host owns | TypeScript worker owns | Must not happen |
| --- | --- | --- | --- |
| Startup/preflight | platform support, Node/runtime lookup, worker bundle/manifest validation, workspace launchability | worker bootstrap validation after spawn | TypeScript deciding host launchability |
| Spawn/readiness | child process creation, spawned-vs-ready state, ready deadline, readiness classification | emitting ready only after worker modules/router/session bootstrap are usable | treating spawn as ready |
| Query/evidence calls | code-intelligence query truth and bridge method responses | asking Rust for query/evidence data needed by workflow | worker spawning a Rust subprocess |
| Request lifecycle | request deadline, cancellation, replay-safe recovery decision, final exit code | workflow execution and command result body | TypeScript replaying after host forbids it |
| Health/liveness | authoritative ready/healthy/degraded/blocked classification | responding to host ping with worker-local facts | TypeScript presenting host health as its own truth |
| Cleanup | graceful shutdown attempt, forced termination, incomplete cleanup classification | flushing worker-local session/output before shutdown | hiding forced/incomplete cleanup |

### Canonical lifecycle vocabulary

Rust should expose one canonical lifecycle report shape for the supported path. Exact type names may vary, but the following facts must remain explicit and testable:

- `topology`: `rust_host_ts_worker`
- `supportBoundary`: `knowledge_commands_first_wave`
- `platform`: `linux` or `macos`; unsupported OS must fail as unsupported/startup class without Windows-specific remediation.
- `workerState`: `not_running`, `spawned_not_ready`, `ready`, `busy`, `degraded`, `shutting_down`, `stopped`
- `healthState`: `unknown`, `healthy`, `degraded`, `blocked`, `unhealthy`
- `failurePhase`: `startup`, `request`, `health`, `shutdown`, or `none`
- `timeoutClass`: `startup_timeout`, `ready_timeout`, `request_timeout`, `health_timeout`, `shutdown_timeout`, or `none`
- `recoveryOutcome`: `not_attempted`, `attempted_succeeded_degraded`, `attempted_failed`, `forbidden_replay_unsafe`
- `cleanupOutcome`: `graceful`, `forced`, `incomplete`, `not_started`
- `finalStatus`: `clean_success`, `recovered_degraded_success`, `degraded_success`, `startup_failed`, `request_failed`, `cancelled`, `cleanup_incomplete`
- `finalExitCode`: Rust host authority, derived from lifecycle and command result.

TypeScript may receive lifecycle context and may include worker-local diagnostics, but TypeScript must not invent or override these host lifecycle fields.

### JSON-RPC surface changes

This feature introduces a new bidirectional Rust-host <-> TypeScript-worker bridge. It must preserve JSON-RPC 2.0 over stdio with `Content-Length` framing and stdout protocol-only / stderr logs-only rules.

#### Rust host -> TypeScript worker

- `dh.initialize`
  - Purpose: protocol negotiation, command context, workspace context, deadlines, host identity, supported target platform, and advertised Rust host lifecycle authority.
  - Required result: worker identity, worker protocol version, worker capabilities, and bootstrap warnings.
- `dh.initialized`
  - Purpose: host accepted negotiation and worker may finish command bootstrap.
  - May be request or notification, but it must be sequenced before `dh.ready` is accepted.
- `session.runCommand`
  - First-wave commands: `ask`, `explain`, `trace`.
  - Params include command kind, input, output mode, session/resume options, workspace root, trace/session ids, and host replay-safety classification.
  - Result is command/workflow output only; host lifecycle status is not owned by the worker result.
- `runtime.ping`
  - Purpose: host checks worker-local liveness/health facts after ready.
  - Rust maps response into authoritative host health classification.
- `session.cancel` or JSON-RPC `$/cancelRequest`
  - Purpose: request timeout or user cancellation. Host owns final cancellation classification.
- `dh.shutdown`
  - Purpose: graceful worker cleanup and session/output flush before Rust terminates or waits for exit.

#### TypeScript worker -> Rust host

- Existing bounded code-intelligence methods reused through the host router:
  - `query.search`
  - `query.definition`
  - `query.relationship` with `usage`, `dependencies`, and `dependents`
- Optional first-wave runtime utility calls only if already needed by existing knowledge-command behavior:
  - `runtime.health`
  - `runtime.diagnostics`
  - `file.read`, `file.readRange`, `file.list`
  - `tool.execute` with the existing allowlist only
- Notifications:
  - `dh.ready` — worker is ready for host-dispatched command handling.
  - `event.output.delta` — optional command output streaming; host may also accept a terminal result only if streaming is not implemented in this slice.
  - `event.warning` — optional worker-local warning, not lifecycle authority.

Do not add arbitrary method passthrough, shell execution, network transport, or generic command forwarding.

## Implementation Slices / Task Board Proposal

### TASK-RHLA-1 — Freeze host lifecycle contract and reusable Rust RPC router (`kind: implementation+tests`)

- **Files**:
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - new `rust-engine/crates/dh-engine/src/host_lifecycle.rs`
  - new `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - new Rust tests adjacent to the new modules or under `rust-engine/crates/dh-engine/tests/`
- **Goal**: define the Rust-owned lifecycle vocabulary, final status/exit-code mapping, and reusable query/RPC handler boundary before any worker is launched.
- **Details**:
  - Extract or wrap current `bridge.rs` request handling so the Rust host can answer worker reverse-RPC query methods without starting `dh-engine serve` as a child.
  - Keep the existing `serve` path working as compatibility; do not delete it in this slice.
  - Add tests for lifecycle state transitions and unsupported platform/runtime/bundle classification.
  - Reviewer focus: Rust has one lifecycle vocabulary; TS-hosted bridge client is not touched except for compatibility if type extraction requires it.
- **Validation**:
  - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`

### TASK-RHLA-2 — Add Rust worker supervisor and launchability gates (`kind: implementation+tests`)

- **Files**:
  - `rust-engine/crates/dh-engine/src/worker_supervisor.rs`
  - `rust-engine/crates/dh-engine/src/runtime_launch.rs`
  - `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/Cargo.toml`
- **Goal**: make Rust directly own worker runtime resolution, spawn, handshake deadlines, ping, cancellation, recovery decision, shutdown, forced cleanup, and final exit status.
- **Details**:
  - Resolve worker bundle and Node runtime under the current Linux/macOS product assumptions.
  - Missing Node/runtime/bundle, manifest mismatch, corrupt bundle, non-executable runtime, and protocol mismatch must become Rust-host startup/lifecycle failures.
  - Add one replay-safe automatic recovery attempt only for first-wave read-only knowledge commands and only before final response.
  - Replay-unsafe or uncertain cases must not be retried automatically.
  - Add signal handling for cancellation at least at the Rust host boundary; first interrupt should request cancellation/shutdown, forced cleanup remains inspectable.
- **Validation**:
  - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`
  - targeted Rust smoke after command implementation exists: `cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- ask "where is runKnowledgeCommand?" --json`

### TASK-RHLA-3 — Create TypeScript worker entry and host-backed BridgeClient (`kind: implementation+tests`)

- **Files**:
  - new `packages/opencode-app/src/worker/worker-main.ts`
  - new `packages/opencode-app/src/worker/worker-jsonrpc-stdio.ts`
  - new `packages/opencode-app/src/worker/host-bridge-client.ts`
  - new `packages/opencode-app/src/worker/worker-command-router.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` only if shared types must be extracted
  - new TS worker tests under `packages/opencode-app/src/worker/*.test.ts`
- **Goal**: make TypeScript runnable as a worker that responds to Rust host lifecycle requests and uses Rust host reverse-RPC for query/evidence calls.
- **Details**:
  - Worker responds to `dh.initialize`, waits for `dh.initialized`, emits `dh.ready`, handles `session.runCommand`, answers `runtime.ping`, honors cancellation, and handles `dh.shutdown`.
  - Worker calls existing knowledge-command workflow with an injected host-backed `BridgeClient` so it never starts `cargo run ... serve` on the supported Rust-host path.
  - Keep `createDhJsonRpcStdioClient()` available for legacy compatibility and tests; do not make it the worker-mode default.
  - TypeScript report fields that previously implied host startup success must be narrowed or renamed when used inside the worker. Rust host lifecycle report wins.
- **Validation**:
  - `npm run check`
  - `npm test -- packages/opencode-app/src/worker/*.test.ts packages/opencode-app/src/workflows/run-knowledge-command.test.ts packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`

### TASK-RHLA-4 — Wire first-wave Rust-hosted commands and final reporting (`kind: implementation+tests`)

- **Files**:
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/src/host_commands.rs`
  - `rust-engine/crates/dh-engine/src/host_lifecycle.rs`
  - `apps/cli/src/presenters/knowledge-command.ts` and tests if existing presenter output is reused by the worker result
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts` and tests
- **Goal**: expose the supported Rust-hosted `ask`, `explain`, and `trace` command path and produce one authoritative Rust host lifecycle envelope around the TypeScript command result.
- **Details**:
  - Rust maps CLI args to worker `session.runCommand` requests.
  - Rust appends or emits the authoritative lifecycle report in text/JSON output; TypeScript output may shape command answer/evidence only.
  - Startup failure before ready and request failure after ready must produce distinct outputs and exit codes.
  - Recovered success must say recovered/degraded, never clean first-pass success.
  - Cleanup outcome must be visible even when the command result was already known.
  - Existing `trace` unsupported result remains acceptable if the lifecycle host path is Rust-owned and the unsupported command result stays explicit.
- **Validation**:
  - `npm run check`
  - `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts apps/cli/src/presenters/knowledge-command.test.ts`
  - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`
  - smoke after implementation: `cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- ask "where is runKnowledgeCommand?" --json`

### TASK-RHLA-5 — Bundle/manifest and Linux/macOS runtime-launch truth (`kind: implementation+tests`)

- **Files**:
  - `scripts/build-cli-bundle.sh` or new adjacent worker-bundle script
  - `Makefile`
  - `scripts/package-release.sh`
  - `scripts/verify-release-artifacts.sh`
  - `scripts/test-installers.sh` only if packaging assertions must change
  - `docs/operations/release-and-install.md` if release bundle shape changes
- **Goal**: make the worker bundle launchable by Rust and make missing/mismatched/corrupt worker runtime failures truthful without adding Windows support or broad packaging optimization.
- **Details**:
  - Produce a deterministic TS worker bundle, for example under `dist/ts-worker/worker.mjs`, plus minimal manifest fields: worker version, protocol version, entry path, checksum, and required Node major version.
  - Rust launchability checks validate the worker bundle and Node runtime before claiming startup can proceed.
  - Keep current Node.js v22+ operational requirement unless a separate packaging feature adds bundled Node.
  - Preserve release artifact targets: Linux and macOS only.
- **Validation**:
  - `scripts/build-cli-bundle.sh` or the new worker-bundle script created in this slice
  - `make build` after Makefile is updated to include the worker bundle if required
  - `scripts/verify-release-artifacts.sh dist/releases` only if release packaging changes are made
  - `scripts/test-installers.sh dist/releases` only if installer assertions are changed and `dist/releases` is available

### TASK-RHLA-6 — Operator wording, diagnostics, and legacy-path labeling (`kind: docs+tests`)

- **Files**:
  - `README.md`
  - `docs/user-guide.md`
  - `docs/operations/release-and-install.md`
  - `packages/runtime/src/diagnostics/doctor.ts` and tests if existing doctor output remains a touched operator surface
  - `apps/cli/src/commands/doctor.ts` and tests if CLI doctor text/JSON changes
- **Goal**: ensure all touched operator and maintainer-facing surfaces tell one bounded story: supported knowledge commands are Rust-hosted; TypeScript is a worker; unmigrated paths are legacy/compatibility/out-of-scope; Linux/macOS remain the supported platforms.
- **Details**:
  - Remove or qualify wording that says TypeScript is the command-path host for the supported first-wave path.
  - Explicitly label any remaining TS-hosted bridge path as compatibility-only.
  - `doctor` must not claim full Rust-host authority for unmigrated commands.
  - Do not add Windows references beyond saying Windows is not a current target platform.
- **Validation**:
  - `npm run check`
  - `npm test -- packages/runtime/src/diagnostics/doctor.test.ts apps/cli/src/commands/doctor.test.ts apps/cli/src/presenters/knowledge-command.test.ts`
  - targeted text review for `TypeScript host`, `Rust bridge subprocess`, `Rust-host`, `worker`, `Windows`, `Linux`, and `macOS` in touched surfaces.

### TASK-RHLA-7 — End-to-end integration and handoff evidence (`kind: validation`)

- **Files**: all touched implementation, tests, and docs above.
- **Goal**: prove one coherent Rust-hosted lifecycle story before Code Review and QA.
- **Required evidence**:
  - process relationship: Rust host is parent and TypeScript worker is child on the supported path.
  - pre-ready failure is classified as startup failure.
  - ready worker then failing request is classified as request failure.
  - ready does not automatically mean healthy; ping/degraded states remain distinct.
  - replay-safe recovery is Rust-decided, one-attempt, and recovered success is degraded.
  - replay-unsafe or uncertain work is not silently replayed.
  - shutdown reports graceful/forced/incomplete cleanup.
  - legacy/unmigrated paths are labeled and not included in the completion claim.
- **Validation**:
  - `npm run check`
  - `npm test`
  - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`
  - `make build` if TASK-RHLA-5 wires the worker bundle into the build target
  - Rust-host smoke: `cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- ask "where is runKnowledgeCommand?" --json`

## Dependency Graph

- Critical path: `TASK-RHLA-1 -> TASK-RHLA-2 -> TASK-RHLA-3 -> TASK-RHLA-4 -> TASK-RHLA-5 -> TASK-RHLA-6 -> TASK-RHLA-7`.
- TASK-RHLA-1 must land before any implementation uses lifecycle fields; it is the contract freeze.
- TASK-RHLA-2 depends on TASK-RHLA-1 because supervisor behavior must map into the canonical lifecycle vocabulary.
- TASK-RHLA-3 depends on TASK-RHLA-1 and must integrate with TASK-RHLA-2 before it is considered complete because the worker transport cannot become a second lifecycle authority.
- TASK-RHLA-4 depends on TASK-RHLA-2 and TASK-RHLA-3; it is the first real supported path.
- TASK-RHLA-5 should follow TASK-RHLA-4 so packaging validates the actual worker entrypoint, not a speculative bundle.
- TASK-RHLA-6 follows implementation because wording must describe delivered truth.
- TASK-RHLA-7 is the integration checkpoint before `full_code_review`.

## Integration Checkpoint

Implementation remains strictly sequential from `TASK-RHLA-1` through `TASK-RHLA-7`; do not advance to `full_code_review` until the integrated work proves one coherent Rust-hosted lifecycle authority story across the protocol, supervisor, worker, command path, packaging/runtime launch truth, docs, and validation evidence.

Before the handoff to Code Review, all of the following must be true:

- `TASK-RHLA-1` is complete and the Rust/TypeScript protocol contract is frozen: lifecycle vocabulary, JSON-RPC framing, supported methods, final status/exit-code mapping, and worker-to-host query boundaries are stable enough that later slices do not invent a second contract.
- `TASK-RHLA-2` and `TASK-RHLA-3` are integrated, not merely implemented in isolation: the Rust supervisor owns worker runtime resolution, spawn, readiness, timeout, health, cancellation, recovery, shutdown, cleanup, and final exit authority, and the TypeScript worker entry uses the host-backed bridge without spawning Rust on the supported path.
- `TASK-RHLA-4` wires the first-wave Rust-hosted path end to end for `ask`, `explain`, and `trace`: Rust is the process parent, TypeScript is the worker, command results come from the worker, and the lifecycle envelope/final exit status come from Rust.
- `TASK-RHLA-5` checks bundle/manifest launch truth for Linux/macOS: worker bundle path, manifest fields, protocol version, checksum/corrupt-bundle behavior, required Node major version, and missing/non-launchable runtime failures are validated or truthfully classified before startup proceeds.
- `TASK-RHLA-6` aligns operator-facing wording and diagnostics with delivered truth: supported first-wave knowledge commands are described as Rust-hosted only where proven, remaining TypeScript-hosted paths are labeled legacy/compatibility/out-of-scope, and Linux/macOS platform truth remains explicit.
- `TASK-RHLA-7` collects the validation matrix evidence required by this package: automated checks, Rust-host smoke/e2e evidence, process-tree evidence, startup-versus-request failure evidence, ready-versus-healthy evidence, recovery/no-replay evidence, cleanup outcome evidence, and touched-surface wording review.

The checkpoint must reject completion claims that widen scope beyond this approved solution. Passing the checkpoint does not imply Windows support, daemon/background-service support, remote socket/control-plane support, or shell/worktree lifecycle redesign; any implementation that introduces those surfaces must return to Product Lead/Solution Lead before review.

## Parallelization Recommendation

- parallel_mode: `none`
- why: host lifecycle vocabulary, Rust supervisor behavior, TypeScript worker transport, command reporting, packaging launchability, and operator wording all depend on the same authority boundary. Parallel execution would create high risk of a mixed topology where TypeScript still spawns Rust or surfaces competing lifecycle truth.
- safe_parallel_zones: []
- sequential_constraints:
  - `TASK-RHLA-1 -> TASK-RHLA-2 -> TASK-RHLA-3 -> TASK-RHLA-4 -> TASK-RHLA-5 -> TASK-RHLA-6 -> TASK-RHLA-7`
- integration_checkpoint: prove a Rust-parent / TypeScript-child process tree and one coherent lifecycle report across runtime behavior, TS worker output, docs, and diagnostics before Code Review.
- max_active_execution_tracks: `1`

## Validation Strategy

### Repository commands that exist now

- `npm run check` — TypeScript typecheck.
- `npm test` — Vitest test suite.
- `cargo test --workspace --manifest-path rust-engine/Cargo.toml` — Rust workspace tests from repo root.
- `make check` — wrapper for `npm run check`.
- `make test` — wrapper for `npm test`.
- `make rust-test` — wrapper for Rust workspace tests.
- `make build` — current aggregate TS check/tests, Rust tests, and Rust release build; update only if worker bundle becomes part of build readiness.
- `scripts/build-cli-bundle.sh` — existing esbuild bundle script; update or add an adjacent worker bundle script if the first-wave worker needs a separate entrypoint.

### Required implementation validation

1. TypeScript contract safety:
   - `npm run check`
   - `npm test -- packages/opencode-app/src/worker/*.test.ts packages/opencode-app/src/workflows/run-knowledge-command.test.ts packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
2. Rust lifecycle/supervisor safety:
   - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`
3. Cross-boundary command path:
   - `npm test`
   - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`
   - Rust-host smoke after the new command path exists: `cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- ask "where is runKnowledgeCommand?" --json`
4. Build/package truth if bundle/release surfaces are touched:
   - `scripts/build-cli-bundle.sh` or the new worker-bundle script
   - `make build`
   - `scripts/verify-release-artifacts.sh dist/releases` if release artifact verification is changed
   - `scripts/test-installers.sh dist/releases` if installer assertions are changed and release artifacts are present
5. Manual QA evidence that cannot be replaced by unit tests:
   - Capture process-tree evidence showing Rust host PID is parent of the TypeScript worker PID on the supported path.
   - Capture one missing-worker-bundle or missing-runtime startup failure.
   - Capture one post-ready request failure.
   - Capture one cleanup forced/incomplete path if test fixtures can simulate it safely.

No repo-native lint command is defined. Use available tests/checks and optional security/rule scans only if the active environment provides them; do not invent lint evidence.

## Validation Matrix

| Acceptance / slice | Required validation commands | Required evidence |
| --- | --- | --- |
| AC1 real topology inversion; TASK-RHLA-2/3/4/7 | `cargo test --workspace --manifest-path rust-engine/Cargo.toml`; Rust-host smoke/e2e after the command surface exists: `cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- ask "where is runKnowledgeCommand?" --json`, `cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- explain runKnowledgeCommand --json`, and `cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- trace runKnowledgeCommand --json` | Automated Rust tests pass; smoke/e2e output reports `topology: rust_host_ts_worker` or equivalent Rust-owned lifecycle envelope; manual process-tree capture proves the Rust host PID is the parent of the TypeScript worker PID on the supported path. |
| AC2 Rust sole lifecycle authority; AC4 startup vs request failure; AC5 ready vs healthy; AC6/AC7 recovery rules; TASK-RHLA-1/2/4/7 | `cargo test --workspace --manifest-path rust-engine/Cargo.toml`; `npm run check`; `npm test`; Rust-host failure smokes/e2e where fixtures or implementation hooks exist for missing runtime/bundle, ready-timeout, request failure, degraded health, recovery, cancellation, and shutdown cleanup | Rust tests cover lifecycle state, timeout, recovery, cleanup, and final-exit mapping; TypeScript checks/tests prove worker output does not invent host lifecycle authority; e2e evidence distinguishes pre-ready startup failure from post-ready request failure, ready from healthy, recovered/degraded success from clean success, no silent replay for unsafe work, and graceful/forced/incomplete cleanup. |
| AC3 TypeScript worker-only role; TASK-RHLA-3/4 | `npm run check`; `npm test`; targeted tests for `packages/opencode-app/src/worker/*.test.ts`, `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`, and `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts` when those files are touched | Worker tests prove `dh.initialize` / `dh.initialized` / `dh.ready` / `session.runCommand` / `runtime.ping` / `dh.shutdown` behavior and host-backed `BridgeClient` use; legacy `createDhJsonRpcStdioClient()` remains compatibility-only and is not used by the supported Rust-host worker path. |
| AC8 operator/runtime wording and AC11 mixed-topology labeling; TASK-RHLA-6 | `npm run check`; `npm test`; targeted text review of touched docs, diagnostics, presenters, and runtime messaging | Touched wording says first-wave `ask` / `explain` / `trace` are Rust-hosted only where implementation proves that surface; remaining TypeScript-hosted paths are labeled legacy/compatibility/out-of-scope; no wording claims daemon mode, remote socket/control plane, Windows support, generic shell/worktree lifecycle redesign, or full workflow-lane parity. |
| AC9 no manual TypeScript host bootstrap and AC10 runtime-launch truth; TASK-RHLA-2/5/7 | `cargo test --workspace --manifest-path rust-engine/Cargo.toml`; Rust-host ask/explain/trace smoke/e2e after implementation adds the surface; Linux and macOS runtime-launch truth checks in the supported environments | Evidence shows operators start the supported path through the Rust host without manually starting TypeScript; Linux/macOS launch checks cover Node/runtime discovery, worker bundle path, manifest/protocol version, checksum/corrupt bundle, non-launchable runtime, and unsupported platform classification without adding Windows support. |
| Bundle/manifest and release packaging when TASK-RHLA-5 touches packaging | `scripts/build-cli-bundle.sh` or the new worker-bundle script; `make build` if the Makefile is updated to depend on the worker bundle; `scripts/verify-release-artifacts.sh dist/releases` if release verification changes; `scripts/test-installers.sh dist/releases` only if installer assertions change and `dist/releases` is available | Worker bundle and manifest exist at the path Rust validates; manifest records worker version, protocol version, entry path, checksum, and required Node major version; release artifacts include or intentionally exclude the worker bundle consistently with the supported path; Linux/macOS artifact truth is preserved and no Windows packaging support is introduced. |
| AC12 bounded scope and downstream handoff readiness; all slices | `npm run check`; `npm test`; `cargo test --workspace --manifest-path rust-engine/Cargo.toml`; final Rust-host ask/explain/trace smoke/e2e for implemented surfaces; manual process-tree evidence | Final evidence bundle includes command outputs, process-tree capture, runtime-launch failure captures, and touched-surface wording review; Code Review and QA can verify the feature stayed within first-wave local child-process host inversion with no daemon, no remote socket, no Windows support, no generic shell/worktree lifecycle redesign, and no broadened platform-supervisor claim. |

## Acceptance Mapping

| Scope acceptance | Solution mapping |
| --- | --- |
| AC1 real topology inversion | TASK-RHLA-2/3/4 make Rust spawn the TS worker and keep TS from spawning Rust on the supported `ask`/`explain`/`trace` path; TASK-RHLA-7 captures process-tree evidence. |
| AC2 Rust sole lifecycle authority | TASK-RHLA-1 defines Rust lifecycle vocabulary; TASK-RHLA-2 owns state transitions; TASK-RHLA-4 emits Rust final lifecycle envelope. |
| AC3 TS worker/thin-client role | TASK-RHLA-3 injects host-backed `BridgeClient`; TypeScript handles workflow/output only and cannot own host lifecycle. |
| AC4 startup vs request failure | TASK-RHLA-1/2 define phases and timeout classes; TASK-RHLA-7 requires pre-ready and post-ready failure evidence. |
| AC5 ready vs healthy | TASK-RHLA-1/2 separate `workerState` from `healthState`; `runtime.ping` maps worker facts into Rust health classification. |
| AC6 replay-safe recovery moves to Rust | TASK-RHLA-2 owns one-attempt replay-safe restart; TASK-RHLA-4 reports recovered/degraded success. |
| AC7 replay-unsafe work not replayed | TASK-RHLA-2 defaults uncertain or side-effecting work to no auto replay; first-wave knowledge commands are read-only, but the guard must exist for future expansion. |
| AC8 operator/runtime wording matches new truth | TASK-RHLA-6 updates docs/diagnostics/presenter wording and labels legacy paths. |
| AC9 no manual TS host bootstrap | TASK-RHLA-2/5 make Rust validate and launch the worker; operators do not start TypeScript separately on supported path. |
| AC10 runtime-launch failures truthful | TASK-RHLA-2/5 classify missing Node/runtime/bundle/manifest/protocol failures as Rust-host startup/lifecycle problems. |
| AC11 mixed topology ambiguity not hidden | Boundary section plus TASK-RHLA-6 label unmigrated TS-hosted paths legacy/compatibility/out-of-scope. |
| AC12 scope remains bounded | Non-goals, first-wave supported boundary, and reviewer focus reject daemon, remote transport, generic process orchestration, Windows support, and full workflow parity. |

## Risk Controls

- **Mixed topology risk**: keep old TS-host bridge as compatibility only; new supported path must be Rust host -> TS worker. Reviewers should reject any implementation where supported-path worker code calls `createDhJsonRpcStdioClient()` to spawn Rust.
- **Second lifecycle truth risk**: host lifecycle report comes only from Rust; TypeScript report may include command evidence and worker-local diagnostics but no authoritative startup/health/recovery/cleanup classification.
- **Runtime launch visibility risk**: Node/runtime/bundle/manifest/protocol checks happen before command dispatch and fail as startup/lifecycle errors.
- **Recovery overclaim risk**: one automatic restart only, only for replay-safe work, never after final response, never for protocol mismatch or uncertain side effects.
- **Cleanup/orphan risk**: supervisor owns child handle, drains pending requests, attempts graceful `dh.shutdown`, then forced termination; forced/incomplete cleanup is reportable.
- **Protocol deadlock risk**: do not block the stdio transport loop while servicing reverse-RPC. Use queued handlers and request correlation so worker-to-host query calls can complete while host owns the top-level command request.
- **Platform drift risk**: keep Linux/macOS target list explicit and treat other OSes as unsupported without Windows-specific remediation.
- **Scope creep risk**: any need for daemon/pool/remote transport/generic tool orchestration/full workflow parity must return to Product Lead/Solution Lead rather than being absorbed here.

## Rollback / Fallback Plan

- Keep the existing TypeScript-hosted Rust bridge path and `dh-engine serve` behavior intact until the Rust-hosted first-wave path passes integration and QA.
- If Rust-hosted `ask`/`explain`/`trace` fails late, disable or withhold the supported-path claim and keep the old path labeled legacy/compatibility rather than partially claiming Rust authority.
- If worker bundle packaging is unstable, rollback packaging changes separately while preserving code changes behind a development-only launch path; do not ship a release path that cannot validate worker launchability.
- If protocol inversion creates query regressions, rollback to the previous TS-host path and keep all docs saying Rust-host lifecycle authority is not yet supported.
- Rollback must remove or revert operator wording that says Rust-host authority is supported if the process tree evidence does not prove it.
- No data migration is expected. Rollback is code, bundle, script, and documentation rollback only.

## Reviewer Focus Points

- Confirm the supported path has a Rust parent process and a TypeScript child worker process.
- Confirm TypeScript worker mode never starts Rust and never treats itself as lifecycle host.
- Confirm Rust owns and emits lifecycle fields for spawn/ready/health/timeout/recovery/shutdown/final exit.
- Confirm JSON-RPC remains local stdio with framed protocol and no network listener.
- Confirm remaining TS-hosted paths are clearly labeled legacy/compatibility/out-of-scope.
- Confirm Linux/macOS target clarity is preserved and no Windows implementation work appears.
- Confirm tests cover startup failure, request failure, timeout, recovery, and cleanup outcomes.

## Preservation Notes By Downstream Role

- **Fullstack Agent must preserve** the first-wave boundary, Rust lifecycle authority, TypeScript worker-only role, legacy-path labeling, Linux/macOS platform truth, and no-daemon/no-remote/no-Windows constraints.
- **Code Reviewer must preserve** scope compliance first: reject TypeScript spawning Rust on the supported path, hidden fallback to TS-host lifecycle truth, generic method passthrough, network control plane, persistent pools, or broadened workflow parity.
- **QA Agent must preserve** runtime evidence: process tree, lifecycle phase classification, startup/request failure distinction, recovered/degraded success wording, no silent replay for unsafe work, cleanup outcome, and operator wording consistency.
