---
artifact_type: qa_report
version: 1
status: qa_handoff
feature_id: HYBRID-SEARCH-COMPLETION
feature_slug: hybrid-search-completion
owner: QAAgent
approval_gate: qa_to_done
---

# QA Report: HYBRID-SEARCH-COMPLETION

## Verification Scope

- Mode/stage/task: `full` / `full_qa` / `TASK-HYBRID-SEARCH (qa_in_progress)`
- Scope and solution contract reviewed:
  - `docs/scope/2026-04-16-hybrid-search-completion.md`
  - `docs/solution/2026-04-16-hybrid-search-completion.md`
- Implementation surfaces verified:
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `docs/user-guide.md`

## Observed Result

- **PASS**

## Evidence

Fresh QA evidence collected in this QA pass:

- `semgrep --config p/ci --json --output qa-semgrep-rule-scan.json <8 touched files>` → PASS, **0 findings**
- `semgrep --config p/security-audit --json --output qa-semgrep-security-scan.json <8 touched files>` → PASS, **0 findings**
- `npm run check` → PASS (`tsc --noEmit`)
- `npm test` → PASS (`73` test files passed, `375` tests passed, `4` skipped)
- `cargo test --workspace` (in `rust-engine/`) → PASS

Structural/contract verification against approved scope+solution:

- Hybrid search is exposed as bounded, inspectable behavior through workflow report fields (`catalogClass`, `supportState`, `supportDepth`, `provider`, `hybridMode`, `intentProfile`, `signalSummary`, `inspection`).
- Intent-aware weighting is bounded to approved profiles (`lookup`, `explain`, `debug`, `default`) and search fallback/degradation stays explicit.
- Degraded semantic behavior is surfaced with explicit limitation wording (`semantic unavailable or not contributing`) rather than silent overclaim.
- Explicit graph query classes remain distinct from hybrid search routing (`graph_definition`, `graph_relationship_*`, `graph_call_hierarchy`, `graph_trace_flow`, `graph_impact`).
- Bridge capability contract and relation support are expanded and tested end-to-end across TypeScript bridge client and Rust bridge server.
- CLI presenter output and user guide documentation are aligned with bounded query/search class taxonomy and support-state semantics.

## Behavior Impact

Observable behavior verified as passing:

- Operators receive explicit bounded class/state metadata instead of implicit search-only output.
- Hybrid search can report truthful fallback when semantic contribution is missing/weak.
- Trace/call hierarchy/impact flows are routed to dedicated bounded query classes instead of being absorbed into generic hybrid retrieval.
- Support states remain distinct (`grounded` / `partial` / `insufficient` / `unsupported`) and surfaced to operator-facing output.

Residual QA limitation (non-blocking):

- Runtime `tool.syntax-outline` invocation was unavailable due path-resolution mismatch (`/Users/duypham/Code/DH/{cwd}` runtime root shape). Structural verification used direct source review plus passing tests and bridge contract checks.

## Issue List

- **None (no blocking findings, no reroute-required findings).**

## Tool Evidence

- rule-scan: 0 findings on 8 files (tool.rule-scan unavailable in runtime; substituted with `semgrep --config p/ci`)
- security-scan: 0 findings on 8 files (tool.security-scan unavailable in runtime; substituted with `semgrep --config p/security-audit`)
- evidence-capture: 4 records written (`qa-hybrid-rule-scan-2026-04-17`, `qa-hybrid-security-scan-2026-04-17`, `qa-hybrid-validation-2026-04-17`, `qa-hybrid-syntax-outline-unavailable-2026-04-17`)
- syntax-outline: unavailable — runtime path-resolution mismatch; manual structural verification performed

## Recommended Route

- Recommend `MasterOrchestrator` approve `qa_to_done` and advance HYBRID-SEARCH-COMPLETION to `full_done`.

## Verification Record(s)

- issue_type: none
  severity: none
  rooted_in: n/a
  evidence:
    - semgrep p/ci + p/security-audit on touched files: 0 findings
    - npm run check: pass
    - npm test: pass
    - cargo test --workspace: pass
    - scope/solution contract alignment verified on touched surfaces
  behavior_impact: bounded hybrid-search completion behavior is observable and consistent with approved acceptance contract
  route: full_done
