---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: RUST-HOST-LIFECYCLE-AUTHORITY
feature_slug: rust-host-lifecycle-authority
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Rust Host Lifecycle Authority

RUST-HOST-LIFECYCLE-AUTHORITY scopes the bounded architecture move from today’s TypeScript-host/orchestrator -> Rust bridge subprocess topology to a supported Rust-host -> TypeScript-worker topology for local worker-backed DH command execution. This feature is successful only if Rust becomes the sole lifecycle authority for the supported end-to-end process tree, TypeScript is reduced to worker-only or thin-client responsibilities on that path, operator surfaces tell one truthful lifecycle story, and the work does not silently widen into daemon mode, remote control plane behavior, or generic platform orchestration.

## Goal

- Make Rust the supported host and sole lifecycle authority for the in-scope local DH process tree.
- Replace the current product truth of “TypeScript host/orchestrator starts Rust bridge” with the new product truth of “Rust host starts and supervises the TypeScript worker” on the supported path.
- Preserve the bounded lifecycle semantics already defined in adjacent lifecycle work while moving authority for those semantics into the Rust host boundary.
- Keep the feature explicitly local, bounded, and operator-honest.

## Target Users

- OpenKit operators and maintainers who need one truthful lifecycle story for the local DH runtime instead of a split TypeScript-host vs Rust-host narrative.
- Downstream Solution Lead, Code Reviewer, and QA as consumers of one canonical scope package for the architecture move.

## Problem Statement

- Current repository reality remains: TypeScript host/orchestrator -> Rust bridge subprocess.
- `PROCESS-MANAGER-COMPLETION` intentionally completed lifecycle seam productization on that current topology and explicitly deferred full Rust-host lifecycle authority to a separate future feature.
- The architecture and process-model references already say the desired long-term product center of gravity is different: Rust should be the host, and TypeScript should behave as a worker.
- Without a separate bounded feature, product truth stays split in a risky way:
  - architecture docs point toward Rust host authority
  - current runtime behavior still centers TypeScript as the practical command-path host
  - operator and reviewer wording can drift into overclaiming host inversion before the repo actually supports it
- This feature exists to make that architecture move real, inspectable, and bounded rather than implied by documentation drift.

## In Scope

- Rust becomes the parent/supervisor process for the supported local, on-demand, worker-backed DH command path.
- Rust directly starts, monitors, and shuts down the TypeScript worker on the supported path.
- Rust becomes the sole lifecycle authority on the supported path for:
  - runtime launchability and startup gating
  - worker spawn and readiness truth
  - liveness and health classification
  - timeout classification and enforcement
  - cancellation handling and restart/recovery decisions
  - shutdown and cleanup outcome
  - final command-path exit status for the end-to-end process tree
- TypeScript is reduced to worker-only or thin-client responsibilities on the supported path, including workflow logic, agent orchestration, prompt/context assembly, LLM/provider interaction, session memory, and output shaping.
- The lifecycle distinctions approved in adjacent process-manager work remain required after host inversion, including:
  - spawned vs ready
  - ready vs healthy
  - startup failure vs request failure
  - recovered/degraded success vs clean first-pass success
  - replay-safe recovery vs replay-unsafe failure
  - graceful vs forced/incomplete cleanup
- Operator-facing and maintainer-facing runtime truth is updated so that the supported path is described as Rust-hosted and TypeScript-worker-based, not TypeScript-hosted.
- The supported path stays local-only and child-process-based; users are not expected to manually start or supervise the TypeScript side.
- Minimal runtime-launch truth needed to support the Rust-hosted model is in scope, including truthful handling when the worker runtime or bundle is missing, mismatched, corrupt, or not launchable.
- If rollout is phased, any unmigrated path must be explicitly labeled out of scope, legacy, or compatibility-only rather than being implied to share Rust-host lifecycle authority.

## Out of Scope

- Daemon mode, background service mode, persistent worker pools, warm-worker control planes, or `dhd`-style long-lived host orchestration.
- Remote transport, remote execution, local-socket control plane promotion, or any TCP/HTTP/gRPC/network listener design.
- Generic platform orchestration, job scheduling, multi-tenant supervision, or arbitrary subprocess control beyond the DH worker process tree.
- Rewriting the workflow/agent brain from TypeScript into Rust or removing the TypeScript worker entirely.
- Claiming that Rust host authority now covers every future surface, plugin path, or maintenance utility not explicitly included in the supported path.
- Security sandboxing, privilege separation, or OS-isolation redesign beyond the existing local same-privilege model.
- Packaging optimization work such as self-extracting single-binary distribution, installer-channel expansion, or release-channel redesign beyond the minimum needed to make Rust-launched worker truth operationally honest.
- Any universal control-plane claim such as “Rust now orchestrates the platform” or “Rust is a generic process manager for all commands.”

## Main Flows

- **Flow 1 — Successful Rust-hosted command path**
  - Operator starts an in-scope local worker-backed DH command.
  - Rust performs startup checks and launches the TypeScript worker.
  - The worker is treated as spawned but not ready until readiness completes.
  - Rust authorizes request handling, supervises the command lifecycle, and performs shutdown/cleanup.

- **Flow 2 — Startup failure before ready**
  - Operator starts an in-scope command.
  - Rust cannot launch the worker cleanly, or startup/readiness fails before the worker is ready.
  - The surfaced result is a startup-class failure owned by the Rust host, not a request-class failure and not a TypeScript-host failure.

- **Flow 3 — Ready worker, later request failure**
  - Worker reaches ready state under Rust host supervision.
  - Active command work later fails because of request error, timeout, bridge loss, or worker crash.
  - Rust remains the authoritative owner of lifecycle classification and terminal reporting for that failure.

- **Flow 4 — Replay-safe recovery under Rust authority**
  - Worker crashes or becomes unusable before final response on replay-safe work.
  - Rust decides whether one automatic replay-safe recovery attempt is allowed.
  - If recovery succeeds, the surfaced result remains explicitly recovered/degraded rather than looking like clean first-pass success.

- **Flow 5 — Replay-unsafe or uncertain failure**
  - Worker crashes, times out, or becomes uncertain after side effects may have started.
  - Rust does not silently replay the work.
  - Operator receives explicit uncertainty, lifecycle status, and next-step guidance.

- **Flow 6 — Operator inspection of host truth**
  - Operator or maintainer inspects docs, doctor output, presenter wording, or runtime messaging on the supported path.
  - All touched surfaces tell the same story: Rust is host/lifecycle authority, TypeScript is worker/thin client, and the feature remains local and bounded.

## Operator / Runtime Truth Rules

### Product-truth changes required by this feature

- On the supported path, the truthful topology changes from:
  - `TypeScript host/orchestrator -> Rust bridge subprocess`
- To:
  - `Rust host binary -> TypeScript worker subprocess`
- On that supported path, TypeScript is no longer allowed to be presented as the top-level host, supervisor, or lifecycle authority.
- Any remaining TypeScript-hosted path after delivery must be explicitly labeled as outside this feature’s completion claim.

### Lifecycle authority rules

- Rust is the sole source of truth for host-level lifecycle state on the supported path.
- Rust owns the authoritative story for:
  - startup eligibility
  - spawn
  - ready/not-ready
  - healthy/degraded/blocked
  - timeout class
  - replay-safe recovery decision
  - shutdown outcome
  - final exit status
- TypeScript may report worker-level workflow activity, but it may not create a competing host-lifecycle story.
- If TypeScript presentation and Rust lifecycle facts disagree, Rust lifecycle truth wins.

### TypeScript worker-boundary rules

- TypeScript remains responsible for workflow and reasoning behavior inside the worker boundary.
- TypeScript may own:
  - workflow mode logic
  - agent orchestration
  - prompt/context assembly
  - LLM/provider calls
  - session memory and response shaping
- TypeScript may not own on the supported path:
  - top-level process spawning of Rust
  - top-level worker supervision policy
  - top-level timeout authority
  - top-level lifecycle recovery authority
  - top-level final exit-code authority for the process tree

### Boundary rules that must stay explicit

- Host inversion for this feature is a local process-tree change, not a networked control-plane launch.
- The supported host/worker relationship remains local-only and bounded to DH’s own process tree.
- Rust lifecycle authority in this feature does not imply daemon mode, warm background pooling, remote orchestration, or generic subprocess-management claims.
- Install/readiness truth, workflow-state truth, and host-lifecycle truth must stay distinct in operator messaging; this feature changes host-lifecycle truth, not workflow-stage authority.

## Inspectable Acceptance Expectations

- Reviewers can trace one supported parent-child process story from Rust entrypoint -> TypeScript worker launch -> ready state -> request handling -> shutdown.
- Reviewers can inspect where TypeScript no longer acts as the top-level host on the supported path.
- Reviewers can inspect one authoritative lifecycle vocabulary across runtime behavior, presenter/doctor wording, and docs.
- Reviewers can inspect recovery and cleanup outcomes without inferring them from unrelated surfaces.
- Reviewers can inspect explicit out-of-scope boundaries showing that host inversion does not equal daemon mode, remote control plane, or generic process orchestration.

## Acceptance Criteria Matrix

- **AC1 — Real topology inversion on the supported path:** **Given** an in-scope local worker-backed DH command is started, **when** the live process relationship is inspected, **then** Rust is the parent/host process for that path and directly launches the TypeScript worker instead of TypeScript launching Rust.
- **AC2 — Rust is sole lifecycle authority:** **Given** spawn, readiness, health, timeout, recovery, shutdown, or final exit status is surfaced for an in-scope path, **when** operators or reviewers inspect the outcome, **then** Rust is the authoritative lifecycle truth source and TypeScript does not present a competing host-lifecycle story.
- **AC3 — TypeScript is reduced to worker-only or thin-client role:** **Given** an in-scope path is running after startup, **when** responsibilities are inspected, **then** TypeScript is limited to worker-bound workflow/agent/LLM/session/output responsibilities and is not the top-level supervisor of the process tree.
- **AC4 — Startup versus request failure remains phase-aware after inversion:** **Given** a failure occurs before the worker becomes ready, **when** the outcome is surfaced, **then** it is classified as startup failure; **and given** a failure occurs after ready during active work, **when** the outcome is surfaced, **then** it is classified as request failure.
- **AC5 — Ready does not automatically mean healthy:** **Given** the worker reaches ready state and later becomes unhealthy or degraded, **when** the state is surfaced, **then** the product distinguishes ready from healthy and does not label the path fully healthy without supporting evidence.
- **AC6 — Replay-safe recovery authority moves to Rust:** **Given** the worker crashes before final response on replay-safe work, **when** automatic recovery is attempted, **then** Rust decides whether one replay-safe retry is allowed, and any eventual success remains marked as recovered/degraded rather than clean first-pass success.
- **AC7 — Replay-unsafe work is not silently replayed:** **Given** the worker crashes, times out, or becomes uncertain during replay-unsafe or side-effecting work, **when** the failure is handled, **then** the command is not silently replayed and the operator receives explicit uncertainty and next-step guidance.
- **AC8 — Operator/runtime wording matches the new product truth:** **Given** docs, doctor output, presenter wording, and runtime messaging touched by this feature are reviewed after delivery, **when** they are compared with live behavior, **then** they describe Rust as host/lifecycle authority and TypeScript as worker on the supported path and do not describe TypeScript as the command-path host.
- **AC9 — No manual TypeScript host bootstrap on the supported path:** **Given** an operator uses a supported in-scope path from the normal DH entrypoint, **when** the command starts, **then** the operator is not required to manually start or supervise the TypeScript side separately.
- **AC10 — Runtime-launch failures stay truthful:** **Given** the worker runtime or bundle is missing, mismatched, corrupt, or not launchable, **when** the command path is attempted, **then** the failure is surfaced as a Rust-host startup/lifecycle problem and not hidden behind ambiguous TypeScript-host wording.
- **AC11 — Mixed-topology ambiguity is not hidden:** **Given** any path remains outside the migrated Rust-host boundary at delivery time, **when** product wording or reviewer inspection compares covered and uncovered paths, **then** the remaining path is explicitly treated as out of scope, legacy, or compatibility-only rather than implied to share the new lifecycle-authority claim.
- **AC12 — Scope stays bounded after host inversion:** **Given** the delivered feature is inspected against this scope package, **when** Code Review and QA check feature boundaries, **then** the work has not broadened into daemon mode, remote control plane behavior, generic process orchestration, or broad platform-supervisor claims.

## Key Risks / Edge Cases

- A partial migration can leave two host stories in the product at once unless unmigrated paths are labeled explicitly.
- Runtime-launch failures become more visible once Rust is the sole host; missing or corrupt worker runtime assets cannot be hidden behind the old TypeScript-host path.
- Startup, readiness, health, and workflow-state terminology can drift unless one lifecycle vocabulary is preserved across docs and runtime surfaces.
- Replay-safe vs replay-unsafe recovery decisions can become less truthful if authority shifts to Rust without preserving the bounded recovery rules already approved.
- Signal handling and forced cleanup may leave orphan or ambiguous worker state if end-to-end authority is claimed before cleanup truth is inspectable.
- Host inversion may be overread as justification for daemon mode, warm pools, or broader orchestration even though those are intentionally out of scope.
- A phased rollout can create valid temporary mixed topology, but only if the boundary is explicit and not marketed as universal completion.

## Error And Failure Cases

- Rust cannot locate, validate, or launch the worker runtime on a supported path.
- Rust launches the worker, but readiness never completes.
- Worker reaches ready, then request handling fails, times out, or loses transport.
- Worker health degrades after ready while idle or while active.
- Worker crashes or is terminated by signal before final response.
- Graceful shutdown fails and forced termination is required.
- TypeScript still attempts to behave as host on a path claimed to be Rust-hosted.
- Operator-visible wording claims broader host authority than the repository actually implements.

## Open Questions

- No blocking product ambiguity remains before Solution Lead planning.
- If Solution Lead wants a phased rollout rather than one-shot migration of every current worker-backed on-demand path, the exact first-wave supported path must be declared explicitly in the solution package and preserved in operator wording.

## Success Signal

- The repository can truthfully say that the supported local worker-backed DH path is Rust-hosted and Rust-lifecycle-authoritative.
- Operators and maintainers can inspect one consistent lifecycle story without reconstructing which process actually owns startup, readiness, recovery, or shutdown.
- TypeScript is truthfully reduced to worker-only or thin-client responsibilities on the supported path.
- The feature delivers host inversion without implying daemon mode, remote orchestration, or generic platform supervision.

## Handoff Notes For Solution Lead

- Preserve the approved product boundary exactly: this is a bounded Rust-host lifecycle-authority feature, not a generic platform-runtime rewrite.
- Preserve the lifecycle distinctions already approved in `PROCESS-MANAGER-COMPLETION`; the architecture move changes who owns the lifecycle authority, not whether those distinctions still exist.
- Keep TypeScript in a worker-only or thin-client role on the supported path; do not solve the feature by leaving TypeScript as practical top-level host under a different label.
- Keep any phased rollout explicit. If every worker-backed on-demand path is not migrated in one step, the solution package must name the supported path and the remaining legacy/compatibility paths clearly.
- Do not use host inversion as cover for daemon mode, warm pools, remote transport, or generic orchestration.
- Treat packaging/runtime-launch details as solution choices unless they alter product truth. What must remain true at product level is that operators do not manually bootstrap the TypeScript host side on the supported path.
