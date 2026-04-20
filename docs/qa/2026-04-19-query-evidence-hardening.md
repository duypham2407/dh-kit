---
artifact_type: qa_report
version: 1
status: qa_handoff
feature_id: QUERY-EVIDENCE-HARDENING
feature_slug: query-evidence-hardening
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-19-query-evidence-hardening.md
source_solution_package: docs/solution/2026-04-19-query-evidence-hardening.md
---

# QA Report: QUERY-EVIDENCE-HARDENING

## Verification Scope

- Mode/stage/task context verified: `full` / `full_qa` / `TASK-QUERY-EVIDENCE-REWORK-1 (qa_in_progress)`.
- Contract basis verified:
  - `docs/scope/2026-04-19-query-evidence-hardening.md`
  - `docs/solution/2026-04-19-query-evidence-hardening.md`
- Primary rework surfaces verified:
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `apps/cli/src/commands/root.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `docs/user-guide.md`
- Adjacent Rust truth surfaces verified for envelope/capability/evidence consistency:
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
- Explicit QA rework focus:
  - `dh explain` must stay on Rust-authoritative answer/evidence/capability envelope path.
  - docs/help/presenter wording must stay aligned to current runtime truth.
  - bounded scope honesty must hold: no new query classes, no new languages, no trace expansion, no retrieval-as-parser-proof.

## Observed Result

- **PASS**
- Ready-for-full_done: **Yes**

## Evidence

Fresh validation rerun in this QA pass:

- `semgrep --config p/ci <7 bounded rework files>` -> PASS, 0 findings.
- `semgrep --config p/security-audit <7 bounded rework files>` -> PASS, 0 findings.
- `cargo test --workspace` -> PASS.
- `npm run check` -> PASS.
- `npm test` -> PASS (73 files passed, 371 tests passed, 4 skipped).
- `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts -t "routes explain through Rust bridge envelope instead of retrieval fallback"` -> PASS (targeted explain-path regression).
- `npm test -- apps/cli/src/presenters/knowledge-command.test.ts` -> PASS (5 tests; wording/reporting surface).

Manual structural verification (bounded fallback):

- `run-knowledge-command.ts` keeps `ask` and `explain` on bridge path, maps `explain` to `graph_definition`, consumes Rust `answerState`/`evidence`/`languageCapabilitySummary`, and keeps `trace` explicitly `unsupported`.
- `dh-jsonrpc-stdio-client.ts` consumes Rust envelope fields (`answerState`, `questionClass`, `evidence`, `languageCapabilitySummary`) and no longer treats empty item arrays as transport failure.
- `root.ts`, `knowledge-command.ts`, and `docs/user-guide.md` now explicitly communicate bounded trace unsupported behavior and keep answer-state/capability-state wording separate and truthful.
- Rust bridge/query/type surfaces keep bounded relation support (`usage`, `dependencies`, `dependents`) and include tests asserting out-of-scope relation families are rejected and unresolved evidence cannot overclaim grounded status.

## Behavior Impact

- Rework finding `CR-QUERY-EVIDENCE-001` remains fixed: `dh explain` uses Rust-authoritative envelope truth (`answerState`, evidence packet, capability summary) instead of retrieval-shaped fallback behavior.
- Rework finding `CR-QUERY-EVIDENCE-002` remains fixed: command help, presenter output, and user guide wording align with current runtime truth, including explicit `trace` unsupported messaging in bounded mode.
- Bounded honesty remains intact for this feature pass: no query-class expansion, no language-expansion claim, no trace-flow capability expansion, and no retrieval output framed as parser-backed relation proof.

## Issue List

- None.

## Tool Evidence

- rule-scan: 0 findings on 7 files (runtime `tool.rule-scan` unavailable; substituted with Semgrep p/ci)
- security-scan: 0 findings on 7 files (runtime `tool.security-scan` unavailable; substituted with Semgrep p/security-audit)
- evidence-capture: 4 records written in this QA pass (`query-evidence-hardening-qa-runtime-2026-04-19`, `query-evidence-hardening-qa-automated-2026-04-19`, `query-evidence-hardening-qa-manual-scans-2026-04-19`, `query-evidence-hardening-qa-syntax-outline-unavailable-2026-04-19`)
- syntax-outline: unavailable — runtime path resolution points to `/Users/duypham/Code/DH/{cwd}/...`; manual structural verification performed on all changed bounded surfaces

## Recommended Route

- Route to `MasterOrchestrator` for `qa_to_done` approval and `full_done` closure.
- Reason: bounded acceptance targets are satisfied, both rework findings remain fixed with fresh evidence, and no closure-blocking QA findings remain.

## Verification Record(s)

- issue_type: `none` (QA pass)
  - severity: `none`
  - rooted_in: `n/a`
  - evidence:
    - Semgrep p/ci and p/security-audit reruns: PASS, 0 findings
    - targeted and full TypeScript tests/checks: PASS
    - full Rust workspace tests: PASS
    - manual structural verification confirms explain-path Rust-envelope routing and docs/help/presenter truth alignment
  - behavior_impact: QUERY-EVIDENCE-HARDENING remains closure-safe and bounded-contract honest
  - route: `qa_to_done` approval -> `full_done`
