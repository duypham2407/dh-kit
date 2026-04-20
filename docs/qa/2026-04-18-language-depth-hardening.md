---
artifact_type: qa_report
version: 1
status: qa_handoff
feature_id: LANGUAGE-DEPTH-HARDENING
feature_slug: language-depth-hardening
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-18-language-depth-hardening.md
source_solution_package: docs/solution/2026-04-18-language-depth-hardening.md
---

# QA Report: LANGUAGE-DEPTH-HARDENING

## Verification Scope

- Mode/stage/task context verified: `full` / `full_qa` / `TASK-LANGUAGE-DEPTH-REWORK-1 (qa_in_progress)`.
- Contract basis verified:
  - `docs/scope/2026-04-18-language-depth-hardening.md`
  - `docs/solution/2026-04-18-language-depth-hardening.md`
- Primary rework surfaces verified:
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `docs/user-guide.md`
  - `rust-engine/crates/dh-query/src/lib.rs`
- Adjacent reporting surfaces spot-checked:
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
- Explicit QA focus from rework findings:
  - out-of-scope relation families are not first-class in this feature path
  - `find_dependents` must not overclaim `grounded` when unresolved edges contribute

## Observed Result

- **PASS**
- Ready-for-full_done: **Yes**

## Evidence

Fresh validation rerun in this QA pass:

- `semgrep --config p/ci --json --output qa-semgrep-rule-scan-language-depth-hardening-qa.json <7 files>` -> PASS, 0 findings.
- `semgrep --config p/security-audit --json --output qa-semgrep-security-scan-language-depth-hardening-qa.json <7 files>` -> PASS, 0 findings.
- `cargo test -p dh-query dependents_are_partial_when_unresolved_references_contribute` -> PASS (1 passed).
- `cargo test -p dh-engine out_of_scope_relation_family_requests_are_rejected` -> PASS (1 passed).
- `npm run check && npm test` -> PASS (`tsc --noEmit` + Vitest: 72 files passed, 376 tests passed, 4 skipped).
- `cargo test --workspace` -> PASS.
- Targeted TS reruns on reporting surfaces:
  - `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts` -> PASS (22 passed)
  - `npm test -- apps/cli/src/presenters/knowledge-command.test.ts` -> PASS (4 passed)
  - `npm test -- packages/runtime/src/diagnostics/doctor.test.ts` -> PASS (12 passed)

Manual structural verification (required fallback because runtime syntax tool path resolution is broken):

- Bridge contract remains bounded to first-class `usage`, `dependencies`, `dependents`; out-of-scope relation families are rejected with method-not-supported and tested (`out_of_scope_relation_family_requests_are_rejected`).
- Ask/trace classification continues to gate call-hierarchy/trace/impact requests to `unsupported` in operator-facing flows.
- `find_dependents` now downgrades to `AnswerState::Partial` when unresolved references contribute (`unresolved_seen`), with explicit unresolved-gap evidence.
- UI/reporting surfaces continue separating answer/result state (`grounded|partial|insufficient|unsupported`) from language capability state (`supported|partial|best-effort|unsupported`).

## Behavior Impact

- Rework finding #1 remains fixed in behavior: out-of-scope relation families are not surfaced as first-class for this feature path.
- Rework finding #2 remains fixed in behavior: dependents no longer overclaim `grounded` when unresolved edges contribute; degraded honesty is preserved.
- Bounded scope honesty remains intact: this feature hardens direct relation families only; call-hierarchy/trace/impact remain outside this feature contract.

## Issue List

- None.

## Tool Evidence

- rule-scan: 0 findings on 7 files (manual substitute via Semgrep p/ci because runtime `tool.rule-scan` is unavailable)
- security-scan: 0 findings on 7 files (manual substitute via Semgrep p/security-audit because runtime `tool.security-scan` is unavailable)
- evidence-capture: 4 records written (`language-depth-hardening-qa-rule-scan-2026-04-19`, `language-depth-hardening-qa-security-scan-2026-04-19`, `language-depth-hardening-qa-validation-2026-04-19`, `language-depth-hardening-qa-targeted-ts-2026-04-19`)
- syntax-outline: unavailable — runtime tool resolves paths to `/Users/duypham/Code/DH/{cwd}/...`; manual structural verification performed on all required rework surfaces

## Recommended Route

- Route to `MasterOrchestrator` for `qa_to_done` approval and `full_done` closure.
- Reason: bounded acceptance targets are satisfied, both rework findings remain fixed with fresh evidence, and no closure-blocking QA findings remain.

## Verification Record(s)

- issue_type: `none` (QA pass)
  - severity: `none`
  - rooted_in: `n/a`
  - evidence:
    - Semgrep p/ci and p/security-audit reruns: both PASS with 0 findings on bounded files
    - targeted Rust regression tests for both rework findings: PASS
    - full TypeScript check + full JS/TS test suite: PASS
    - full Rust workspace tests: PASS
    - manual structural verification confirms bounded relation-family gating and truthful dependents degradation behavior
  - behavior_impact: feature remains closure-safe and aligned to bounded LANGUAGE-DEPTH-HARDENING scope
  - route: `qa_to_done` approval -> `full_done`
