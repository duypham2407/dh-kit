---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: BRIDGE-RUNTIME-UTILITY-SURFACES
feature_slug: bridge-runtime-utility-surfaces
source_scope_package: docs/scope/2026-04-21-bridge-runtime-utility-surfaces.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Bridge Runtime Utility Surfaces

## Recommended Path

- Add the six runtime/utility methods to the **existing Rust bridge server** and make them inspectably live through **existing operator surfaces**, not a new command family.
- Use the **smallest truthful first-wave consumer paths**:
  - `runtime.health` -> `dh doctor` text + JSON
  - `runtime.diagnostics` -> `dh doctor --json` and `dh doctor --debug-dump`
  - `file.read`, `file.readRange`, `file.list`, `tool.execute` -> `dh doctor --debug-dump` bridge utility probe section
- Keep **Rust authoritative** for:
  - approved-root path truth
  - symlink and traversal refusal
  - file bounds and truncation truth
  - tool allowlist/policy truth
  - runtime health truth
  - runtime diagnostics truth
  - capability advertisement truth
  - terminal execution outcome truth
- Keep **TypeScript limited** to:
  - typed request wrappers
  - bounded routing from existing doctor/debug surfaces
  - output formatting and JSON/debug presentation
  - preserving Rust refusal/degraded/unsupported truth without fallback upgrade

Why this is enough:

- The repository already has a live Rust bridge startup path (`dh.initialize`, `session.runCommand`, `runtime.ping`) and already has live operator surfaces (`dh doctor`, `dh doctor --json`, `dh doctor --debug-dump`).
- The missing gap is not a lack of top-level commands; it is that the documented runtime/utility family is still mostly spec-only.
- Reusing doctor/debug-dump keeps scope bounded, makes every method inspectable, and avoids broadening into a general shell, file manager, IDE/LSP layer, or workflow-state dashboard.

## Impacted Surfaces

### Rust bridge and policy surfaces

- `rust-engine/crates/dh-engine/src/main.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`
- `rust-engine/crates/dh-engine/src/bridge_file.rs` _(new, recommended)_
- `rust-engine/crates/dh-engine/src/bridge_tool.rs` _(new, recommended)_
- `rust-engine/crates/dh-engine/src/bridge_runtime.rs` _(new, recommended)_

### TypeScript bridge and operator surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- `packages/runtime/src/diagnostics/bridge-runtime-probe.ts` _(new, recommended)_
- `packages/runtime/src/diagnostics/bridge-runtime-probe.test.ts` _(new, recommended)_
- `packages/runtime/src/diagnostics/doctor.ts`
- `packages/runtime/src/diagnostics/doctor.test.ts`
- `packages/runtime/src/diagnostics/debug-dump.ts`
- `packages/runtime/src/diagnostics/rust-engine-status.ts`
- `apps/cli/src/commands/doctor.ts`
- `apps/cli/src/commands/doctor.test.ts`

### Docs and wording surfaces

- `docs/user-guide.md`

### Preserve-only surfaces

- `apps/cli/src/commands/root.ts` _(help text only if wording needs a bounded update; no new command family)_
- existing knowledge-command surfaces should remain unchanged unless implementation proves a very small additive wrapper is necessary; this feature should not turn `ask`/`explain`/`trace` into raw file or shell consumers.

## Boundaries And Components

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| `file.*` | root canonicalization, symlink resolution, traversal refusal, text/binary gating, size/range/list caps, returned metadata | typed wrappers and debug presentation only | unrestricted filesystem browsing or a second TS file-boundary truth source |
| `tool.execute` | registry IDs, arg validation, cwd/env policy, timeout/output caps, terminal status mapping | typed wrapper and operator display only | raw shell passthrough, arbitrary executable launcher, or workflow-state shortcut |
| `runtime.health` | bridge/runtime component checks and health status | mapping into doctor text/JSON sections | product readiness, release readiness, workflow-state readiness, or approval-state truth |
| `runtime.diagnostics` | bounded diagnostics payload, capability snapshot, degradation reasons, recent runtime/bridge errors | JSON/debug rendering and condensed degraded summaries | a generic system dump or workflow-state report |
| capability advertisement | final `methods` list and per-method support truth | reading and displaying the advertised set | documentation-driven or TS-guessed support claims |
| doctor/debug operator story | none | surface-level composition of bridge sections with existing install/workspace diagnostics | a new CLI taxonomy or a second runtime truth model |

## Rust vs TS Responsibilities

### Rust responsibilities

- Canonicalize the workspace root once and treat it as the only approved root for phase 1.
- Normalize all requested paths before checking access.
- Refuse `..` traversal, escaped absolute paths, and symlink targets that resolve outside the approved root.
- Decide text-vs-binary support, file/list truncation, line-window validity, and output bounds.
- Own the `tool.execute` allowlist registry and all subprocess policy.
- Return result-level degraded states when truthful payloads still exist; return explicit errors only when they do not.
- Advertise methods only when the handler, TS wrapper, and first-wave consumer path are present in the same feature slice.

### TypeScript responsibilities

- Extend the existing bridge client with typed methods for the six new calls.
- Route only existing operator surfaces (`dh doctor`, JSON output, debug dump) to the new utility/runtime methods.
- Preserve Rust statuses and refusal codes verbatim in surfaced output.
- Stop using direct TS process/file truth for the touched bridge utility/runtime paths once the bridge methods exist.
- Keep existing non-bridge doctor checks for install/distribution, SQLite, provider registry, embeddings, and workflow mirror; those remain separate from bridge runtime truth.

## Exact First-Wave Consumer / Operator Paths

| Method group | First-wave path | Exact TS touchpoint | Why this is the smallest truthful path |
| --- | --- | --- | --- |
| `runtime.health` | `dh doctor` text and JSON | `packages/runtime/src/diagnostics/bridge-runtime-probe.ts` -> `packages/runtime/src/diagnostics/doctor.ts` -> `apps/cli/src/commands/doctor.ts` | doctor already exists as the operator/runtime health surface; adding a bridge-runtime subsection avoids a new command family |
| `runtime.diagnostics` | `dh doctor --json` and `dh doctor --debug-dump` | same helper path plus `packages/runtime/src/diagnostics/debug-dump.ts` | explicit JSON/debug paths are the right bounded place for detailed runtime facts even when healthy |
| `file.read` | `dh doctor --debug-dump` utility probe for repo-root `package.json` | `bridge-runtime-probe.ts` + `debug-dump.ts` | deterministic, small, repo-real text file; proves bounded full-file reads without broadening CLI taxonomy |
| `file.readRange` | `dh doctor --debug-dump` utility probe for `README.md` lines `1-25` | `bridge-runtime-probe.ts` + `debug-dump.ts` | deterministic, bounded line-range probe with operator-inspectable output |
| `file.list` | `dh doctor --debug-dump` utility probe for repo root `.` | `bridge-runtime-probe.ts` + `debug-dump.ts` | deterministic, bounded directory inventory under the approved root |
| `tool.execute` | `dh doctor --debug-dump` utility probes `git.rev_parse_head` and `git.status_short` | `bridge-runtime-probe.ts` + `debug-dump.ts` | existing debug surface makes tool policy live without inventing a general shell command |

Phase-1 operator rule:

- `dh doctor` text remains compact and health-oriented.
- `dh doctor --json` carries full bridge runtime health + diagnostics truth.
- `dh doctor --debug-dump` is the explicit inspectability path for the file/tool utility family.

## Interfaces And Data Contracts

### File boundary contract

- **Approved root for phase 1:** canonical `repoRoot` / workspace root only.
- Returned paths should be repo-relative normalized strings.
- Absolute paths are accepted only if their canonical target still resolves inside the approved root.
- Symlink escapes must be refused explicitly.
- `file.read`
  - UTF-8 text only in phase 1
  - default `maxBytes = 65536`
  - hard cap `maxBytes <= 262144`
  - return `sizeBytes`, `bytesReturned`, `truncated`, and `sha256`
  - binary-like content should be refused explicitly rather than silently decoded
- `file.readRange`
  - `1 <= startLine <= endLine`
  - hard line-span cap: `400` lines
  - out-of-bounds or reversed ranges are explicit invalid requests, not clamped success
  - return the exact requested range metadata plus `sha256`
- `file.list`
  - default `recursive = false`
  - default `depth = 1`
  - hard cap `depth <= 2`
  - hard cap `entries <= 200`
  - `includeHidden = false` by default; `true` is out of scope for the first-wave debug probes and should be refused unless implementation can support it honestly without widening exposure
  - symlinks may be reported as `type = symlink` but must never be traversed blindly

### `tool.execute` allowlist for this phase

- `tool.execute` stays registry-based. The caller does **not** pass executable names or shell strings.
- Phase-1 allowlisted tool IDs:
  - `git.rev_parse_head`
    - accepted args: `{}` only
    - fixed command: `git rev-parse HEAD`
    - fixed cwd: repo root
    - timeout cap: `3000ms`
  - `git.status_short`
    - accepted args: `{}` only
    - fixed command: `git status --short`
    - fixed cwd: repo root
    - timeout cap: `5000ms`
- Explicitly **not allowed** in this feature:
  - `bash`, `sh`, `zsh`, `node`, `cargo`, `openkit`, `workflow-state.js`, arbitrary `git` subcommands, arbitrary args, user-provided command strings
- `streamOutput = true` is not required for phase 1; if implementation cannot support it cleanly without widening scope, it should be refused explicitly.
- Output bounds:
  - stdout/stderr preview cap `8192` bytes each
  - preview truncation must be explicit when it occurs
- Result semantics:
  - policy refusal -> explicit error
  - launched process with non-zero exit -> terminal `failed` result with `exitCode`
  - timeout after launch -> terminal `failed` or explicit timeout classification, but never silent success

### Runtime health and diagnostics contract

- `runtime.health` should keep the bridge-local wire vocabulary `ok | degraded | down`.
- `dh doctor` may present `ok` as human wording such as `healthy`, but it must not widen what that status means.
- `runtime.health` should answer only for the bounded bridge/runtime surface and should include only components the bridge actually checked.
- Recommended phase-1 `runtime.health` components:
  - `bridge`
  - `workspaceDb`
  - `allowedRoots`
  - `toolRegistry`
  - `capabilityAdvertisement`
- `runtime.diagnostics` should be factual and bounded. Recommended payload families:
  - degradation reasons
  - capability snapshot for the live bridge method set
  - file-bound limits summary
  - tool registry summary for the phase-1 allowlist
  - parser freshness summary when the bridge can state it honestly
  - recent bridge/runtime errors only (bounded ring or recent list)
- `runtime.diagnostics` must **not** include:
  - workflow-state stage/gate progress
  - release readiness
  - QA pass/fail claims
  - unrelated provider or install-health claims that already belong to existing doctor sections

### Refusal / error taxonomy and bounded semantics

- Keep JSON-RPC numeric error envelopes stable.
- Add a stable symbolic classifier in `error.data.code` so TS can preserve refusal semantics without string matching.

| Symbolic code | Meaning | Preferred surface behavior |
| --- | --- | --- |
| `CAPABILITY_UNSUPPORTED` | method, flag, or tool ID is outside the live phase-1 contract | explicit unsupported/refused output; never fallback |
| `ACCESS_DENIED` | path escapes approved root, symlink escapes root, hidden entry or file type disallowed | explicit denial |
| `NOT_FOUND` | requested file or directory does not exist | explicit not-found |
| `INVALID_REQUEST` | invalid schema, unsupported arg keys, invalid line range, invalid depth, timeout above cap | explicit invalid request |
| `TIMEOUT` | bounded runtime check or allowlisted tool exceeded its timeout | explicit timeout |
| `EXECUTION_FAILED` | allowlisted tool launched but finished unsuccessfully | terminal failed status or explicit failure payload |
| `RUNTIME_UNAVAILABLE` | bridge cannot produce a truthful runtime payload | explicit unavailable/degraded output, not synthetic `ok` |
| `BINARY_FILE_UNSUPPORTED` | file exists but the first-wave text-only file contract does not support it | explicit unsupported/denied file response |

Result-level semantics to preserve:

- `degraded` is a truthful success result with limitations, not an error and not `ok`.
- truncation is a truthful success result with explicit metadata, not silent partial output.
- denial/unsupported/invalid are explicit and distinguishable.
- TS must not rewrite a degraded, denied, timed-out, or unsupported Rust result into a healthy/successful story.

## Risks And Trade-offs

- **Doctor scope creep risk**
  - If utility probes spill into the top-level doctor condition, the command stops being a product/install/workspace health surface.
  - Mitigation: keep file/tool probes in JSON/debug sections only.

- **Half-live capability advertisement risk**
  - Advertising the six methods before the TS wrappers and operator paths exist would recreate the current doc/code gap.
  - Mitigation: add capability entries only in the slice where the handler + consumer path + tests land together.

- **TS second-truth risk**
  - Current runtime diagnostics code already performs direct TS-side file/process probing.
  - Mitigation: on touched bridge utility/runtime truths, TS becomes a consumer/presenter only; preserve existing TS probes only for non-bridge doctor families.

- **Recursive or over-broad tool risk**
  - Allowing `cargo`, `node`, or raw shell via `tool.execute` would turn this feature into an unrestricted control-plane.
  - Mitigation: keep the allowlist to two read-only Git actions in phase 1.

- **Large/binary file ambiguity risk**
  - Returning decoded garbage or silent truncation would make `file.read` non-truthful.
  - Mitigation: explicit text-only contract, explicit truncation metadata, explicit binary refusal.

- **Documentation drift risk**
  - Operator docs may overstate what `tool.execute` and `file.*` do if they are described as generic shells or browsers.
  - Mitigation: docs must say these are bounded bridge utility methods with a debug-surface first wave.

## Implementation Slices

### Slice 1: Freeze the bridge contract and capability advertisement gate

- **Files:**
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-engine/src/bridge_file.rs` _(new, recommended)_
  - `rust-engine/crates/dh-engine/src/bridge_tool.rs` _(new, recommended)_
  - `rust-engine/crates/dh-engine/src/bridge_runtime.rs` _(new, recommended)_
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- **Goal:** define one stable bridge contract for the six methods before any operator path consumes them.
- **Validation Command:** `npm run check && npm test && cargo test --workspace`
- **Details:**
  - extend the existing bridge client with typed wrappers for the six methods
  - add symbolic refusal/error classification in `error.data.code`
  - keep `dh.initialize` method advertisement truthful: the six new methods appear only when the corresponding handlers are live in the same slice set
  - keep `runtime.ping` untouched as lifecycle liveness; do not rename it into runtime health
  - reviewer focus: no spec-only advertisement, no raw untyped `Value` plumbing leaking into TS consumer code

### Slice 2: Implement bounded `file.*` handlers and wire them to the debug-dump utility probe path

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-engine/src/bridge_file.rs` _(new, recommended)_
  - `packages/runtime/src/diagnostics/bridge-runtime-probe.ts` _(new, recommended)_
  - `packages/runtime/src/diagnostics/bridge-runtime-probe.test.ts` _(new, recommended)_
  - `packages/runtime/src/diagnostics/debug-dump.ts`
- **Goal:** make `file.read`, `file.readRange`, and `file.list` real and inspectable on approved repo-root paths.
- **Validation Command:** `npm run check && npm test && cargo test --workspace`
- **Details:**
  - implement the approved-root, symlink, size, range, and listing caps in Rust only
  - use exact deterministic first-wave probes:
    - `file.read` -> `package.json`
    - `file.readRange` -> `README.md` lines `1-25`
    - `file.list` -> `.` with `recursive=false`, `depth=1`, `includeHidden=false`
  - add explicit refusal coverage for:
    - escaped path
    - missing file/dir
    - invalid line range
    - hidden/recursive shape beyond first-wave support
    - binary or over-broad file reads
  - reviewer focus: no TS `fs` fallback on these touched probes once the bridge path is live

### Slice 3: Implement bounded `tool.execute` with a registry allowlist, not a shell

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-engine/src/bridge_tool.rs` _(new, recommended)_
  - `packages/runtime/src/diagnostics/bridge-runtime-probe.ts`
  - `packages/runtime/src/diagnostics/bridge-runtime-probe.test.ts`
  - `packages/runtime/src/diagnostics/debug-dump.ts`
- **Goal:** make `tool.execute` real for a tiny, truthful, inspectable read-only tool registry.
- **Validation Command:** `npm run check && npm test && cargo test --workspace`
- **Details:**
  - implement only the phase-1 allowlist:
    - `git.rev_parse_head`
    - `git.status_short`
  - reject all other tool IDs and any unexpected args
  - keep cwd fixed to repo root and scrub environment to the minimum needed to run Git
  - keep preview/truncation and terminal status explicit
  - do not add shell, workflow-state, cargo, or Node passthrough “just for debugging”
  - reviewer focus: no code path should ever concatenate a user command string into a shell invocation

### Slice 4: Implement `runtime.health` and `runtime.diagnostics`, then route doctor to them

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-engine/src/bridge_runtime.rs` _(new, recommended)_
  - `packages/runtime/src/diagnostics/bridge-runtime-probe.ts`
  - `packages/runtime/src/diagnostics/rust-engine-status.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `apps/cli/src/commands/doctor.ts`
  - `apps/cli/src/commands/doctor.test.ts`
- **Goal:** make bridge-native runtime truth the canonical source for the doctor command’s bridge subsection.
- **Validation Command:** `npm run check && npm test && cargo test --workspace`
- **Details:**
  - `dh doctor` text should always call `runtime.health`
  - `dh doctor --json` should include raw `runtime.health` + `runtime.diagnostics` payloads
  - `dh doctor --debug-dump` should persist the same runtime payloads plus the file/tool utility probe results
  - text doctor output should show condensed degraded reasons only when the runtime is not `ok`
  - existing doctor condition (`ready`, `ready-with-known-degradation`, `blocked`) remains the product/install/workspace surface and must stay separate from the bridge runtime status
  - `packages/runtime/src/diagnostics/rust-engine-status.ts` should either become a thin compatibility wrapper over bridge-native runtime truth or be narrowed so it no longer acts as a competing truth source on the touched doctor surfaces

### Slice 5: Align docs, wording, and the full inspectability story

- **Files:**
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `apps/cli/src/commands/doctor.ts`
  - `apps/cli/src/commands/doctor.test.ts`
  - `docs/user-guide.md`
- **Goal:** make the shipped wording match the bounded contract that is actually live.
- **Validation Command:** `npm run check && npm test && cargo test --workspace`
- **Details:**
  - describe `tool.execute` as allowlisted and read-only in this phase
  - describe `file.*` as repo-root-bounded utility surfaces, not a generic browser
  - describe `runtime.health` / `runtime.diagnostics` as bridge-runtime truth only
  - keep workflow-state and release-readiness routed to their existing surfaces, not runtime diagnostics
  - reviewer focus: docs and output must not imply unrestricted shell, unconstrained filesystem access, or IDE-grade support

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- Why sequential:
  - Slice 1 freezes the contract and prevents half-live capability advertisement.
  - Slice 2 and Slice 3 both depend on the same dispatcher/client/error envelope and both feed the same debug utility probe section.
  - Slice 4 depends on the same bridge client expansion and must not race ahead with a doctor/runtime story before file/tool/runtime payload shapes settle.
  - Slice 5 should land last so docs and wording describe shipped truth instead of speculative contract text.
- Critical-path summary:
  - contract freeze -> file truth -> tool policy -> runtime truth -> docs/integration

## Parallelization Assessment

- parallel_mode: `none`
- why: the Rust dispatcher, TS bridge client, doctor sections, and debug-dump payload all share one cross-cutting runtime truth contract. Parallel implementation would create high risk of contradictory capability advertisement, mismatched error taxonomy, or mixed old/new operator output.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- integration_checkpoint: prove one coherent story across `dh.initialize` capability advertisement, `dh doctor` text, `dh doctor --json`, `dh doctor --debug-dump`, and docs before handing off to Code Review.
- max_active_execution_tracks: `1`

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix

| Target | Validation path |
| --- | --- |
| capability advertisement is truthful for all six methods | `cargo test --workspace`; `npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts` |
| file reads/listing stay inside repo-root bounds and refuse invalid requests explicitly | `cargo test --workspace`; `npm test -- packages/runtime/src/diagnostics/bridge-runtime-probe.test.ts packages/runtime/src/diagnostics/doctor.test.ts` |
| `tool.execute` stays allowlisted and never becomes a raw shell | `cargo test --workspace`; `npm test -- packages/runtime/src/diagnostics/bridge-runtime-probe.test.ts packages/runtime/src/diagnostics/doctor.test.ts` |
| runtime health/diagnostics stay factual and bounded | `cargo test --workspace`; `npm test -- packages/runtime/src/diagnostics/doctor.test.ts apps/cli/src/commands/doctor.test.ts` |
| doctor text/json/debug surfaces preserve bridge truth without mixing workflow-state or release readiness | `npm run check && npm test`; reviewer comparison of `doctor.ts`, `debug-dump.ts`, and `docs/user-guide.md` |
| symbolic refusal taxonomy remains inspectable end to end | `cargo test --workspace`; `npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts packages/runtime/src/diagnostics/bridge-runtime-probe.test.ts` |

Validation reality notes:

- Use real repository commands only:
  - from repo root: `npm run check`
  - from repo root: `npm test`
  - from `rust-engine/`: `cargo test --workspace`
- No repo-native lint command exists; do not invent one.
- Optional manual cross-check, if implementation needs a Rust-only comparison point: from `rust-engine/`, `cargo run -q -p dh-engine -- status --workspace <repo>`.

## Integration Checkpoint

Before this feature is handed to Fullstack completion review, one combined inspection pass should be able to show all of the following together:

- `dh.initialize` advertises:
  - existing query/lifecycle methods
  - plus exactly `file.read`, `file.readRange`, `file.list`, `tool.execute`, `runtime.health`, and `runtime.diagnostics`
  - with no spec-only extra methods such as `file.write`, `file.applyPatch`, `tool.status`, `tool.cancel`, or `runtime.config`
- `dh doctor` text shows:
  - its existing product/install/workspace condition
  - a separate bounded bridge-runtime health subsection sourced from `runtime.health`
  - degraded reasons only when the bridge runtime is not `ok`
- `dh doctor --json` includes bounded runtime health and diagnostics payloads directly from bridge methods.
- `dh doctor --debug-dump` includes a `bridgeUtilityProbes` section that proves:
  - `file.read` against `package.json`
  - `file.readRange` against `README.md:1-25`
  - `file.list` against repo root `.`
  - `tool.execute` against the two allowlisted Git actions
- Refusal coverage is visible in tests for:
  - escaped path
  - invalid range
  - unsupported hidden/over-broad listing shape
  - non-allowlisted tool ID
  - timeout / execution failure path
- `docs/user-guide.md` and touched command output use the same bounded contract language and do not market this feature as unrestricted shell/filesystem support.

## Rollback Notes

- If doctor output becomes too noisy, keep file/tool utility probes in `--debug-dump` only; do not promote them into the top-level doctor summary.
- If `runtime.diagnostics` grows beyond bounded bridge/runtime truth, narrow it to degradation reasons, capability snapshot, file/tool bounds summary, and recent bridge/runtime errors only.
- If file handling reaches an ambiguous binary or huge-file case, prefer explicit refusal over silent truncation or TS-side fallback.
- If pressure appears to widen `tool.execute`, reject it and defer to a separate scoped feature; do not silently widen the allowlist.
- If any touched TS path disagrees with Rust on bounds, denials, or degraded state, Rust wins and TS presentation should be narrowed rather than “corrected” locally.

## Reviewer Focus Points

- Reject any implementation that passes raw command strings, shell strings, or arbitrary executable names through `tool.execute`.
- Reject any implementation that allows file access outside the canonical repo root or follows symlink escapes.
- Verify no new method is advertised in `dh.initialize` without a live handler, TS wrapper, and operator/debug consumer path.
- Verify `dh doctor` condition remains a product/install/workspace surface, not a proxy for bridge runtime health or workflow progress.
- Verify `runtime.diagnostics` does not mention workflow stage, approval gates, release readiness, or QA state.
- Verify `file.read` / `file.readRange` / `file.list` surface explicit denials and invalid-shape failures rather than empty-success payloads.
- Verify `tool.execute` is inspectably allowlisted and bounded in docs, output, and tests.

### Preservation notes by downstream role

- **Fullstack Agent must preserve:**
  - Rust as the only truth source for file/process/runtime boundary and policy decisions
  - debug-dump/operator reuse instead of new CLI taxonomy
  - allowlisted `tool.execute` only; no unrestricted shell
  - approved-root-only filesystem access
- **Code Reviewer must preserve:**
  - no half-live capability advertisement
  - no TS `fs`/`child_process` fallback reclaiming truth on the touched utility/runtime surfaces
  - no runtime diagnostics payload that smuggles workflow-state or release readiness
- **QA Agent must preserve:**
  - explicit scenario coverage for success, degraded, denied, invalid, unsupported, timeout, and execution-failed outcomes where applicable
  - one inspectable operator story across `dh doctor`, JSON output, debug dump, bridge capability advertisement, and docs
