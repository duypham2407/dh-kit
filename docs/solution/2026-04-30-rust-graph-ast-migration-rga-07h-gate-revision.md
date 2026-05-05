---
artifact_type: solution_gate_decision
version: 1
status: rga_08_unblocked_for_cleanup_implementation
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
task_id: RGA-07H
source_scope_package: docs/scope/2026-04-30-rust-graph-ast-migration.md
source_solution_package: docs/solution/2026-04-30-rust-graph-ast-migration.md
source_parity_report: docs/solution/2026-04-30-rust-graph-ast-migration-rga-07g-official-parity.md
owner: SolutionLead
generated_at: 2026-05-02
validation_surface: documentation + compatibility_runtime
---

# RGA-07H Gate Revision: Rust Golden-Fixture Deletion Gate

## Recommended path

Replace the old TypeScript aggregate-count parity deletion gate with a Rust-owned golden/critical fixture acceptance gate. This is enough because the Product Lead scope package now records user approval for the change, and RGA-07G classified the aggregate parity failures as mostly legacy TS baseline weakness/model non-equivalence rather than confirmed Rust defects.

This artifact does **not** implement production code, does **not** delete TypeScript graph code, and does **not** bypass code review or QA. It only revises the technical deletion gate that determines whether RGA-08 cleanup implementation may start.

## Upstream decision context

- Product scope package: `docs/scope/2026-04-30-rust-graph-ast-migration.md`, version 2, `handoff_status: pass`.
- User-approved gate change in scope: legacy TS aggregate count parity is no longer a hard delete gate because the TS baseline is not model-equivalent with the Rust graph.
- RGA-07G/RGA-07G-R evidence: coverage improved to 345/345 Rust JS-like files, but aggregate counts miss old thresholds and are classified as baseline/model-equivalence deltas plus missing identity-level parity tooling, not confirmed Rust bugs.

## Gate being replaced

The old hard gate required normalized TS-vs-Rust aggregate parity thresholds:

- symbols >= 99%;
- imports/dependencies including cross-root >= 99%;
- calls/references >= 95%;
- identity-level gap triage when available.

RGA-07G showed that this gate is not an honest deletion blocker for this migration because the legacy TypeScript extractor and Rust graph do not emit equivalent fact models. The old aggregate threshold remains useful as diagnostic/context evidence, but it must not block RGA-08 by itself unless the delta classification identifies an actual Rust correctness bug or an untriaged critical behavior miss.

## Replacement deletion gate

RGA-08 cleanup implementation may proceed only when these replacement conditions are true and inspectable:

1. **Rust golden/critical fixtures pass 100%.**
   - Current evidence: `cargo test -p dh-indexer --test parity_harness_test` passed 5/5 critical fixtures in RGA-07/RGA-07G evidence.
   - If RGA-08 or any late fix changes Rust graph facts, fixture evidence must be refreshed before code review/QA closure.

2. **Production consumer audit is clean.**
   - Current evidence: RGA-06C/RGA-07 audit found no direct legacy TS graph extraction or `GraphRepo` production imports in `packages/runtime`, `packages/retrieval`, or `packages/opencode-app`.
   - Remaining legacy TS graph implementation/tests/benchmarks, `GraphRepo`, and legacy schema references are RGA-08 cleanup targets, not production consumer blockers.

3. **Targeted Cargo and npm validation passed for changed surfaces.**
   - Cargo evidence exists for parser resolver, indexer linker/integration, graph, query, engine bridge/capability surfaces, plus the RGA-07F correctness fix.
   - Targeted npm evidence exists for opencode-app bridge/host client, retrieval, telemetry, runtime index-job, selector/adapter surfaces.
   - RGA-08 must re-verify the command reality and run targeted validation for the cleanup diff; OpenKit workflow/runtime checks do not replace app-native Cargo/npm evidence.

4. **Performance evidence exists with caveats recorded.**
   - Payload and Node event-loop measured subsets pass (`payload p95/max=15,171 bytes`; event-loop p95 `11.231 ms`, max `24.150 ms`).
   - `buildEvidence` measured subset passes (`p95=529.007 ms`).
   - Hydrate p95 is measurable and passes the measured degraded subset (`p95=463.391 ms`) with freshness/corpus caveats.
   - Incremental performance passes the measured subset after RGA-07F work (`1-file p95=287 ms`, `10-file p95=1,831 ms`) and RGA-07F-DBG recorded the edge-preservation correctness fix validation.
   - Caveats remain: DH/OpenKit corpus is below the 3,000-file target; measurements are bounded/measured subsets; debug-profile and small-sample limitations remain; memory evidence is process-level rather than allocator-profile proof; no clean full TS baseline ratio is required under the revised gate.

5. **RGA-07G aggregate deltas are documented and non-blocking unless they reveal a Rust bug.**
   - Current failed aggregate metrics are classified as legacy TS baseline/model non-equivalence and identity-tooling limitations.
   - Any future evidence of a Rust extractor/resolver/linker/storage/query bug, critical fixture miss, or untriaged cross-root behavior re-blocks deletion until fixed or explicitly approved by the user.

6. **Code review and QA still happen after cleanup.**
   - RGA-08 can remove legacy TS graph code/tests/benchmarks, `GraphRepo`, and legacy graph schema references only as cleanup implementation.
   - Focused post-delete code review and QA must still verify no production TS graph fallback, no `GraphRepo` writes, Rust query behavior, scan evidence, and post-delete consumer audit.

## RGA-08 unblock decision

**Decision: RGA-08 is unblocked for cleanup implementation under the revised gate.**

This means RGA-08 may proceed to implement deletion cleanup of legacy TypeScript graph surfaces. It does **not** mean the migration is complete, does **not** approve deletion evidence retroactively as QA, and does **not** allow skipping code review or QA. The old TS aggregate parity threshold is the only blocker removed by this decision.

## RGA-08 cleanup boundaries

Allowed cleanup targets:

- `packages/intelligence/src/graph/` legacy TS graph implementation/tests/benchmarks;
- `packages/storage/src/sqlite/repositories/graph-repo.ts` and GraphRepo-specific tests/exports;
- legacy graph schema references in `packages/storage/src/sqlite/db.ts` if migration-safe;
- barrels/imports/tests that exist only for the deleted TS graph path.

Required preservation rules:

- Do not resurrect production TS AST/graph extraction as fallback.
- Do not keep `GraphRepo` writes in steady state.
- If schema removal is unsafe, leave only documented read-only/no-write tombstone compatibility; no `GraphRepo` production API.
- Keep `DH_GRAPH_AST_ENGINE=ts` behavior explicit/degraded/unsupported after deletion; do not promise TS rollback execution.

## Required validations before code review and QA

Before handing RGA-08 cleanup to code review:

- Run a fresh production import audit for `packages/runtime`, `packages/retrieval`, `packages/opencode-app`, and storage exports to prove no production import from deleted TS graph paths and no `GraphRepo` writes remain.
- Run targeted npm tests for every TS package surface impacted by deletion after verifying current command reality.
- Run targeted Cargo checks/tests if cleanup touches Rust bridge/query/indexer contracts or if QA requests fresh fixture evidence.
- Run `tool.rule-scan` on changed cleanup scopes and record scan evidence with runtime-tooling caveats.

Before QA closure:

- Repeat the post-delete consumer audit.
- Run `tool.rule-scan` and `tool.security-scan` on the cleanup diff with classification summary and false-positive rationale if needed.
- Verify representative Rust-backed query behavior for dependencies, dependents, definition/usage, call hierarchy, entry points, and buildEvidence where the repository has targeted fixtures/tests.
- Re-state performance caveats rather than presenting measured subsets as large-corpus SLA proof.

## Caveats and non-goals

- This is not a silent exception: the Product Lead scope explicitly approved the gate revision.
- The RGA-07G aggregate thresholds still fail and remain documented as diagnostic context.
- The revised gate does not tolerate confirmed Rust bugs, failing critical fixtures, untriaged cross-root misses, production TS graph imports, or missing app-native validation for changed cleanup surfaces.
- TS rollback execution remains degraded/unsupported; after RGA-08, recovery is Rust/adapter fix-forward or intentional revert, not a long-running TS graph fallback.
- No production code was changed by RGA-07H.
