---
artifact_type: qa_report
version: 1
status: fail
feature_id: FEATURE-JSONRPC-BINARY-BRIDGE
feature_slug: jsonrpc-binary-bridge
work_item_id: feature-jsonrpc-binary-bridge
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-05-05-jsonrpc-binary-bridge.md
source_solution_package: docs/solution/2026-05-05-jsonrpc-binary-bridge.md
---

# QA Report: JSON-RPC Binary Bridge

## Overall Status

FAIL — do not approve `qa_to_done` yet.

The implementation has strong targeted evidence for JSON fallback compatibility, MessagePack negotiation, binary decode/frame failure handling, lower/upper frame-bound validation, and documentation coverage. However, QA found blocking closure issues:

- The fresh bridge codec benchmark classifies the MessagePack path as `below_material` and the suite as `degraded`, so AC5/material performance evidence is not met.
- The full `dh-engine` regression suite fails host-contract CLI tests.
- The broader bridge/worker/workflow Vitest directory run fails workflow provider-propagation tests.

## Verification Scope

- Full-delivery QA for work item `feature-jsonrpc-binary-bridge` at stage `full_qa`.
- Source artifacts:
  - `docs/scope/2026-05-05-jsonrpc-binary-bridge.md`
  - `docs/solution/2026-05-05-jsonrpc-binary-bridge.md`
- Primary changed surfaces checked:
  - TypeScript bridge codec/client: `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`, `packages/opencode-app/src/bridge/stdio-codec.ts`
  - TypeScript worker peer and host bridge client: `packages/opencode-app/src/worker/worker-jsonrpc-stdio.ts`, `packages/opencode-app/src/worker/host-bridge-client.ts`
  - Workflow regression tests under `packages/opencode-app/src/workflows/`
  - Rust bridge/benchmark/protocol surfaces: `rust-engine/crates/dh-engine/src/bridge.rs`, `rust-engine/crates/dh-engine/src/benchmark.rs`, `rust-engine/crates/dh-engine/src/main.rs`, `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - Shared Rust benchmark type surface: `rust-engine/crates/dh-types/src/lib.rs`
  - Dependency manifests: `package.json`, `package-lock.json`, `rust-engine/Cargo.toml`, `rust-engine/crates/dh-engine/Cargo.toml`, `rust-engine/Cargo.lock`
  - Protocol docs: `docs/migration/deep-dive-02-bridge-jsonrpc.md`
- Acceptance focus:
  - AC1 negotiation
  - AC2 binary behavior parity
  - AC3 JSON fallback
  - AC4 large payload binary path
  - AC5 performance evidence and classification
  - AC6 malformed/truncated/oversized frame handling and structured failures
  - AC7 mode observability
  - AC8 JSON compatibility/no unrelated regressions
  - AC9 documentation coverage

## Observed Result

FAIL — route back for rework before `qa_to_done`.

Targeted bridge tests pass, but closure is blocked by unmet benchmark acceptance and regression failures in broader target bridge/workflow validation.

## Evidence

### Automated command evidence

| Validation | Command | Exit / Result | Surface | QA Interpretation |
| --- | --- | ---: | --- | --- |
| Targeted TS bridge/worker/workflow tests | `npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts packages/opencode-app/src/worker/worker-jsonrpc-stdio.test.ts packages/opencode-app/src/workflows/run-knowledge-command.test.ts` | 0; 3 files, 62 tests passed | target_project_app | Covers JSON fallback, MessagePack negotiation, malformed/oversized binary responses, parity for `runtime.ping` / `query.search` / `query.buildEvidence`, large payload shape, and run-knowledge workflow regression coverage. |
| Host bridge client tests | `npm test -- packages/opencode-app/src/worker/host-bridge-client.test.ts` | 0; 1 file, 9 tests passed | target_project_app | Covers host bridge client compatibility after adding transport snapshot defaults. |
| TypeScript check | `npm run check` | 0; passed | target_project_app | Confirms TS compile/type consistency. |
| Rust bridge tests | `cargo test -p dh-engine bridge` from `rust-engine` | 0; 27 bridge-filtered tests passed | target_project_app | Covers Rust negotiation, MessagePack encode/decode shape, structured malformed/truncated/oversized frame handling, strict `Content-Length`, and `maxFrameBytes` lower/upper bounds. |
| Rust benchmark tests | `cargo test -p dh-engine benchmark` from `rust-engine` | 0; 14 benchmark-filtered/unit/CLI tests passed | target_project_app | Covers benchmark artifact shape and classification behavior. |
| Dev-profile bridge codec benchmark | `cargo run -p dh-engine -- benchmark --class bridge-codec --workspace .` from `rust-engine` | 0; `suite_status=degraded`; `improvement_class=below_material` | target_project_app | Blocking for AC5: JSON 67295 bytes vs MessagePack 47939 bytes, encode 2.73x, decode 1.35x; decode misses the implementation's material threshold and benchmark reports degraded evidence. |
| Release-profile bridge codec benchmark | `cargo run --release -p dh-engine -- benchmark --class bridge-codec --workspace .` from `rust-engine` | 0; `suite_status=degraded`; `improvement_class=below_material` | target_project_app | Blocking for AC5: optimized build still reports encode 2.20x and decode 1.46x with `target_5_10x_status=below_material_and_target`; not material improvement. |
| Full Rust engine regression | `cargo test -p dh-engine` from `rust-engine` | non-zero; 2 failures | target_project_app | Blocking regression. `host_contract_cli_prints_lifecycle_and_protocol_contracts` expects worker-to-host methods limited to `query.search`, `query.definition`, `query.relationship`, `query.buildEvidence`, but output includes `query.callHierarchy` and `query.entryPoints`; `shipped_cli_help_does_not_advertise_doctor_command` fails because help advertises `doctor`. |
| Broader bridge/worker/workflow TS regression | `npm test -- packages/opencode-app/src/bridge packages/opencode-app/src/worker packages/opencode-app/src/workflows` | non-zero; 2 failed tests, 90 passed | target_project_app | Blocking regression. `run-lane-command.test.ts` and `workflows.test.ts` provider-propagation tests fail because workflow summaries do not include injected provider output. |

### Acceptance coverage notes

- JSON fallback compatibility: covered by targeted TS tests showing `selectedMode=json-fallback` and forced `DH_BRIDGE_CODEC=json` behavior.
- MessagePack negotiation: covered by TS and Rust tests showing JSON initialize bootstrap followed by `selectedCodec=msgpack-rpc-v1` / `selectedMode=msgpack-rpc-v1`.
- Malformed/truncated/oversized frame handling: covered by TS worker/client tests and Rust bridge tests for malformed MessagePack, oversized frames before body allocation, truncated bodies, duplicate/non-numeric `Content-Length`, and outbound frame size enforcement.
- Max frame bounds: covered by TS lower-bound negotiation rejection and Rust lower/upper bound negotiation tests.
- Benchmark evidence: present but failing acceptance because both dev and release runs report `below_material` and `suite_status=degraded`.
- Docs coverage: `docs/migration/deep-dive-02-bridge-jsonrpc.md` documents MessagePack body mode, negotiation matrix, `json-fallback`, `maxFrameBytes` bounds, bridge codec error codes, fallback/failure matrix, and benchmark classification vocabulary.
- Regression coverage: targeted bridge tests pass, but broader target Rust engine and workflow test commands fail.

## Scan/Tool Evidence

### Direct scan status

| Tool | Scope | Direct status | Result | Findings | Surface | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| `tool.rule-scan` | `packages/opencode-app/src/bridge` | available | succeeded | 0 on 3 tracked TS files | runtime_tooling | Bridge client/test scope clean. |
| `tool.security-scan` | `packages/opencode-app/src/bridge` | available | succeeded | 0 on 3 tracked TS files | runtime_tooling | Bridge client/test scope clean. |
| `tool.rule-scan` | `packages/opencode-app/src/bridge/stdio-codec.ts` | available | succeeded | 0 on 1 TS file | runtime_tooling | New codec helper file clean. |
| `tool.security-scan` | `packages/opencode-app/src/bridge/stdio-codec.ts` | available | succeeded | 0 on 1 TS file | runtime_tooling | New codec helper file clean. |
| `tool.rule-scan` | `packages/opencode-app/src/worker` | available | succeeded | 0 on 8 tracked TS files | runtime_tooling | Worker peer/client scope clean. |
| `tool.security-scan` | `packages/opencode-app/src/worker` | available | succeeded | 0 on 8 tracked TS files | runtime_tooling | Worker peer/client scope clean. |
| `tool.rule-scan` | `packages/opencode-app/src/workflows` | available | succeeded | 0 on 8 tracked TS files | runtime_tooling | Workflow scan clean despite failing workflow tests. |
| `tool.security-scan` | `packages/opencode-app/src/workflows` | available | succeeded | 0 on 8 tracked TS files | runtime_tooling | Workflow scan clean despite failing workflow tests. |
| `tool.security-scan` | `package.json` | available | succeeded | 0 on 1 target | runtime_tooling | Dependency manifest security scan clean. |
| `tool.rule-scan` / `tool.security-scan` | Rust, TOML, Markdown changed scopes | available | succeeded with 0 Semgrep targets on several non-TS scopes | 0 findings | runtime_tooling | Direct tools were callable, but bundled Semgrep pack reported `Targets scanned: 0` for Rust/docs/TOML scopes; treat as coverage limitation, not Rust direct-scan proof. |
| `tool.syntax-outline` | key TS changed files | available | succeeded | n/a | runtime_tooling | Outlined 5 TS files: bridge client, codec helper, worker peer, host bridge client, run-knowledge test. |
| `tool.syntax-outline` | key Rust changed files | available but degraded | unsupported language | n/a | runtime_tooling | Attempted 5 Rust files; syntax tool reported `unsupported-language`. |
| `tool.syntax-locate` | `stdio-codec.ts`, `worker-jsonrpc-stdio.ts` | available | succeeded | n/a | runtime_tooling | Located codec helper functions and worker peer classes. |

### Finding classification summary

Required scan findings are fully classified:

- blocking: 0
- true_positive: 0
- non_blocking_noise: 0
- false_positive: 0
- follow_up: 0
- unclassified: 0

False positives: none.

Manual override caveats: none. Direct scan tools were available. The caveat is target coverage: Rust/docs/TOML scans returned 0 Semgrep targets, so Cargo tests/checks are the primary Rust validation evidence.

Validation-surface caveat: OpenKit scan evidence is `runtime_tooling`; workflow/evidence storage is `compatibility_runtime`; npm/Cargo commands are `target_project_app`. Scan success does not substitute for the failing target project test/benchmark evidence.

## Tool Evidence

- rule-scan: direct=available, result=succeeded, findings=0 on changed TS scopes (`packages/opencode-app/src/bridge`, `packages/opencode-app/src/bridge/stdio-codec.ts`, `packages/opencode-app/src/worker`, `packages/opencode-app/src/workflows`), surface=runtime_tooling; Rust/docs/TOML direct calls succeeded but scanned 0 targets, coverage limitation preserved.
- security-scan: direct=available, result=succeeded, findings=0 on changed TS scopes and `package.json`, surface=runtime_tooling; Rust/docs/TOML direct calls succeeded but scanned 0 targets, coverage limitation preserved.
- evidence-capture: 2 QA records written with validation-surface labels and artifact refs: `jrb-full-qa-final-2026-05-05` and `jrb-full-qa-scan-evidence-2026-05-05`, surface=compatibility_runtime.
- syntax-outline: 5 TS files outlined successfully; 5 Rust files attempted with unsupported-language/degraded result.
- classification summary: blocking=0, true_positive=0, non_blocking_noise=0, false_positive=0, follow_up=0, unclassified=0 for scan findings.
- false positives: none.
- manual override caveats: none; direct scan tools were available. Non-TS Semgrep target coverage is limited.
- artifact refs: `docs/qa/2026-05-05-jsonrpc-binary-bridge.md`, `docs/scope/2026-05-05-jsonrpc-binary-bridge.md`, `docs/solution/2026-05-05-jsonrpc-binary-bridge.md`, `docs/migration/deep-dive-02-bridge-jsonrpc.md`, workflow evidence record `jrb-full-qa-final-2026-05-05`.

## Behavior Impact

- Passed: JSON fallback mode remains observable and compatible in targeted TS bridge tests.
- Passed: MessagePack negotiation and post-initialize codec switching are exercised in targeted TS and Rust tests.
- Passed: Structured handling exists for malformed MessagePack, truncated frames, oversized frames, strict `Content-Length`, and `maxFrameBytes` lower/upper bound rejection in targeted tests.
- Passed: Documentation covers the selected strategy, negotiation/fallback behavior, failure modes, size limits, and benchmark classification vocabulary.
- Failed: Performance acceptance is not met. The release benchmark reports `suite_status=degraded`, `improvement_class=below_material`, encode 2.20x, decode 1.46x.
- Failed: Full Rust engine regression has host-contract failures, indicating protocol/CLI contract drift or stale tests that must be resolved before closure.
- Failed: Broader bridge/worker/workflow Vitest command has provider-propagation workflow failures.

## Issue List

### JRB-QA-001 — Bridge codec benchmark does not meet material improvement acceptance

- type: `bug`
- severity: `high`
- rooted_in: `implementation`
- recommended_owner: `FullstackAgent` first; route to `SolutionLead` if the MessagePack full-envelope approach cannot meet material improvement without a design change.
- evidence:
  - `cargo run -p dh-engine -- benchmark --class bridge-codec --workspace .` reported `suite_status=degraded`, `improvement_class=below_material`, encode 2.73x, decode 1.35x.
  - `cargo run --release -p dh-engine -- benchmark --class bridge-codec --workspace .` reported `suite_status=degraded`, `improvement_class=below_material`, encode 2.20x, decode 1.46x, `target_5_10x_status=below_material_and_target`.
- artifact_refs:
  - `rust-engine/crates/dh-engine/src/benchmark.rs`
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `docs/scope/2026-05-05-jsonrpc-binary-bridge.md`
  - `docs/solution/2026-05-05-jsonrpc-binary-bridge.md`
- behavior_impact: AC5 and the success signal requiring repository-verifiable material performance improvement are not met; performance evidence exists but is classified as degraded.
- route: `full_implementation` for optimization or evidence rework; escalate to `full_solution` only if the selected approach/threshold must change.

### JRB-QA-002 — Full Rust engine regression suite fails host-contract CLI tests

- type: `bug`
- severity: `high`
- rooted_in: `implementation`
- recommended_owner: `FullstackAgent`
- evidence:
  - `cargo test -p dh-engine` exits non-zero.
  - `host_contract_cli_prints_lifecycle_and_protocol_contracts` expected worker-to-host query methods `query.search`, `query.definition`, `query.relationship`, `query.buildEvidence`; actual output also includes `query.callHierarchy` and `query.entryPoints`.
  - `shipped_cli_help_does_not_advertise_doctor_command` failed because CLI help advertises `doctor`.
- artifact_refs:
  - `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/tests/host_contract_cli_test.rs`
- behavior_impact: Host protocol/CLI contract expectations are failing during a target Rust regression run; this violates the requested no-regression validation path and potentially AC8 unless explicitly re-scoped.
- route: `full_implementation`; if the added protocol/CLI behavior is intentional, route through `full_solution` / `full_product` to update approved scope and tests before QA can pass.

### JRB-QA-003 — Broader TS workflow regression tests fail provider-propagation expectations

- type: `bug`
- severity: `high`
- rooted_in: `implementation`
- recommended_owner: `FullstackAgent`
- evidence:
  - `npm test -- packages/opencode-app/src/bridge packages/opencode-app/src/worker packages/opencode-app/src/workflows` exits non-zero.
  - `packages/opencode-app/src/workflows/run-lane-command.test.ts` expected workflow summary to contain `Injected provider handled quick workflow.` but received the default quick-agent summary.
  - `packages/opencode-app/src/workflows/workflows.test.ts` expected summary to contain `Coordinator used injected provider.` but received the default quick-agent summary.
- artifact_refs:
  - `packages/opencode-app/src/workflows/run-lane-command.test.ts`
  - `packages/opencode-app/src/workflows/workflows.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- behavior_impact: Broader target workflow regression command does not pass; QA cannot certify no regressions in bridge/workflow tests.
- route: `full_implementation` to restore provider propagation behavior or provide accepted baseline evidence proving this is pre-existing/out-of-scope.

## Residual Risks

- Rust/docs/TOML OpenKit Semgrep scans are not meaningful coverage because the bundled scan pack reported 0 targets for those scopes. Cargo validation remains the primary Rust correctness evidence.
- Benchmark evidence is local encode/decode evidence only; it does not measure end-to-end workflow latency and reports memory as not measured.
- The worker peer codec remains construction-time configured in the TS peer tests; post-negotiate dynamic peer codec switching is covered in the direct bridge client but not as a full production worker-bundle smoke.
- No commit, push, release, or deployment action was performed by QA.

## Recommended Route

Return to `MasterOrchestrator` with `Observed Result: FAIL`.

Recommended gate action: do not approve `qa_to_done`. Route to `full_implementation` for the three blocking QA issues above. If performance cannot be made material under the current MessagePack full-envelope approach, route the performance issue through `full_solution` for design/acceptance reconsideration before implementation rework.

## Verification Record(s)

- issue_type: `bug`
  severity: `high`
  rooted_in: `implementation`
  evidence: Release bridge codec benchmark reports `suite_status=degraded`, `improvement_class=below_material`, encode 2.20x, decode 1.46x.
  behavior_impact: Performance acceptance and success signal are not met.
  route: `full_implementation`, with possible `full_solution` if approach/threshold must change.

- issue_type: `bug`
  severity: `high`
  rooted_in: `implementation`
  evidence: `cargo test -p dh-engine` fails two host-contract CLI tests.
  behavior_impact: Target Rust host/bridge regression surface is not clean.
  route: `full_implementation` or scope/solution clarification if behavior is intentional.

- issue_type: `bug`
  severity: `high`
  rooted_in: `implementation`
  evidence: Broader `npm test -- packages/opencode-app/src/bridge packages/opencode-app/src/worker packages/opencode-app/src/workflows` fails two workflow provider-propagation tests.
  behavior_impact: Target workflow regression surface is not clean.
  route: `full_implementation` or accepted baseline evidence if pre-existing/out-of-scope.
