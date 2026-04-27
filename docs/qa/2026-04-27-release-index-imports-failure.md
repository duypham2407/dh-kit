---
artifact_type: qa_report
version: 1
status: pass
feature_id: RELEASE-INDEX-IMPORTS-FAILURE
feature_slug: release-index-imports-failure
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-27-release-index-imports-failure.md
source_solution_package: docs/solution/2026-04-27-release-index-imports-failure.md
---

# QA Report: Release Index Imports Failure

## Verification Scope

- Verified full-delivery hotfix `RELEASE-INDEX-IMPORTS-FAILURE` from `docs/scope/2026-04-27-release-index-imports-failure.md` and `docs/solution/2026-04-27-release-index-imports-failure.md`.
- Checked the user-visible release validation goal: `dh-engine index` and `dh-engine status` must no longer fail this repository with `insert imports for packages/opencode-app/src/workflows/run-lane-command.ts`, `UNIQUE constraint failed: imports.id`, or a stale `last_error`.
- Checked changed implementation/test surfaces:
  - `rust-engine/crates/dh-parser/src/adapters/typescript.rs`
  - `rust-engine/crates/dh-parser/tests/typescript_adapter.rs`
  - `rust-engine/crates/dh-indexer/tests/integration_test.rs`
- Verified acceptance criteria AC1 through AC6, including the protected-state rule: QA did not delete raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, generated local state, or release evidence; QA did not commit, push, tag, or publish.

## Observed Result

PASS

The index/import insertion failure is fixed for this repository. Fresh `dh-engine index` completed successfully with `warnings: <none>`, and fresh `dh-engine status` reported `status: Completed` and `last_error: <none>`. The target failure string `insert imports for packages/opencode-app/src/workflows/run-lane-command.ts` and `UNIQUE constraint failed: imports.id` did not appear in the final status verification.

One full-workspace Rust test command failed only on the known unrelated transient `runtime_launch::tests::launchable_when_platform_runtime_entry_and_manifest_match`; the targeted rerun of that exact test passed. QA classifies that as a non-blocking unrelated flake for this hotfix.

## Tool Evidence

- rule-scan: 0 findings on 3 changed files via Semgrep CLI substitute; direct `tool.rule-scan` invocation was unavailable/not surfaced in this session. Artifact: `qa-release-index-imports-failure-rule-scan-2026-04-27.json`.
- security-scan: 0 findings on 3 changed files via Semgrep `p/security-audit` CLI substitute; direct `tool.security-scan` invocation was unavailable/not surfaced in this session. Artifact: `qa-release-index-imports-failure-security-scan-2026-04-27.json`.
- evidence-capture: 5 records written: `qa-riif-targeted-parser-indexer-storage-tests-2026-04-27`, `qa-riif-workspace-tests-runtime-launch-classification-2026-04-27`, `qa-riif-index-status-smoke-2026-04-27`, `qa-riif-semgrep-substitute-scans-2026-04-27`, `qa-riif-structural-fallback-and-artifact-preservation-2026-04-27`.
- syntax-outline: attempted on 3 changed Rust files; unavailable because the runtime resolved paths under `/Users/duypham/Code/DH/{cwd}` and returned `missing-file`/`invalid-path`. Fallback structural verification used changed-file diff, built-in content search line references, and git status.

## Evidence

| Validation | Command / Evidence | Exit | Result |
| --- | --- | ---: | --- |
| Parser regression | `cargo test -p dh-parser --test typescript_adapter` from `rust-engine/` | 0 | Passed: 7 tests, including `extract_imports_deduplicates_run_lane_command_import_ids` and `symbol_signatures_truncate_without_splitting_unicode_scalars`. |
| Indexer integration | `cargo test -p dh-indexer --test integration_test` from `rust-engine/` | 0 | Passed: 9 tests, including `indexer_persists_run_lane_command_imports_without_duplicate_ids`. Existing `dh-storage` dead-code warning only. |
| Parser/indexer/storage regression | `cargo test -p dh-indexer -p dh-parser -p dh-storage` from `rust-engine/` | 0 | Passed all package suites: indexer integration, parser parity/multi-language/TypeScript adapter tests, storage unit tests, and doc tests. Existing `dh-storage` dead-code warning only. |
| Full Rust workspace | `cargo test --workspace --manifest-path rust-engine/Cargo.toml` from repo root | 101 | Non-blocking failure: 51 passed, 1 failed in `runtime_launch::tests::launchable_when_platform_runtime_entry_and_manifest_match`; this matches the reviewer-noted unrelated transient failure class. |
| Targeted flake rerun | `cargo test -p dh-engine --bin dh-engine runtime_launch::tests::launchable_when_platform_runtime_entry_and_manifest_match` from `rust-engine/` | 0 | Passed: 1 test, 51 filtered out. Classified as transient unrelated runtime-launch flake, not an index/import hotfix failure. |
| Workspace index smoke | `cargo run -p dh-engine -- index --workspace /Users/duypham/Code/DH` from `rust-engine/` | 0 | Passed: `index complete`; database `/Users/duypham/Code/DH/dh-index.db`; scanned 313 files; changed/reindexed/deleted 0; `warnings: <none>`. |
| Workspace status smoke | `cargo run -p dh-engine -- status --workspace /Users/duypham/Code/DH` from `rust-engine/` | 0 | Passed: `status: Completed`, `dirty_files: 0`, `last_error: <none>`. Status also reported `freshness_condition: not_current` with `degraded_partial=2` and `not_current=10`, but acceptance requires non-failed status and no stale import insertion error. |
| Failure-string confirmation | `cargo run -p dh-engine -- status --workspace /Users/duypham/Code/DH | rg "insert imports for packages/opencode-app/src/workflows/run-lane-command.ts|UNIQUE constraint|last_error|status:"` | 0 | Output contained only `status: Completed` and `last_error: <none>` for the searched status/error fields; no target insert-imports path and no UNIQUE constraint string appeared. |
| Quality scan substitute | `npx --no-install semgrep --config p/ci --json --output qa-release-index-imports-failure-rule-scan-2026-04-27.json rust-engine/crates/dh-parser/src/adapters/typescript.rs rust-engine/crates/dh-parser/tests/typescript_adapter.rs rust-engine/crates/dh-indexer/tests/integration_test.rs` | 0 | Passed: 0 findings, 0 blocking findings, 3 targets scanned. |
| Security scan substitute | `npx --no-install semgrep --config p/security-audit --json --output qa-release-index-imports-failure-security-scan-2026-04-27.json rust-engine/crates/dh-parser/src/adapters/typescript.rs rust-engine/crates/dh-parser/tests/typescript_adapter.rs rust-engine/crates/dh-indexer/tests/integration_test.rs` | 0 | Passed: 0 findings, 0 blocking findings, 3 targets scanned. |
| Structural fallback | `tool.syntax-outline` attempts, `git status`, `git diff`, built-in content search | n/a | Confirmed changed implementation surface contains `sort_and_dedupe_imports` / `same_import_extraction_artifact`; parser test contains `extract_imports_deduplicates_run_lane_command_import_ids`; indexer test contains `indexer_persists_run_lane_command_imports_without_duplicate_ids`. |

## Acceptance Mapping

| AC | QA Result | Evidence |
| --- | --- | --- |
| AC1 failure path identified | Pass | Scope and implementation evidence identify the failing path as duplicate import insertion for `packages/opencode-app/src/workflows/run-lane-command.ts`; parser and indexer regression tests use that affected source fixture. |
| AC2 fix is scoped to import insertion failure path | Pass | Git diff shows implementation changes limited to TypeScript parser import dedupe and targeted parser/indexer tests. No `dh-storage` ignore/schema change was introduced, and `packages/opencode-app/src/workflows/run-lane-command.ts` was not edited. |
| AC3 `dh index` completes without target import insertion failure | Pass | `cargo run -p dh-engine -- index --workspace /Users/duypham/Code/DH` exited 0 with `index complete` and `warnings: <none>`. |
| AC4 `dh status` is clean/non-failed with no stale target error | Pass | `cargo run -p dh-engine -- status --workspace /Users/duypham/Code/DH` exited 0 with `status: Completed` and `last_error: <none>`; searched output did not include target insert-imports path or UNIQUE constraint string. |
| AC5 release/local artifacts preserved | Pass | QA did not delete raw Semgrep JSON, `{cwd}`, `.opencode`, generated state, or release evidence. New QA Semgrep JSON artifacts were created and preserved. |
| AC6 hotfix remains separate from first-run docs/release publishing | Pass | QA performed validation/reporting only. No commit, push, tag, publish, release promotion, or first-run documentation work was performed. |

## Behavior Impact

- Passed: TypeScript parser extraction no longer emits duplicate import primary-key IDs for the affected `run-lane-command.ts` import shape before indexer/storage persistence.
- Passed: Indexer integration persists the affected import shape and verifies duplicate IDs are absent while representative concrete and type-only imports remain present.
- Passed: Repository-level `dh-engine index` and `dh-engine status` no longer show the release-blocking import insertion failure.
- Non-blocking observation: full workspace tests still expose the known unrelated runtime-launch transient failure, but targeted rerun passed and the failure is outside the parser/indexer/storage import insertion path.
- Non-blocking observation: `dh status` reported `freshness_condition: not_current` while still reporting `status: Completed`, `dirty_files: 0`, and `last_error: <none>`; this does not violate the scoped acceptance criteria for the import insertion failure.

## Issue List

None.

No QA issue is opened for the runtime-launch test because the full-workspace failure is the reviewer-noted unrelated transient and the targeted rerun passed. No QA issue is opened for `freshness_condition: not_current` because the scoped release-blocking symptom is absent and `last_error` is clean.

## Recommended Route

Route to `MasterOrchestrator` for `qa_to_done` closure on `RELEASE-INDEX-IMPORTS-FAILURE`.

Do not commit, push, tag, publish, or delete protected local/release artifacts from QA.

## Verification Record(s)

- issue_type: none
  severity: none
  rooted_in: none
  evidence: Parser, indexer, parser/indexer/storage, index smoke, status smoke, Semgrep quality substitute, and Semgrep security substitute validations passed; full workspace test had one known unrelated runtime-launch transient with targeted rerun passing.
  behavior_impact: The repository no longer reports the release-blocking index/import insertion failure for `packages/opencode-app/src/workflows/run-lane-command.ts`; final status reports `status: Completed` and `last_error: <none>`.
  route: `full_done` via `MasterOrchestrator` `qa_to_done` gate.
