---
artifact_type: qa_report
version: 1
status: pass
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
work_item_id: rust-graph-ast-migration
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-30-rust-graph-ast-migration.md
source_solution_package: docs/solution/2026-04-30-rust-graph-ast-migration.md
---

# QA Report: Rust Graph AST Migration

## Overall Status

PASS — approved for `qa_to_done`; no blocking QA findings remain.

## Verification Scope

- Verified full-delivery work item `rust-graph-ast-migration` at stage `full_qa` against the scope and solution artifacts:
  - `docs/scope/2026-04-30-rust-graph-ast-migration.md`
  - `docs/solution/2026-04-30-rust-graph-ast-migration.md`
- Used the validation evidence already produced by implementation/review handoff, per user instruction not to run broader work unless needed.
- Checked the acceptance target that Graph/AST extraction is now Rust-owned and legacy TypeScript graph extraction / `GraphRepo` production consumers have been removed or routed through explicit Rust/degraded boundaries.
- Reviewed evidence for the primary changed behavior surfaces:
  - Rust parser/indexer/storage/types/graph/query/engine crates under `rust-engine/`
  - TypeScript bridge and worker client protocol surfaces under `packages/opencode-app/src/bridge` and `packages/opencode-app/src/worker`
  - Retrieval and runtime graph consumer adapters under `packages/retrieval/src/query` and `packages/runtime/src/jobs`
  - Deleted legacy graph extractor/storage repository paths under `packages/intelligence/src/graph` and `packages/storage/src/sqlite/repositories/graph-repo.ts`
- Verified scan/tool gates required for QA reporting with direct OpenKit runtime tooling where available.

## Observed Result

PASS — approve for `qa_to_done`.

No blocking QA findings were identified from the supplied validation matrix, code-review approval, production legacy graph audit, direct scan evidence, or structural inspection of the key TypeScript boundary files.

QA did not rerun the full TS/Rust test matrix in this final pass; the user explicitly requested using the already-produced validation evidence. QA did run the required scan/structural/evidence-capture tooling needed to make the closure recommendation.

## Evidence

## Test Evidence

The final QA decision is supported by the test/check matrix summarized here and detailed in the evidence table below: targeted TS tests passed (7 files, 61 tests), `npm run check` passed, Rust parser/indexer/graph/query/engine tests passed, and the changed Rust package compile gate passed.

| Validation | Command / Evidence Considered | Exit / Result | Surface | QA Interpretation |
| --- | --- | ---: | --- | --- |
| TS targeted tests | `npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts packages/opencode-app/src/worker/host-bridge-client.test.ts packages/retrieval/src/query/run-retrieval.test.ts packages/retrieval/src/query/dependency-edge-adapter.test.ts packages/retrieval/src/semantic/telemetry-collector.test.ts packages/runtime/src/jobs/index-job-runner.test.ts packages/runtime/src/jobs/rust-index-graph-report-adapter.test.ts` | 0; 7 files, 61 tests passed | target_project_app | Covers bridge/worker protocol, retrieval/runtime adapter behavior, telemetry, and degraded boundary handling. |
| TS type/check gate | `npm run check` | 0; passed | target_project_app | Supports TypeScript compile/type consistency across the changed package surfaces. |
| Rust parser resolver | `cargo test -p dh-parser -- module_resolver` | 0; passed | target_project_app | Covers Rust module resolution behavior. |
| Rust TypeScript adapter | `cargo test -p dh-parser --test typescript_adapter` | 0; passed | target_project_app | Covers TypeScript adapter behavior in Rust parser. |
| Rust multi-language adapters | `cargo test -p dh-parser --test multi_language_adapters` | 0; passed | target_project_app | Covers adapter behavior across supported language paths. |
| Rust indexer integration | `cargo test -p dh-indexer --test integration_test` | 0; 15 tests passed | target_project_app | Covers indexer integration after Graph/AST migration rework. |
| Rust linker | `cargo test -p dh-indexer -- linker` | 0; 3 tests passed | target_project_app | Covers linker correctness after code-review blocker rework. |
| Rust graph | `cargo test -p dh-graph` | 0; 5 tests passed | target_project_app | Covers graph crate behavior. |
| Rust query | `cargo test -p dh-query` | 0; 12 tests passed | target_project_app | Covers query crate behavior. |
| Rust engine bridge | `cargo test -p dh-engine -- bridge` | 0; 15 tests passed | target_project_app | Covers Rust bridge/RPC-related behavior. |
| Rust compile gate | `cargo check -p dh-engine -p dh-indexer -p dh-parser -p dh-storage -p dh-types -p dh-graph -p dh-query` | 0; passed | target_project_app | Confirms changed Rust workspace package set compiles. |
| Production legacy graph audit | Search/audit for `extractCallEdges`, `extractCallSites`, `extractImportEdges`, `GraphIndexer`, `GraphRepo`, direct `intelligence/src/graph`, and `graph-repo` production imports in packages | No production legacy imports found; remaining matches are new Rust adapter naming and tests/support docs | target_project_app / runtime_tooling | Supports acceptance that runtime/retrieval/opencode production paths no longer invoke deleted legacy graph extraction or `GraphRepo`. |
| Code review gate | `code_review_to_qa` approved by Code Reviewer after Rust rework and TS cleanup review | Approved | compatibility_runtime | No unresolved code-review blocker remains for QA. |
| QA evidence capture | `tool.evidence-capture` record `qa-rga-final-qa-2026-05-04` | recorded | compatibility_runtime | Captures final QA synthesis and caveats in workflow state. |

## Scan/Tool Evidence

### Direct scan status

| Tool | Scope | Direct status | Result | Findings | Surface | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| `tool.rule-scan` | `packages/runtime/src/jobs` | available | succeeded | 0 on 4 tracked TS files | runtime_tooling | Changed runtime job/adapter scope is clean. |
| `tool.rule-scan` | `packages/retrieval/src/query` | available | succeeded | 0 on 11 tracked TS files | runtime_tooling | Changed retrieval query/adapter scope is clean. |
| `tool.rule-scan` | `packages/opencode-app/src/bridge` | available | succeeded | 0 on 2 tracked TS files | runtime_tooling | Changed bridge scope is clean. |
| `tool.rule-scan` | `packages/opencode-app/src/worker` | available | succeeded | 0 on 8 tracked TS files | runtime_tooling | Changed worker scope is clean. |
| `tool.rule-scan` | full project `.` | available | succeeded | 25 quality findings | runtime_tooling | Findings are pre-existing/out-of-scope quality warnings; classified below as follow-up, not closure blockers. |
| `tool.security-scan` | full project `.` | available | succeeded | 0 on 367 scanned targets | runtime_tooling | No security findings. |
| `tool.syntax-outline` | key TS boundary files | available | succeeded | n/a | runtime_tooling | Outlined 4 files: runtime report adapter, retrieval dependency-edge adapter, opencode bridge client, opencode worker host bridge client. |
| `tool.evidence-capture` | final QA synthesis | available | succeeded | n/a | compatibility_runtime | Record written: `qa-rga-final-qa-2026-05-04`. |

### Full rule-scan finding classification

Full-project `tool.rule-scan` returned 25 quality findings grouped into three rule families. QA accepts the code-review triage that these are not blockers for this work item because the changed cleanup scopes are clean and the findings are in pre-existing/out-of-scope areas or support artifacts rather than the migrated production graph/AST runtime path.

| Rule | Count | Severity | QA Classification | Rationale / Impact | Follow-up |
| --- | ---: | --- | --- | --- | --- |
| `no-console-log` | 12 | WARNING | follow_up | Locations are outside the final changed Graph/AST migration production path, primarily diagnostics tests/scripts. No security issue and no observed behavior impact on the Rust graph migration acceptance path. | Clean up logging in a separate quality pass if the repository wants full-project rule-scan to be zero-findings. |
| `no-empty-catch` | 11 | WARNING | follow_up | Locations are outside the final changed runtime/retrieval/opencode bridge cleanup scopes or are support/test artifacts. No evidence that these catches affect the Rust-owned Graph/AST migration behavior verified here. | Document intentional swallowing or add logging/rethrow in a separate quality cleanup. |
| `no-todo-fixme` | 2 | INFO | follow_up | Locations are provider SDK areas unrelated to this work item. No behavior or security impact on Graph/AST migration acceptance. | Track or resolve TODO/FIXME comments separately. |

Classification summary for required scan/tool evidence:

- blocking: 0
- true_positive: 0
- non_blocking_noise: 0
- false_positive: 0
- follow_up: 25
- unclassified: 0

False positives: none. QA did not classify the full-project quality warnings as false positives; they remain real cleanup follow-ups outside this work item's closure gate.

Manual override caveats: none. Direct rule/security scan tools were available. The only caveat is target coverage: Rust path rule/security scan attempts from implementation/review sometimes reported 0 targets scanned, so Cargo tests/checks are the primary Rust validation evidence.

Validation-surface caveat: OpenKit scan evidence is `runtime_tooling`; workflow-state evidence capture is `compatibility_runtime`; TS/Rust test and check commands are the relevant target project validation evidence for this repository. Scan evidence is not reported as a substitute for Cargo/npm validation.

## Tool Evidence

- rule-scan: direct=available, result=succeeded, findings=0 on changed TS scopes (`packages/runtime/src/jobs`, `packages/retrieval/src/query`, `packages/opencode-app/src/bridge`, `packages/opencode-app/src/worker`); full-project result=25 quality findings on 334 scanned targets, classified as follow_up=25 and unclassified=0; surface=runtime_tooling.
- security-scan: direct=available, result=succeeded, findings=0 on full project (`.`), 367 scanned targets; surface=runtime_tooling.
- evidence-capture: 1 QA record written in this final pass with validation-surface labels and artifact refs: `qa-rga-final-qa-2026-05-04`.
- syntax-outline: 4 files outlined (`packages/runtime/src/jobs/rust-index-graph-report-adapter.ts`, `packages/retrieval/src/query/dependency-edge-adapter.ts`, `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`, `packages/opencode-app/src/worker/host-bridge-client.ts`).
- classification summary: blocking=0, true_positive=0, non_blocking_noise=0, false_positive=0, follow_up=25, unclassified=0.
- false positives: none.
- manual override caveats: none; direct scan tools were available. Rust Semgrep target coverage is limited when scans report 0 targets scanned, so Cargo evidence remains primary for Rust correctness.
- artifact refs: `docs/qa/2026-05-04-rust-graph-ast-migration.md`, `docs/scope/2026-04-30-rust-graph-ast-migration.md`, `docs/solution/2026-04-30-rust-graph-ast-migration.md`, generated RGA solution evidence under `docs/solution/2026-04-30-rust-graph-ast-migration-*`, and workflow evidence record `qa-rga-final-qa-2026-05-04`.

## Behavior Impact

- Passed: Rust parser/indexer/linker/query/graph/engine validation matrix passes after the code-review rework, including the linker and cross-package compile gate that were important to prior review blockers.
- Passed: TypeScript bridge/worker/retrieval/runtime adapter tests pass, covering protocol expansion, degraded adapter behavior, and telemetry handling at the package boundaries.
- Passed: Production consumer audit found no remaining legacy TypeScript graph extractor or `GraphRepo` production imports in the relevant package paths.
- Passed: Security scan found 0 findings.
- Non-blocking caveat: runtime/retrieval adapters currently expose degraded/unavailable Rust report/RPC boundary behavior until real Rust report/RPC integration is wired at those package boundaries. This is accepted as the current explicit boundary behavior, not a QA blocker for this migration closure.
- Non-blocking caveat: full-project quality scan still reports 25 pre-existing/out-of-scope `no-console-log`, `no-empty-catch`, and `no-todo-fixme` warnings; changed cleanup scopes are clean.
- Non-blocking caveat: Rust rule/security scans on Rust paths sometimes report 0 targets scanned, so Rust correctness rests primarily on Cargo tests/checks rather than Semgrep target coverage.

## Issues

Blocking QA findings: none.

Non-blocking follow-ups:

1. Wire real Rust report/RPC integration into the runtime/retrieval package boundaries so degraded/unavailable adapters can become available production report/query adapters.
2. Clean up full-project quality warnings (`no-console-log`, `no-empty-catch`, `no-todo-fixme`) in a separate quality task if the repository wants a zero-finding full rule-scan.
3. Improve Rust Semgrep/rule-scan target coverage or document the current coverage limitation; continue treating Cargo tests/checks as primary Rust validation evidence.

No QA issue is opened for these follow-ups because they do not block the accepted behavior for this work item and no unresolved true-positive security finding exists.

## Recommended Route

Route to `MasterOrchestrator` for `qa_to_done` approval and feature closure.

Recommended gate action: approve `qa_to_done` for `rust-graph-ast-migration`.

No commit, push, release, or broad cleanup action was performed by QA.

## Verification Record(s)

- issue_type: none
  severity: none
  rooted_in: none
  evidence: Supplied TS validation passed (7 files, 61 tests), `npm run check` passed, supplied Rust Cargo validation passed across parser/indexer/graph/query/engine/check commands, production legacy graph audit found no production legacy imports, Code Reviewer approved, direct changed-scope rule scans were clean, full security scan had 0 findings, and QA recorded evidence `qa-rga-final-qa-2026-05-04`.
  behavior_impact: The Rust Graph/AST migration is closure-ready with no blocking QA findings; legacy production graph extraction consumers are removed or routed through explicit Rust/degraded boundaries.
  route: `full_done` via `MasterOrchestrator` `qa_to_done` gate.

- issue_type: follow_up
  severity: low
  rooted_in: architecture
  evidence: Runtime/retrieval adapters intentionally return degraded/unavailable Rust report/RPC boundary states until real package-boundary integration exists.
  behavior_impact: Current behavior is explicit and tested as degraded; no blocking regression, but graph report/dependency edges remain unavailable at those package boundaries.
  route: backlog / future implementation slice, not a `qa_to_done` blocker.

- issue_type: follow_up
  severity: low
  rooted_in: implementation
  evidence: Full-project rule-scan has 25 quality findings grouped under `no-console-log`, `no-empty-catch`, and `no-todo-fixme`; changed cleanup scopes are clean and full security scan has 0 findings.
  behavior_impact: No observed impact on the Rust Graph/AST migration acceptance path; repository quality cleanup remains outstanding.
  route: backlog quality cleanup, not a `qa_to_done` blocker.

- issue_type: follow_up
  severity: low
  rooted_in: implementation
  evidence: Rust path Semgrep scans sometimes report 0 targets scanned; Cargo tests/checks provide the primary Rust validation evidence.
  behavior_impact: Rust behavior is validated by Cargo, but scan coverage should be improved or documented for future QA confidence.
  route: tooling follow-up, not a `qa_to_done` blocker.
