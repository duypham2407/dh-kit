---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: PROCESS-MANAGER-COMPLETION
feature_slug: process-manager-completion
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Process Manager Completion

## Goal

- Complete the bounded Rust host / TypeScript worker process-manager contract so the product can truthfully manage worker lifecycle across spawn, readiness, health, timeout, crash, recovery decision, degraded operation, and cleanup on the current local JSON-RPC-over-stdio path.

## Target Users

- OpenKit operators and maintainers who run host-managed command paths and need clear lifecycle truth instead of implicit child-process behavior.
- Downstream Solution Lead, Code Reviewer, and QA as consumers of a scope package that defines the lifecycle contract without requiring them to rediscover intent from architecture notes.

## Problem Statement

- The architecture direction is already clear: Rust is the host/control plane and TypeScript is the separate workflow worker process. What is still incomplete is the bounded product contract for how that process relationship behaves in real operator-facing lifecycle scenarios.
- Adjacent bridge work establishes transport and some failure taxonomy, but it does not yet finish the full process-manager story across spawned-versus-ready state, health truthfulness after readiness, startup-versus-request failure classification, timeout classes, safe restart boundaries, degraded recovery messaging, and cleanup guarantees.
- Without this feature, the product can still overstate readiness, blur startup failure with request failure, hide recovered or degraded execution behind normal success wording, or leave lifecycle expectations to implementation guesswork.

## In Scope

- Complete the bounded product contract for Rust-host-managed TypeScript-worker lifecycle on the current local JSON-RPC-over-stdio runtime path.
- Make the following lifecycle distinctions inspectable, even if final enum/string names differ in implementation:
  - worker not running
  - worker process spawned but not ready
  - worker ready for request handling
  - worker handling an active request
  - worker degraded or unhealthy
  - worker shutting down
  - terminal outcomes for clean stop, startup failure, request failure, crash/signal termination, and timeout
- Define truthful readiness behavior, including the distinction between process spawn and actual readiness.
- Define truthful health behavior after readiness, including how the product distinguishes healthy, degraded/unhealthy, and blocked lifecycle states.
- Define explicit failure classification for:
  - preflight or startup failure before ready
  - request failure after ready
  - crash/signal termination
  - protocol or transport-level lifecycle failure
  - timeout classes relevant to startup, request handling, health monitoring, and shutdown
- Define bounded crash and restart behavior, including when automatic recovery is allowed and when it is forbidden.
- Define cleanup expectations after success, cancellation, timeout, crash, forced termination, and explicit failure.
- Define operator-visible lifecycle wording for command and diagnostic surfaces so degraded recovery and blocked states are truthful.
- Allow scoped wording or diagnostic updates where needed to make process/lifecycle behavior truthful to current repo reality.

## Out of Scope

- Daemonization, background service mode, distributed runtime, remote transport, or persistent worker pools.
- Any transport redesign away from local JSON-RPC over stdio.
- Broad redesign of agent behavior, workflow semantics, search behavior, or multi-language support.
- Multi-worker orchestration, load balancing, or generalized worker pooling.
- Packaging, release, or distribution overhaul beyond the minimum lifecycle wording needed to keep operator-visible behavior truthful.
- New guarantees of performance, throughput, or SLA beyond bounded lifecycle classification and timeout handling.
- Silent replay or exactly-once guarantees for mutating or side-effecting work.
- Broad telemetry, observability, or logging redesign outside what is required to make lifecycle states and outcomes inspectable.

## Main Flows

- **Flow 1 — Successful on-demand lifecycle**
  - Rust host resolves runtime prerequisites.
  - Rust host spawns the TypeScript worker.
  - The worker is treated as spawned but not ready until readiness completes.
  - The host reaches the defined ready state, dispatches the request, receives a terminal result, and performs bounded cleanup.

- **Flow 2 — Startup fails before ready**
  - The host starts a command path.
  - Preflight, spawn, initialize, handshake, or readiness fails or times out before the worker is ready.
  - The operator receives a startup-class failure, not a request-class failure.
  - The host cleans up partial lifecycle state and does not imply that request handling began successfully.

- **Flow 3 — Worker is ready but request fails**
  - The worker reaches ready state.
  - A request is dispatched.
  - The request fails after readiness because of handled error, timeout, transport breakage, or worker crash.
  - The operator receives a request-class failure distinct from startup failure.

- **Flow 4 — Safe crash recovery on replay-safe work**
  - The worker crashes or becomes unusable before the final response.
  - The host determines the active work is read-only or idempotent and replay-safe.
  - The host may restart the worker once and retry from saved command context.
  - If the command later succeeds, the surfaced result still shows that recovery occurred and that the run was degraded/recovered rather than a clean first-pass success.

- **Flow 5 — Crash during replay-unsafe or mutating work**
  - The worker crashes, times out, or becomes uncertain after side effects may have started.
  - The host does not silently replay the command.
  - The operator is told what is known, what is unknown, what automatic action was not taken, and what manual next step is required.

- **Flow 6 — Cancellation and shutdown cleanup**
  - The operator cancels the command or the command reaches a terminal outcome.
  - The host attempts graceful shutdown first, then bounded forced termination if needed.
  - The command does not leave orphan worker processes or hidden pending request state.

## Business Rules

- Rust host is the only lifecycle authority for worker spawn, readiness gating, health classification, timeout enforcement, restart decision, and cleanup.
- TypeScript remains a separate worker subprocess and must not become the lifecycle supervisor in this feature.
- Local JSON-RPC over stdio remains the only supported process boundary for this feature.
- A spawned worker is not equivalent to a ready worker. Readiness requires successful completion of the defined startup/readiness handshake; request handling that depends on readiness must not be treated as started or successful before that point.
- Readiness and health are distinct concepts. A worker may be ready and later become degraded or unhealthy; operator-visible state must not treat that worker as fully healthy without evidence.
- The product must make startup failure and request failure phase-aware and distinguishable:
  - failures before ready are startup failures
  - failures after ready during active handling are request failures
- The product must classify at least these timeout families distinctly, even if the exact implementation labels differ:
  - startup timeout
  - request timeout
  - health or heartbeat timeout
  - graceful shutdown timeout
- Crash or signal termination must be distinguishable from handled request error and from normal clean exit.
- Automatic worker restart is allowed only when all of the following are true:
  - the current operation is read-only or idempotent
  - the host remains healthy enough to continue
  - the failure cause is not protocol mismatch or another non-replay-safe condition
  - no final user response has already been completed
- Automatic restart/replay is limited to one attempt per command path.
- Mutating or side-effecting work must never be silently replayed after crash, timeout, or uncertain completion.
- If the host proceeds through a recovered or partially degraded lifecycle path, the surfaced result must say so explicitly rather than presenting that run as an ordinary healthy success.
- Non-fatal lifecycle prerequisites may degrade the runtime instead of blocking it, but only when the product can still proceed safely and the degraded limitations are made explicit.
- Serious lifecycle messages must answer all three of these operator questions:
  - what failed
  - what the product did automatically
  - what the operator should do next
- Cleanup must clear pending lifecycle/request bookkeeping and end the worker lifecycle cleanly or by explicit forced termination. If cleanup is forced or incomplete, that condition must remain inspectable.
- On-demand execution is the primary contract for this feature. The scope must not imply persistent background workers except where an already-supported session-owned reuse path is explicitly and truthfully available.

## Acceptance Criteria Matrix

- **Given** a command path starts and the worker process has been created but readiness is not yet complete, **when** lifecycle state is surfaced, **then** the product distinguishes spawned-but-not-ready from ready and does not treat request handling as successfully started before readiness.
- **Given** preflight, spawn, initialize, handshake, or readiness fails before the worker becomes ready, **when** the operator receives the outcome, **then** it is classified as startup failure, no successful request outcome is implied, and partial lifecycle state is cleaned up.
- **Given** the worker has already reached ready state, **when** a request later fails, **then** the surfaced outcome is classified as request failure rather than startup failure.
- **Given** the worker reaches ready state and later becomes degraded or unhealthy, **when** that condition is surfaced, **then** the product does not label the runtime as fully healthy and instead shows the degraded limitation and next action truthfully.
- **Given** a startup timeout, request timeout, health/heartbeat timeout, or graceful shutdown timeout occurs, **when** the product surfaces the event, **then** the timeout class is distinguishable enough that operators and downstream roles can tell which phase timed out.
- **Given** the worker crashes before a final response on read-only or idempotent replay-safe work, **when** the host performs automatic recovery, **then** the host may restart the worker once, and any eventual success remains marked as recovered/degraded rather than indistinguishable from first-pass healthy success.
- **Given** the worker crashes, times out, or becomes uncertain during mutating or replay-unsafe work, **when** the product handles that failure, **then** it does not silently replay the work and instead returns an explicit failure that states the uncertainty and required manual next step.
- **Given** the worker exits because of crash or signal termination, **when** the operator-visible result is produced, **then** that outcome is distinguishable from normal clean exit and from handled request error.
- **Given** a command reaches success, explicit failure, timeout, or cancellation, **when** cleanup completes, **then** the process manager does not leave orphan worker state as the apparent normal result; graceful cleanup is attempted first and forced termination, if needed, remains inspectable.
- **Given** a non-fatal prerequisite or recovery path leaves the runtime usable but limited, **when** the operator sees the runtime condition, **then** it is surfaced as degraded with explicit wording about what still works, what is limited, and what to do next.
- **Given** doctor or lifecycle diagnostics report worker readiness or runtime health, **when** launchability, protocol compatibility, readiness handshake, or basic worker-health verification cannot be established, **then** the product does not report the lifecycle as fully healthy.
- **Given** this feature is reviewed for scope discipline, **when** the resulting contract is inspected, **then** it remains bounded to local host/worker lifecycle completion and does not promise daemon mode, distributed runtime, persistent worker pools, or unrelated runtime redesign.

## Edge Cases

- The worker process exists and may have emitted bootstrap output, but readiness handshake never completes.
- The worker becomes ready, then unhealthy while idle, before a new request starts.
- The worker becomes unhealthy during an active request after some progress but before final response.
- A non-fatal prerequisite issue allows safe execution to continue, but only in a degraded state.
- A replay-safe command succeeds after one automatic restart and must still surface that recovery occurred.
- Cleanup times out after the command result is already known, requiring forced termination without changing the already-known command outcome.
- Protocol mismatch, transport corruption, or broken pipe appears in a way that should not be treated as an ordinary handled request error.

## Error And Failure Cases

- Runtime payload missing, corrupted, or not launchable.
- Protocol version mismatch or manifest/contract incompatibility.
- Startup failure before ready, including spawn timeout or initialize/readiness timeout.
- Request failure after ready, including handled request error and request timeout.
- Health degradation or health-timeout path after readiness.
- Worker crash, signal termination, broken pipe, EOF, or transport corruption.
- Replay-safe restart attempted but unsuccessful.
- Replay-unsafe or mutating work left in uncertain completion state after crash or timeout.
- Graceful shutdown timeout requiring forced termination.
- Operator-visible messaging that falsely reports healthy success, hides recovery, or hides uncertainty.

## Open Questions

- None at Product Lead handoff. If implementation evidence shows any lifecycle distinction above cannot be supported truthfully in current repository reality, Solution Lead should narrow the contract explicitly rather than hiding the limitation.

## Success Signal

- Operators and maintainers can tell whether the worker was merely spawned or actually ready, whether a failure happened during startup or during request handling, whether recovery was attempted, and whether cleanup completed cleanly.
- The product can truthfully describe one bounded Rust-host / TypeScript-worker lifecycle contract for the current local runtime without implying unsupported daemon, pool, or distributed behavior.
- Solution Lead can design implementation without inventing process-state semantics, restart policy, degraded-state wording, or cleanup expectations.

## Handoff Notes For Solution Lead

- Preserve the architecture boundary from the migration direction and explicit feature intent: Rust is the lifecycle host/control plane, TypeScript is the separate workflow worker. Do not solve this feature by shifting lifecycle ownership back into the TypeScript side.
- Freeze one inspectable lifecycle vocabulary before broadening surfaces. The exact field names may differ, but the distinctions approved here must remain inspectable.
- Preserve the critical product separations:
  - spawned vs ready
  - ready vs healthy
  - startup failure vs request failure
  - clean exit vs crash/signal termination
  - replay-safe recovery vs replay-unsafe failure
  - degraded but usable vs blocked
- Keep the restart policy bounded and truthful: at most one automatic replay-safe restart, never silent replay of mutating work.
- Keep the transport and runtime shape bounded to local JSON-RPC over stdio, on-demand-first lifecycle behavior, and current repo reality.
- If any operator-visible lifecycle claim above cannot be implemented truthfully, narrow the claim in the solution package instead of broadening the architecture or hiding the limitation.
