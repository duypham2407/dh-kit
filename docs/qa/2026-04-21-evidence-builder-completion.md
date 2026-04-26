---
artifact_type: qa_report
version: 1
status: qa_handoff
feature_id: EVIDENCE-BUILDER-COMPLETION
feature_slug: evidence-builder-completion
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-21-evidence-builder-completion.md
source_solution_package: docs/solution/2026-04-21-evidence-builder-completion.md
source_migration_reference: docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md
---

# QA Report: EVIDENCE-BUILDER-COMPLETION

## Overall Status

- **PASS**

## Verification Scope

- Mode and stage verified: `full` / `full_qa`.
- Authoritative artifacts reviewed:
  - `docs/scope/2026-04-21-evidence-builder-completion.md`
  - `docs/solution/2026-04-21-evidence-builder-completion.md`
  - `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`
- Touched implementation surfaces verified:
  - `apps/cli/src/commands/root.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `docs/user-guide.md`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/retrieval/src/query/build-evidence-packets.test.ts`
  - `packages/retrieval/src/query/build-evidence-packets.ts`
  - `packages/retrieval/src/query/run-retrieval.test.ts`
  - `packages/retrieval/src/query/run-retrieval.ts`
  - `packages/shared/src/types/evidence.ts`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-types/src/lib.rs`

## Observed Result

- PASS

## Behavior Impact

- First-wave evidence-builder completion is truthful and bounded on touched product flows.
- Broad-understanding `dh ask` now routes to canonical Rust `query.buildEvidence` and remains explicit unsupported for out-of-bounds runtime/unbounded asks.
- Rust remains canonical packet truth source on touched flows (build-evidence, call-hierarchy, trace-flow, impact-analysis), including state/gap/bound/cut-point handling.
- TypeScript remains routing/consumption/presentation and does not author competing canonical packet truth for touched flows.
- Trace/impact/call-hierarchy touched flows preserve a single canonical Rust packet story, including the rework fix that prevents file-target impact state downgrade when build-evidence is insufficient.
- Retrieval/shared TS packet builders are explicitly retained as legacy/non-authoritative on touched product paths.
- Help/docs wording is now aligned with bounded behavior and avoids overclaiming runtime/unlimited reasoning support.
- No unapproved scope expansion was observed beyond the approved first wave.

## Spec Compliance

| Acceptance Target | Result | Notes |
| --- | --- | --- |
| First-wave completion truthful and bounded | PASS | `run-knowledge-command.ts` classifier/unsupported gates and tests keep bounded classes explicit. |
| Rust canonical packet truth on touched flows | PASS | Rust bridge/query types and methods (`query.buildEvidence`, `query.callHierarchy`, `query.traceFlow`, `query.impactAnalysis`) own packet/state truth. |
| TS routing/presentation-only boundary | PASS | TS bridge/workflow consume envelopes and payloads; no canonical fallback packet assembly on touched flows. |
| Broad-understanding ask uses `query.buildEvidence` | PASS | Routed via `graph_build_evidence` and validated by workflow + bridge tests. |
| Trace/impact/call-hierarchy preserve one canonical packet story | PASS | Shared merge path + payloads and test coverage demonstrate consistent Rust packet basis. |
| Retrieval/shared TS packet builders non-authoritative | PASS | Legacy/non-authoritative annotations and tests confirm compatibility-only role. |
| Help/docs truthful and bounded | PASS | `root.ts` help and `docs/user-guide.md` reflect bounded support/unsupported edges. |
| No scope expansion beyond first wave | PASS | Changes remain within approved touched surfaces and first-wave flows. |

## Test Evidence

- `cd rust-engine && cargo test --workspace` — PASS
- `npm run check` — PASS
- `npm test` — PASS
- `semgrep --config p/ci <changed files>` — PASS (0 findings on 16 files)
- `semgrep --config p/security-audit <changed files>` — PASS (0 findings on 16 files)

Manual cross-surface truth verification performed:

- Broad-understanding ask path: classifier -> `graph_build_evidence` -> `query.buildEvidence` verified in TS workflow and bridge call mapping.
- Rust packet authority verified across build-evidence, call hierarchy, trace flow, and impact analysis surfaces.
- Rework preservation check verified: file-target impact state protection remains in place (`file_impact_state_is_not_downgraded_when_build_evidence_is_insufficient`).
- Retrieval/shared packet surfaces verified as legacy compatibility artifacts only on touched product flows.
- CLI/help/docs wording verified against bounded support and explicit unsupported boundaries.

## Tool Evidence

- rule-scan: unavailable — runtime `tool.rule-scan` not exposed; substituted with `semgrep --config p/ci` (0 findings on 16 files)
- security-scan: unavailable — runtime `tool.security-scan` not exposed; substituted with `semgrep --config p/security-audit` (0 findings on 16 files)
- evidence-capture: 4 records written
  - `qa-evidence-builder-full-validation-2026-04-21`
  - `qa-evidence-builder-tool-evidence-override-2026-04-21`
  - `qa-evidence-builder-runtime-inspection-2026-04-21`
  - `qa-evidence-builder-syntax-outline-unavailable-2026-04-21`
- syntax-outline: unavailable — runtime path resolution currently rooted at `/Users/duypham/Code/DH/{cwd}` causing invalid-path/missing-file for touched files; manual structural verification performed on touched source surfaces

## Issues

- None.

## Recommended Route

- Recommend `qa_to_done`.

## Verification Record(s)

- issue_type: `none` (QA pass)
  - severity: `none`
  - rooted_in: `n/a`
  - evidence: fresh command validation PASS + bounded cross-surface truth verification + tool evidence records
  - behavior_impact: closure-safe for approved first-wave scope
  - route: `qa_to_done`
