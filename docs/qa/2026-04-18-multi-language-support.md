---
artifact_type: qa_report
version: 1
status: qa_handoff
feature_id: MULTI-LANGUAGE-SUPPORT
feature_slug: multi-language-support
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-18-multi-language-support.md
source_solution_package: docs/solution/2026-04-18-multi-language-support.md
---

# QA Report: MULTI-LANGUAGE-SUPPORT

## Verification Scope

- Mode/stage/task context verified: `full` / `full_qa` / `TASK-MULTI-LANGUAGE-REWORK-1 (qa_in_progress)`.
- Contract basis verified:
  - `docs/scope/2026-04-18-multi-language-support.md`
  - `docs/solution/2026-04-18-multi-language-support.md`
- Rework surfaces verified:
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-parser/src/adapters/python.rs`
  - `rust-engine/crates/dh-parser/src/adapters/go.rs`
  - `rust-engine/crates/dh-parser/src/adapters/rust.rs`
- Support/reporting surfaces spot-checked:
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
- Explicit QA focus from code review rework:
  - CR-MULTI-LANGUAGE-001: no over-claimed dependency and dependent capability states for Python, Go, Rust.
  - CR-MULTI-LANGUAGE-002: unsupported relation classes are gated before execution and surfaced truthfully.

## Observed Result

- **PASS**
- Ready-for-full_done: **Yes**

## Evidence

Fresh validation rerun in this QA pass:

- `semgrep --config p/ci <5 focus files>` -> PASS, 0 findings.
- `semgrep --config p/security-audit <5 focus files>` -> PASS, 0 findings.
- `cargo test -p dh-query dependency_capabilities_are_not_overclaimed_for_python_go_and_rust` -> PASS.
- `cargo test -p dh-engine unsupported_language_capabilities_are_gated_before_relation_execution` -> PASS.
- `cargo test -p dh-parser --test multi_language_adapters` -> PASS (5 tests).
- `npm run check` -> PASS.
- `npm test` -> PASS (72 test files, 377 passed, 4 skipped).
- `cargo test --workspace` -> PASS.
- Targeted TypeScript reruns:
  - `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts` -> PASS (22 tests)
  - `npm test -- apps/cli/src/presenters/knowledge-command.test.ts` -> PASS (4 tests)
  - `npm test -- packages/runtime/src/diagnostics/doctor.test.ts` -> PASS (12 tests)

Manual structural verification (bounded fallback due syntax-outline runtime path issue):

- `dh-query` capability matrix keeps Python, Go, Rust dependencies and dependents at `partial` with explicit bounded unresolved reasons.
- `dh-engine` relationship handlers gate unsupported classes before execution via `unsupported_relationship_summary(...)` and return unsupported answer state with language capability summary.
- `dh-parser` Python, Go, Rust adapters remain syntax-first and bounded, with unresolved import handling explicit.
- `run-knowledge-command` keeps answer support state separate from language and capability state.
- `doctor` derives language support boundaries from bridge capability matrix and reports bounded statuses.

## Behavior Impact

- CR-MULTI-LANGUAGE-001 remains fixed in behavior: Python, Go, Rust dependency and dependent capabilities are no longer over-claimed and remain explicitly partial.
- CR-MULTI-LANGUAGE-002 remains fixed in behavior: unsupported relation classes are blocked before execution and surfaced as unsupported rather than returning misleading parser-backed relation evidence.
- Bounded honesty preserved: TS and JS remain strongest baseline; Python, Go, Rust remain bounded partial or best-effort where documented.

## Issue List

- None.

## Tool Evidence

- rule-scan: unavailable — runtime `tool.rule-scan`; substituted with Semgrep p/ci (0 findings on 5 files)
- security-scan: unavailable — runtime `tool.security-scan`; substituted with Semgrep p/security-audit (0 findings on 5 files)
- evidence-capture: 1 record written (`multi-language-qa-pass-2026-04-18`)
- syntax-outline: unavailable — runtime path resolution points at `/Users/duypham/Code/DH/{cwd}/...`; manual structural verification performed on all 5 rework files

## Recommended Route

- Route to `MasterOrchestrator` for `qa_to_done` approval and `full_done` closure.
- Reason: bounded multi-language acceptance checks are satisfied, fresh validation evidence is green, and no closure-blocking QA findings remain.

## Verification Record(s)

- issue_type: `none` (QA pass)
  - severity: `none`
  - rooted_in: `n/a`
  - evidence:
    - Semgrep p/ci PASS (0 findings)
    - Semgrep p/security-audit PASS (0 findings)
    - targeted dh-query and dh-engine and dh-parser tests PASS
    - full TypeScript checks and tests PASS
    - full Rust workspace tests PASS
    - manual structural verification confirms capability honesty and unsupported relation gating stay fixed
  - behavior_impact: bounded support truth remains honest and closure-safe for this release boundary
  - route: `qa_to_done` approval -> `full_done`
