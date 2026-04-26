---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: BRIDGE-RUNTIME-UTILITY-SURFACES
feature_slug: bridge-runtime-utility-surfaces
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Bridge Runtime Utility Surfaces

BRIDGE-RUNTIME-UTILITY-SURFACES makes the documented Rust↔TS bridge runtime/utility methods `file.read`, `file.readRange`, `file.list`, `tool.execute`, `runtime.health`, and `runtime.diagnostics` real bounded contract surfaces instead of documentation-only entries. This feature is successful only if Rust remains the sole truth owner for file/process/runtime boundary decisions, TypeScript remains a consumer/presenter only, and operators or reviewers can inspect supported, degraded, denied, timeout, and unsupported outcomes on current repository/runtime paths without hidden fallbacks or exaggerated capability claims.

## Goal

- Make the six named runtime/utility bridge methods real, bounded, and inspectable on the live local Rust↔TS bridge.
- Align capability advertisement, TS consumption, operator/runtime output, and documentation to repository truth.
- Close the current doc-versus-code gap without broadening into a general shell, general filesystem browser, IDE replacement, or remote-control platform.

## Target Users

- OpenKit operators and maintainers who need truthful runtime/diagnostic visibility from current local product surfaces.
- The TypeScript runtime/workflow layer when it needs bounded Rust-owned file, tool, or runtime truth.
- Solution Lead, Code Reviewer, and QA as downstream consumers of an explicit bounded contract.

## Problem Statement

- The architecture and bridge deep-dive docs already define a runtime/utility bridge family that includes:
  - `file.read`
  - `file.readRange`
  - `file.list`
  - `tool.execute`
  - `runtime.health`
  - `runtime.diagnostics`
- Repository reality does not yet fully match that contract:
  - the live Rust bridge capability advertisement currently exposes query-oriented methods and lifecycle helpers, not this runtime/utility method set
  - the live TS bridge client and workflow paths currently consume query-oriented methods, not these runtime/utility methods
  - current operator/runtime diagnostics paths rely on `dh.initialize` and non-bridge probes rather than bridge-native `runtime.health` / `runtime.diagnostics`
- That leaves a product-truth gap: the documentation describes a bridge runtime/utility family that operators, TS consumers, reviewers, and QA cannot yet rely on as a real current surface.
- This feature is needed to close that gap in a bounded, operationally honest way: make the named surfaces real where supported, explicitly deny what remains out of bounds, and avoid pretending the bridge is a general local-agent control plane.

## In Scope

- Make these exact bridge methods supported, implemented, and truthfully advertised when they are genuinely available in this phase:
  - `file.read`
  - `file.readRange`
  - `file.list`
  - `tool.execute`
  - `runtime.health`
  - `runtime.diagnostics`
- Make each in-scope method part of a real end-to-end runtime path rather than only a documented schema. Minimum bar for “real” in this feature:
  - Rust-owned handler truth exists
  - capability advertisement includes the method only when it is actually supported
  - TypeScript has a typed consumption path
  - at least one current operator/runtime surface, bounded internal consumer path, or equivalent inspectable end-to-end path proves the method is live
- Define bounded repository/workspace file-access behavior for the three `file.*` methods.
- Define bounded allowlist/policy behavior for `tool.execute`.
- Define truthful runtime status and diagnostic semantics for `runtime.health` and `runtime.diagnostics`, including degraded and unavailable states.
- Make positive and negative outcomes inspectable:
  - success
  - degraded success where the contract explicitly allows it
  - denied / access refused
  - invalid request
  - timeout
  - unsupported capability
  - execution failure
- Keep the work local to the current stdio bridge, current repository, and current bounded operator/runtime surfaces.

## Out of Scope

- Any bridge methods not explicitly named in this feature, including but not limited to:
  - `file.diff`
  - `file.write`
  - `file.applyPatch`
  - `tool.status`
  - `tool.cancel`
  - `runtime.config`
- Unrestricted shell access, arbitrary command forwarding, or argument shapes that effectively become raw local remote control.
- Unconstrained filesystem access outside the repository or approved workspace roots.
- Broad event-streaming, daemon, TCP, HTTP, gRPC, or remote bridge transport work.
- A general IDE/LSP replacement, general file manager, or universal runtime control surface.
- Workflow-state, approval-gate, or release-readiness reporting hidden inside `runtime.health` or `runtime.diagnostics`.
- Broad CLI taxonomy redesign or new user-facing command families unless separately justified by current repository reality.
- Replacing the repository’s normal OpenCode tool model with these bridge methods for every task.

## Main Flows

- **Flow 1 — Runtime health is checked through a real bridge path**
  - An operator or TS runtime consumer requests bounded runtime health.
  - Rust returns real current health or degradation truth for the supported bridge/runtime surface.
  - TS presents the result without upgrading a degraded or unavailable condition into `ok`.

- **Flow 2 — Runtime diagnostics are requested for a degraded or inspectable case**
  - An operator or TS runtime consumer requests diagnostics.
  - Rust returns bounded current diagnostic facts, capability snapshot data, and recent bridge/runtime errors only when available.
  - TS presents those facts without turning them into workflow-progress or broader product-health claims.

- **Flow 3 — Bounded file inspection happens through Rust-owned path truth**
  - A TS consumer requests a full file read, bounded line-range read, or directory listing inside approved workspace/repository bounds.
  - Rust enforces bounds, size/depth behavior, and explicit denial rules.
  - TS consumes the returned result and does not replace this bridge path with competing file-boundary truth for the same surface.

- **Flow 4 — Allowlisted tool execution happens through Rust-owned policy**
  - A TS consumer requests an approved tool/action through `tool.execute`.
  - Rust validates allowlist/policy, argument shape, timeout, and execution bounds.
  - The terminal result is inspectable as completed, failed, cancelled, unsupported, or degraded where applicable.

- **Flow 5 — Out-of-bounds request is refused explicitly**
  - A path escapes approved roots, a file range is invalid, traversal is over-broad, a tool is not allowlisted, or runtime truth is unavailable.
  - The bridge returns an explicit refusal, invalid request, unsupported capability, timeout, or failure outcome.
  - The system does not return empty success, raw arbitrary execution, or aspirational health.

## Operator / Runtime Truth Rules

### Ownership rules

- Rust owns runtime/process/file/tool boundary truth, capability truth, health truth, diagnostics truth, and terminal method outcome truth for all in-scope methods.
- TypeScript owns routing, request shaping within the approved contract, consumption, presentation, and workflow use of those surfaces only.
- If TS presentation and Rust result disagree, Rust truth wins.

### Capability advertisement rules

- A method may be advertised only when it is actually implemented and supported end to end in this phase.
- Spec-only or incomplete methods must remain absent from supported capability advertisement or be surfaced as unsupported; they must not appear as supported because documentation once named them.
- Help text, docs, diagnostics, and tests must align with the live advertised method set.

### File boundary rules

- `file.read`, `file.readRange`, and `file.list` are bounded to repository/approved-workspace reality only.
- Success must not allow path escape through absolute paths, `..` traversal, symlink indirection outside approved roots, or equivalent boundary bypass.
- File responses must be honest about bounds such as truncation, bytes returned, requested range, or listing limits where those apply.
- Missing, denied, or invalid file requests must be explicit failures, not empty-success payloads.

### Tool execution rules

- `tool.execute` must route through a Rust-owned allowlist/policy boundary, not unrestricted shell-by-default behavior.
- The supported tool set, accepted argument shapes, timeout ceilings, and output bounds for this phase must be explicit and inspectable.
- Non-allowlisted tools, unsafe argument patterns, or over-broad execution requests must be explicitly refused or marked unsupported/invalid.
- If streaming, preview, truncation, or degraded execution behavior exists, it must be bounded and truthfully reported.

### Runtime truth rules

- `runtime.health` answers bounded runtime/bridge health for the supported surface; it does not imply overall product correctness, workflow progress, approval readiness, or universal capability health.
- `runtime.diagnostics` reports bounded current facts that the runtime can actually support in this phase, such as degradation reasons, capability snapshot, or recent bridge/runtime errors.
- Degraded runtime truth must remain degraded in surfaced output; TS must not flatten degraded into healthy.
- Runtime methods must not claim capabilities, checks, or evidence they did not actually perform.

### Inspectability rules

- Reviewers must be able to inspect each in-scope method across capability advertisement, request/response behavior, and at least one current end-to-end consumer or operator/runtime path.
- Success, degraded, denied, invalid, timeout, unsupported, and failed outcomes must be distinguishable where applicable.
- A method is not “done” in this feature if it only exists in docs, types, or dormant server code with no inspectable live path.

## Inspectable Acceptance Expectations

- For each in-scope method, reviewers should be able to inspect:
  - whether the method is advertised as supported
  - the bounded request shape used in this phase
  - the success payload shape
  - the refusal / degraded / failure outcomes
  - the TS consumer or operator/runtime surface that proves the method is live
- At least one current operator/runtime diagnostics path must use bridge-native runtime truth for `runtime.health` and `runtime.diagnostics` rather than relying only on non-bridge substitutes.
- File and tool surfaces must have explicit refusal-path coverage, not success-only coverage.
- Docs and surfaced wording must describe the bounded contract that exists now, not the larger spec catalog from historical design docs.

## Acceptance Criteria Matrix

- **AC1 — Capability advertisement is truthful:** **Given** a reviewer inspects the live bridge capability advertisement after this feature ships, **when** support is checked for the runtime/utility family, **then** `file.read`, `file.readRange`, `file.list`, `tool.execute`, `runtime.health`, and `runtime.diagnostics` appear only if they are actually implemented and supported end to end in this phase, and still-spec-only methods are not advertised as supported.
- **AC2 — Full file reads stay bounded:** **Given** a TS consumer requests `file.read` for a path inside approved repository/workspace bounds, **when** Rust handles the call, **then** it returns bounded file truth for this phase including content plus applicable size/truncation metadata, and it does not read outside approved roots.
- **AC3 — Range and path failures are explicit:** **Given** a TS consumer requests `file.read` or `file.readRange` with a missing file, denied path, escaped path, or invalid line range, **when** the bridge handles the request, **then** it returns an explicit invalid/denied/not-found failure outcome rather than an empty-success payload.
- **AC4 — Directory listing stays bounded:** **Given** a TS consumer requests `file.list` within approved repository/workspace bounds, **when** the bridge handles the call, **then** it returns a bounded listing consistent with this phase’s depth/recursion/hidden-entry rules and explicitly refuses path escape or unsupported traversal.
- **AC5 — Tool execution is allowlisted and terminal:** **Given** a TS consumer requests `tool.execute` for a tool/action allowed in this phase, **when** Rust handles the request, **then** execution follows the allowlisted policy, bounded args/timeout/output rules, and returns one inspectable terminal status such as completed, failed, cancelled, or degraded where applicable.
- **AC6 — Raw shell is not implied:** **Given** a TS consumer requests `tool.execute` for a non-allowlisted tool, unsafe argument shape, or over-broad execution request, **when** the bridge handles the request, **then** the request is explicitly refused/unsupported/invalid and is not forwarded as unrestricted shell behavior.
- **AC7 — Runtime health reports real bounded truth:** **Given** an operator or TS runtime consumer checks `runtime.health`, **when** the supported bridge/runtime surface is healthy, **then** the method reports healthy status; **and when** required components are partially unavailable but bounded supported behavior remains, **then** it reports degraded status with a real reason instead of claiming full health.
- **AC8 — Runtime diagnostics stay factual and bounded:** **Given** an operator or TS runtime consumer requests `runtime.diagnostics`, **when** diagnostics are available, **then** the method returns bounded current diagnostic facts for this phase and does not claim workflow-stage, approval-gate, or unrelated product-health status.
- **AC9 — TypeScript does not become a second truth source:** **Given** TS consumes any in-scope runtime/utility result, **when** the final output is presented or routed, **then** TS preserves Rust truth for bounds, denials, degradation, and capability state and does not synthesize broader success from fallback logic.
- **AC10 — Every in-scope method is inspectably live:** **Given** reviewers inspect the delivered feature, **when** they trace each in-scope method from Rust bridge support through TS wrapper/consumer and docs/tests, **then** each method is a real inspectable runtime path rather than a documentation-only contract entry.
- **AC11 — Wording matches actual support:** **Given** operator-facing or maintainer-facing docs/help/diagnostic wording for these surfaces, **when** that wording is compared with live bridge behavior, **then** it matches the bounded current contract and does not imply unrestricted file access, unrestricted shell, IDE-grade capabilities, or remote-control behavior.
- **AC12 — Scope stays bounded:** **Given** the delivered change is compared against this scope package, **when** review and QA assess feature boundaries, **then** the work does not broaden into extra file mutation methods, additional tool families, workflow-state health claims, daemon/remote transport, or general IDE/LSP replacement scope.

## Key Risks / Edge Cases

- Path escape attempts through absolute paths, `..`, symlinks, or alternate root representations.
- Very large files, binary-like files, or files whose truthful response requires truncation or refusal.
- `file.readRange` requests with reversed, out-of-bounds, or nonsensical line windows.
- `file.list` requests that become too deep, too large, or unexpectedly expose hidden content.
- `tool.execute` allowlist drift where docs or TS assume tools/args that Rust does not actually allow.
- `tool.execute` requests that are technically executable but too broad to claim as safe support.
- `runtime.health` saying `ok` while one or more required bounded components are actually degraded or unavailable.
- `runtime.diagnostics` surfacing stale, irrelevant, or unbounded diagnostic data that overstates current truth.
- Current non-bridge diagnostic surfaces and new bridge-native runtime truth disagreeing unless the solution defines one canonical runtime story.
- TS consumers bypassing Rust-owned file/tool/runtime truth through fallback behavior on the same touched surface.

## Error And Failure Cases

- The feature fails if any in-scope method is documented as supported but remains unimplemented or uninspectable on the live bridge.
- The feature fails if `tool.execute` effectively becomes unrestricted shell execution.
- The feature fails if file methods can read or list outside approved workspace/repository bounds.
- The feature fails if denied, invalid, not-found, timeout, or unsupported cases are surfaced as empty or ambiguous success.
- The feature fails if `runtime.health` reports healthy status for capabilities or checks that were not actually verified.
- The feature fails if `runtime.diagnostics` implies workflow-state progress, gate approval, or other truth outside its bounded runtime contract.
- The feature fails if TS becomes a competing truth source for runtime/file/tool boundary decisions on the touched surfaces.
- The feature fails if delivery broadens into a general control-plane, remote-execution, or IDE-style platform scope.

## Open Questions

- Which smallest existing TS consumer path should become the first real caller for `file.read`, `file.readRange`, `file.list`, and `tool.execute` without inventing an unnecessary new top-level command family?
- What exact first-wave allowlisted tool set and argument shapes are truthful to support now for `tool.execute`, given current repository/runtime reality?
- Should `runtime.diagnostics` surface by default in normal operator output only when degraded, or also in explicit JSON/debug output paths even when healthy?
- How much of the current non-bridge diagnostic story should be retained once bridge-native `runtime.health` / `runtime.diagnostics` exist, so that operators still get one consistent truth story?

## Success Signal

- The repository can truthfully say that the named runtime/utility bridge methods are real current surfaces rather than spec-only names.
- Operators and reviewers can inspect one bounded runtime truth story across capability advertisement, bridge behavior, TS consumption, and operator/runtime output.
- Rust clearly owns file/process/runtime boundary truth and TS clearly owns only routing/consumption/presentation.
- Out-of-bounds file access, unrestricted shell claims, and inflated health claims remain explicitly unsupported.
- The documentation and live bridge/runtime behavior are materially aligned for this method family.

## Handoff Notes For Solution Lead

- Preserve the architecture boundary exactly:
  - Rust owns runtime/process/file/tool truth, capability truth, health truth, diagnostics truth, and bounded contract enforcement.
  - TypeScript owns routing, request shaping inside the approved contract, consumption, presentation, and workflow use only.
- Start from repository reality, not historical protocol ambition:
  - the current bridge already supports a bounded query family and lifecycle helpers
  - the six target runtime/utility methods are documented but do not yet appear to be fully live on the current bridge/client path
  - current diagnostic surfaces already exist and should be used as anchors where truthful rather than inventing a broad new product surface
- Choose the smallest truthful first wave that makes every named method inspectably real.
- Keep the contract explicit for both success and refusal paths; do not ship success-only semantics.
- Make operator/runtime wording match live bounded support and avoid any claim that this feature turns the bridge into a general IDE, remote-control, or unrestricted shell/filesystem platform.
- The solution package must explicitly resolve:
  - the first real TS consumer/operator path for each in-scope method or method group
  - the exact allowlisted `tool.execute` scope for this phase
  - the canonical runtime truth story between new `runtime.*` methods and existing diagnostic surfaces
  - the refusal/error taxonomy that reviewers and QA will inspect end to end
