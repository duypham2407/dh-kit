---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: LIFECYCLE-SEAM-PRODUCTIZATION
feature_slug: lifecycle-seam-productization
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Lifecycle Seam Productization

LIFECYCLE-SEAM-PRODUCTIZATION makes the already-implemented Rust bridge lifecycle seam (`session.runCommand`, `runtime.ping`) a real bounded TypeScript/operator product path on current repository reality. This feature is successful only if Rust remains the sole truth owner for readiness/ping/delegated request outcome on the current bridge seam, TypeScript stays limited to typed routing/consumption/presentation, operators can inspect lifecycle truth without inferring it from unrelated surfaces, and the delivered scope stays honest about the current TypeScript-host -> Rust-bridge topology.

## Goal

- Make `session.runCommand` and `runtime.ping` first-class, inspectable, bounded product surfaces on the current Rust bridge path.
- Close the gap between live Rust lifecycle-seam support and missing typed TS/operator consumption on current repo reality.
- Preserve strict ownership boundaries:
  - Rust owns lifecycle seam truth, ready/ping/request outcome truth, and bounded delegated command execution truth.
  - TypeScript owns typed routing, consumption, presentation, and operator/runtime usage only.
- Keep the feature bounded and architecture-honest.

## Target Users

- OpenKit operators and maintainers who need inspectable lifecycle truth on the current command/runtime path.
- Current TypeScript runtime/workflow consumers that need a typed bounded way to use the existing lifecycle seam.
- Solution Lead, Code Reviewer, and QA as downstream consumers of an explicit product contract.

## Problem Statement

- Current repository state already includes real Rust bridge lifecycle-seam methods for:
  - `session.runCommand`
  - `runtime.ping`
- Current repository state also shows the TypeScript/app product layer does not yet expose those two seam methods as typed consumer/operator surfaces.
- That leaves a product-truth gap:
  - lifecycle seam truth exists in Rust
  - capability intent is visible in bridge/runtime materials
  - but current TS/operator paths do not make that seam inspectable as a first-class bounded product path
- Without this feature, lifecycle truth can remain hidden behind internal bridge handlers, tests, or adjacent surfaces, and downstream paths may continue inferring state from other mechanisms instead of consuming the seam directly.
- This feature is needed to make the current seam real and reviewable on the repo as it exists now, without pretending the broader Rust-host architecture inversion is already shipped.

## In Scope

- Add typed TypeScript consumption for `runtime.ping` on the current bridge/client path.
- Add typed TypeScript consumption for `session.runCommand` on the current bridge/client path.
- Make at least one existing current operator/runtime surface use `runtime.ping` as a real lifecycle-seam input.
- Make at least one existing current bounded TS consumer path use `session.runCommand` as a real delegated request path.
- Keep `session.runCommand` explicitly bounded to the current delegated command contract already supported on the seam; it must not become arbitrary generic execution.
- Keep `runtime.ping` explicitly bounded to lifecycle/liveness truth for the current seam.
- Make success and non-success outcomes inspectable for both lifecycle-seam methods, including where applicable:
  - success
  - degraded or unavailable seam state
  - timeout
  - unsupported/refused delegated method
  - delegated request failure
  - transport or seam unavailability surfaced through the touched path
- Align bridge capability truth, typed TS contract truth, operator/runtime wording, and documentation to current repo reality.
- Preserve existing architecture honesty from prior lifecycle/process-manager work:
  - current runtime reality remains TypeScript host/orchestrator -> Rust bridge subprocess
  - this feature productizes the seam inside that topology instead of claiming topology inversion

## Out of Scope

- Claiming or implementing Rust-host topology inversion.
- Daemon mode, persistent worker pools, warm-worker architecture expansion, or remote transport.
- Replacing the current bridge transport or redesigning the process model.
- Turning `session.runCommand` into arbitrary generic command execution, raw shell passthrough, or a catch-all bridge dispatch surface.
- Expanding `session.runCommand` beyond the currently bounded delegated command family unless separately scoped.
- Replacing `runtime.health` / `runtime.diagnostics` with `runtime.ping`, or hiding workflow-state, approval, release-readiness, or install-health claims inside `runtime.ping`.
- Broad CLI taxonomy redesign or a new operator command family unless the smallest truthful existing surface cannot support the required inspectability.
- General process-manager reimplementation beyond what is required to productize the two existing seam methods.

## Main Flows

- **Flow 1 — Operator/runtime lifecycle check**
  - A current operator/runtime surface checks seam liveness.
  - TypeScript calls `runtime.ping` through a typed path.
  - Rust returns current seam truth.
  - The surfaced result stays bounded to lifecycle/liveness truth.

- **Flow 2 — Bounded delegated request on the current seam**
  - A current TS consumer path delegates an in-scope request through `session.runCommand`.
  - Rust accepts or refuses the delegated method according to the bounded current seam contract.
  - The terminal request outcome is surfaced without TS inventing a second truth source.

- **Flow 3 — Unsupported delegation is refused explicitly**
  - TS requests a method outside the bounded delegated command contract.
  - Rust refuses it explicitly.
  - The surfaced result remains unsupported/refused, not generic command execution.

- **Flow 4 — Seam unavailable or degraded**
  - `runtime.ping` or `session.runCommand` encounters timeout, seam loss, or other current-path unavailability.
  - The current touched path surfaces degraded/unavailable/failure truth explicitly.
  - The output does not flatten the condition into healthy success.

## Business Rules

- `session.runCommand` and `runtime.ping` are not documentation-only names in this feature; they must be real inspectable product paths.
- Rust remains the sole authority for:
  - lifecycle-seam truth
  - ready/ping/request outcome truth
  - bounded delegated command acceptance/refusal truth
- TypeScript may route, consume, and present seam results, but it may not override them.
- On the touched product path, TypeScript must not infer lifecycle truth from unrelated surfaces when direct seam truth is available.
- `session.runCommand` remains a bounded delegation surface for the current supported bridge request family only.
- `runtime.ping` remains a lifecycle/liveness surface only.
- Operator/runtime output must keep supported, degraded, unavailable, refused, and failed outcomes distinguishable.
- Delivery wording must stay honest about current topology and current support boundaries.

## Operator / Runtime Truth Rules

### Ownership rules

- Rust owns lifecycle seam truth, readiness/ping truth, delegated request outcome truth, and refusal truth.
- TypeScript owns typed request/response handling, operator/runtime routing, and presentation only.
- If TS presentation and Rust seam result disagree, Rust truth wins.

### Topology honesty rules

- The feature must describe current repo reality as TypeScript host/orchestrator -> Rust bridge subprocess.
- The feature must not claim that Rust is already the sole top-level host/supervisor.
- The feature must not use lifecycle-seam productization as a back door for broader architecture claims.

### `session.runCommand` boundary rules

- `session.runCommand` remains bounded delegated command execution on the current bridge seam.
- It must stay explicitly limited to the current supported delegated bridge request family already allowed by the seam.
- Unsupported delegated methods must be surfaced as explicit refusal/unsupported outcomes.
- `session.runCommand` must not become:
  - arbitrary RPC forwarding
  - generic command execution
  - shell/tool passthrough
  - a replacement for unrelated bridge/runtime surfaces

### `runtime.ping` boundary rules

- `runtime.ping` answers current seam lifecycle/liveness truth only.
- `runtime.ping` must not be presented as:
  - workflow-state truth
  - approval or release-readiness truth
  - install/distribution health truth
  - a substitute for broader runtime diagnostics beyond its bounded seam role
- If ping is unavailable, degraded, or times out, the surfaced result must remain unavailable/degraded and not be upgraded into healthy status.

### Inspectability rules

- Reviewers must be able to trace both methods through:
  - live Rust seam support
  - typed TS contract/wrapper
  - at least one current consumer/operator path
  - docs/tests or equivalent inspectable evidence path
- The feature is not complete if either method remains Rust-only, test-only, or documentation-only.

## Inspectable Acceptance Expectations

- Reviewers can inspect a typed TS surface for `runtime.ping`.
- Reviewers can inspect a typed TS surface for `session.runCommand`.
- Reviewers can identify the current operator/runtime surface that uses `runtime.ping` end to end.
- Reviewers can identify the current bounded TS consumer path that uses `session.runCommand` end to end.
- Reviewers can inspect success and non-success handling for both methods, not success-only wiring.
- Reviewer comparison across bridge capability truth, TS contract truth, operator/runtime output, and docs does not reveal a second lifecycle truth story.
- The delivered wording clearly distinguishes lifecycle-seam truth from:
  - `runtime.health` / `runtime.diagnostics`
  - workflow-state surfaces
  - broader architecture aspirations

## Acceptance Criteria Matrix

- **AC1 — Both seam methods are productized truthfully:** **Given** a reviewer inspects the delivered lifecycle-seam contract after this feature ships, **when** support is checked across Rust bridge capability truth and touched TS contract surfaces, **then** `session.runCommand` and `runtime.ping` are present only if they are live end to end and each has a typed TS consumer surface rather than Rust-only support.
- **AC2 — `runtime.ping` has a real operator/runtime path:** **Given** an operator or current TS runtime consumer uses the approved first-wave lifecycle-seam surface, **when** `runtime.ping` succeeds, **then** the surfaced output reflects Rust-returned seam lifecycle/liveness truth for the current path and does not substitute workflow-state, approval, release, or install-health claims.
- **AC3 — `runtime.ping` non-healthy outcomes stay explicit:** **Given** `runtime.ping` is unavailable, degraded, or times out, **when** the approved touched surface presents the result, **then** it shows degraded/blocked/unavailable lifecycle truth explicitly and does not present the seam as healthy.
- **AC4 — `session.runCommand` has a real bounded TS consumer path:** **Given** a current in-scope TS consumer path delegates an allowed current request through `session.runCommand`, **when** Rust accepts and completes it, **then** the delegated method and terminal outcome are available through a typed TS contract and inspectable in the surfaced result or evidence path.
- **AC5 — Unsupported delegation is refused:** **Given** TS attempts to delegate a method outside the current bounded `session.runCommand` contract, **when** the seam handles the request, **then** the result is explicitly refused or unsupported and is not treated as arbitrary generic command execution.
- **AC6 — Delegated request failures remain inspectable:** **Given** an in-scope delegated request fails, times out, or loses seam availability after request start, **when** the touched current path surfaces that outcome, **then** the failure remains explicit and distinguishable from successful delegated execution.
- **AC7 — TypeScript does not become a second truth source:** **Given** touched TS wrappers/consumers are compared with Rust seam responses, **when** lifecycle or delegated request state is surfaced, **then** TS preserves Rust truth for success, refusal, degradation, timeout, and failure rather than synthesizing a healthier or broader local story.
- **AC8 — Topology wording stays honest:** **Given** touched docs/help/diagnostic wording is reviewed after delivery, **when** it is compared with live repo behavior, **then** it describes the current TypeScript-host -> Rust-bridge topology and does not claim Rust-host inversion, daemon mode, persistent workers, or remote transport.
- **AC9 — `runtime.ping` stays bounded to seam truth:** **Given** operator/runtime output includes `runtime.ping`-derived status, **when** reviewers inspect the output, **then** it is clearly bounded to lifecycle/liveness seam truth and does not replace `runtime.health` / `runtime.diagnostics` or workflow-state inspection surfaces.
- **AC10 — End-to-end inspectability exists for both methods:** **Given** reviewers trace Rust handler -> TS wrapper -> current consumer/operator path -> docs/tests, **when** they inspect `session.runCommand` and `runtime.ping`, **then** both are real first-class product paths on current repo reality rather than internal-only or capability-only entries.
- **AC11 — Scope stays bounded:** **Given** the delivered change is compared against this scope package, **when** Code Review and QA inspect feature boundaries, **then** the work has not broadened into generic command execution, daemon mode, persistent worker pools, remote transport, or broader host-topology migration.

## Key Risks / Edge Cases

- Current TS paths may keep bypassing `session.runCommand` with direct lower-level calls on the touched flow, creating two competing request stories.
- `runtime.ping` and existing runtime/doctor surfaces may drift into conflicting lifecycle truth unless one bounded story is chosen and preserved.
- `session.runCommand` may accidentally broaden from bounded delegated request handling into generic execution if contract boundaries are not kept explicit.
- `runtime.ping` may be over-marketed as broad runtime health instead of seam liveness truth.
- Ping behavior before readiness, after shutdown, or during seam loss may get flattened into generic failure instead of explicit unavailable/degraded status.
- Capability advertisement, TS wrapper support, operator output, and documentation may drift if one of the four lands without the others.
- Failure, refusal, timeout, and seam-unavailable outcomes may be collapsed into one generic bridge error, reducing inspectability.
- Lifecycle-seam wording may accidentally imply the broader Rust-host migration is already done.

## Error And Failure Cases

- `runtime.ping` unavailable on the touched path even though Rust seam support exists.
- `runtime.ping` timeout or transport failure reported as healthy or omitted entirely.
- `session.runCommand` delegated request refusal hidden as a generic invalid response.
- `session.runCommand` accepting unsupported delegated methods.
- TS fallback logic masking refused/degraded/unavailable seam truth.
- Operator/runtime wording implying broader lifecycle authority than the repository actually implements.

## Open Questions

- No blocking product ambiguity remains before Solution Lead planning.
- Solution Lead must still choose the smallest truthful first-wave surfaces for:
  - the canonical current operator/runtime path that consumes `runtime.ping`
  - the canonical current bounded TS consumer path that consumes `session.runCommand`
- Solution Lead must also decide whether the smallest truthful delivery keeps existing lower-level paths as internal implementation details or reroutes the touched current consumer path fully through `session.runCommand`, while preserving one clear truth story.

## Success Signal

- The repository can truthfully say the existing lifecycle seam is a real current TS/operator product path, not only a Rust bridge capability.
- Operators can inspect current seam liveness through `runtime.ping` on a real touched surface.
- Current TS code can consume `session.runCommand` through a typed bounded contract on a real touched surface.
- Rust remains the sole lifecycle/delegation truth source and TypeScript remains only the typed consumer/presenter.
- Delivered wording stays honest about current topology and bounded scope.

## Handoff Notes For Solution Lead

- Preserve the current architecture boundary exactly:
  - Rust owns lifecycle seam truth, ready/ping/request outcome truth, and bounded delegated command execution truth.
  - TypeScript owns typed routing, consumption, presentation, and operator/runtime usage only.
- Preserve topology honesty exactly:
  - current repo reality is still TypeScript host/orchestrator -> Rust bridge subprocess
  - this feature must not be written up as Rust-host inversion completion
- Keep `session.runCommand` bounded to the current supported delegated request family already allowed on the seam.
- Keep `runtime.ping` bounded to seam lifecycle/liveness truth and separate from broader runtime, workflow, or release claims.
- Pick the smallest truthful first-wave current surfaces that make both methods inspectably real without inventing a broad new control plane.
- Ensure review and QA can inspect both success and non-success outcomes for each method.
