---
artifact_type: implementation_rollback_report
version: 1
status: rollback_rehearsal_blocked_delete_gate_blocked
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
task_id: RGA-07C
source_solution_package: docs/solution/2026-04-30-rust-graph-ast-migration.md
owner: FullstackAgent
validation_surface: runtime_tooling + documentation + compatibility_runtime
generated_at: 2026-05-01
---

# RGA-07C Rollback Report: Rollback Rehearsal and Deletion Gate Update

## Executive result

RGA-07C inspected the current runtime/config and graph/AST migration surfaces for `DH_GRAPH_AST_ENGINE=ts|rust|compat` or an equivalent rollback feature flag. No implemented runtime/config flag or equivalent `ts`/`rust`/`compat` selection path was found in production TypeScript or Rust code.

Rollback rehearsal was therefore **not attempted**. Running an unset/unread environment variable would not exercise a real rollback path, and enabling legacy TypeScript graph extraction outside a bounded baseline harness would violate the approved migration boundary. No TypeScript graph code was deleted, and RGA-08 must not start from this evidence.

Deletion gate result after RGA-07A, RGA-07B, and RGA-07C: **blocked**. Keep `RGA-07-DELETE-GATE-BLOCKED` open.

## Approved rollback gate being checked

The approved solution package defines a temporary pre-deletion rollback switch:

```text
DH_GRAPH_AST_ENGINE = "ts" | "rust" | "compat"
```

Relevant approved constraints:

- `ts` and `compat` are valid only in the pre-deletion migration window.
- `ts`/`compat` must not become a long-lived production fallback after deletion.
- RGA-08 deletion must not start before parity/performance/rollback/consumer evidence and QA delete-gate readiness.
- After RGA-08, recovery is fix-forward in Rust/adapter, intentional revert, or a user-approved follow-up decision; there is no promised TS Graph/AST fallback.

## Runtime/config inspection

### Searches and tool-assisted inspection

The following inspection paths were used for the rollback flag check:

| Surface | Tool/query | Result |
| --- | --- | --- |
| Semantic code search | Search for feature flag/runtime config selecting Graph/AST engine, TypeScript/Rust/compat fallback, and `DH_GRAPH_AST_ENGINE` | No results; semantic search degraded to keyword mode because no embedding matches were indexed. |
| Repository content search | `DH_GRAPH_AST_ENGINE`, `GRAPH_AST_ENGINE`, `GRAPH_AST`, `graphAst`, `GraphAst`, `graph.*engine`, `engine.*graph` across TS/JS/Rust/JSON/Markdown | Matches exist only in planning/evidence docs and generic graph-engine wording; no production runtime/config implementation found. |
| TypeScript structural search | `process.env.DH_GRAPH_AST_ENGINE` under `packages` | No matches. |
| TypeScript env/config search | `process.env`, `Deno.env`, `GRAPH`, `compat`, `rust bridge`, `fallback` under `packages` | Existing env usage covers unrelated keys such as `OPENAI_API_KEY`, model flags, and embedding/model config. No Graph/AST engine selector was found. |
| Rust env/config search | `std::env::var`, `env::var`, `DH_`, `GRAPH`, `compat`, fallback terms under `rust-engine` | Existing env usage covers embedding config and process/current-dir behavior. No `DH_GRAPH_AST_ENGINE` or equivalent selector was found. |
| Runtime adapter outline | `packages/runtime/src/jobs/rust-index-graph-report-adapter.ts` | Adapter returns `degraded_unavailable_adapter` with reason `rust_indexer_report_not_available_at_runtime_job_boundary`; it is not a `ts`/`rust`/`compat` engine selector. |
| Retrieval adapter outline | `packages/retrieval/src/query/dependency-edge-adapter.ts` | Adapter returns `degraded_unavailable_adapter` with reason `rust_bridge_api_not_available_at_retrieval_boundary`; it is not a rollback switch. |
| Shared flag mock | `packages/shared/src/core-mocks/flag/flag.ts` | Contains only model/log/output-token flags; no Graph/AST engine flag. |

### Inspection conclusion

No supported rollback switch exists today. Existing labels such as `legacy_ts_host_bridge_compatibility_only` describe a bounded compatibility/reporting seam around the Rust bridge and do not route production Graph/AST extraction back through legacy TypeScript graph code. Existing RGA-06 adapters intentionally report unavailable/degraded Rust-boundary state rather than invoking legacy TS graph extraction.

## Rollback rehearsal result

Rollback rehearsal status: **blocked / unsupported**.

No rehearsal was run because all of these are true:

1. No code path was found that reads `DH_GRAPH_AST_ENGINE` or maps `ts|rust|compat` to Graph/AST execution behavior.
2. No equivalent runtime/config field was found that can safely switch production Graph/AST ownership between TypeScript and Rust.
3. RGA-06A/RGA-06B replaced production TS graph extraction imports with explicit Rust-boundary/degraded adapters; they do not provide a TS fallback to rehearse.
4. Re-running legacy TypeScript `GraphIndexer` as production rollback would re-enable the very TS graph extraction path the migration is removing. That is not allowed outside a non-production baseline harness.
5. Running a command with `DH_GRAPH_AST_ENGINE=ts`, `DH_GRAPH_AST_ENGINE=rust`, or `DH_GRAPH_AST_ENGINE=compat` would be a no-op with respect to Graph/AST ownership and would create false pass evidence.

What was safely documented instead:

- RGA-07A used legacy TypeScript graph tooling only through an env-gated, non-production baseline test artifact under `docs/solution/`; that is baseline evidence, not rollback rehearsal.
- RGA-07B measured Rust bridge/query/index behavior through non-production metrics tooling and temp-copy mutation for incremental checks; that is metrics evidence, not rollback rehearsal.
- RGA-07C records the missing rollback switch as a deletion-gate blocker.

## Deletion gate summary after RGA-07A/RGA-07B/RGA-07C

### RGA-07A parity and TS baseline evidence

RGA-07A artifacts:

- `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07a-parity-report.md`
- `docs/solution/rga-07a-baseline-tool.test.ts`
- `docs/solution/rga-07a-ts-baseline.json`
- `docs/solution/rga-07a-rust-parity-command.json`
- `docs/solution/rga-07a-rust-index-counts.json`
- `docs/solution/rga-07a-normalized-parity.json`

Gate impact:

| Gate | RGA-07A result | Delete-gate impact |
| --- | --- | --- |
| Official TS baseline coverage | Legacy TS baseline covered 35 files while Rust index covered 348 files. | Blocked. |
| Common-file coverage | 29 common files, 8.333% common-over-Rust coverage. | Blocked. |
| Rust parity CLI | Produced degraded one-case curated fixture output, not full official-corpus parity. | Blocked. |
| Symbol parity threshold | Common-file count-level parity was 70.968%, and not gate-eligible. | Blocked. |
| Import/dependency parity threshold | Common-file count-level parity was 0.820%, and not gate-eligible. | Blocked. |
| Call/reference parity threshold | Calls 75.000%, references 4.177%, count-level only and not gate-eligible. | Blocked. |
| Identity-level gap triage | Not available. | Blocked. |

RGA-07A completed useful evidence generation, but it does not satisfy the approved official-corpus parity thresholds.

### RGA-07B payload, event-loop, memory, incremental, hydrate, and buildEvidence evidence

RGA-07B artifacts:

- `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07b-metrics-report.md`
- `docs/solution/rga-07b-measurement-summary.json`
- `docs/solution/rga-07b-incremental-metrics.json`
- `docs/solution/rga-07b-bridge-query-metrics.json`
- `docs/solution/rga-07b-official-index-memory.json`
- `docs/solution/rga-07b-official-warm-index-benchmark.json`
- `docs/solution/rga-07b-tooling-inspection.json`
- `docs/solution/rga-07b-metrics-tool.test.ts`

Gate impact:

| Gate | RGA-07B result | Delete-gate impact |
| --- | --- | --- |
| Payload p95 ≤ 256 KB and max ≤ 1 MB | Measured subset pass: p95 15,171 bytes, max 15,171 bytes. | Partial positive evidence only. |
| Node event-loop p95 ≤ 20 ms and max ≤ 100 ms | Measured subset pass: p95 11.231 ms, max 24.150 ms. | Partial positive evidence only. |
| Bridge/query memory | Measured Rust bridge RSS peak 289,161,216 bytes; warm-index wrapper RSS peak 200,638,464 bytes. | Partial positive evidence; no TS memory comparison. |
| Changed 1-file incremental p95 ≤ 500 ms | Measured failure: engine p95 3,098 ms. | Blocks deletion. |
| Changed 10-file incremental p95 ≤ 2 s | Measured failure: engine p95 4,935 ms. | Blocks deletion. |
| Hydrate p95 ≤ 2 s | Not instrumented in current CLI/benchmark JSON. | Blocks deletion. |
| buildEvidence p95 ≤ 1,000 ms | Measured subset pass: p95 529.007 ms. | Partial positive evidence only. |
| TS baseline comparison for Rust full index+link+hydrate ≤ 80% TS baseline | Still blocked by RGA-07A partial baseline. | Blocks deletion. |
| Official warm no-change index | Degraded because changed files were observed. | Does not unblock deletion. |

RGA-07B completed useful measurement evidence, but changed incremental performance fails, hydrate p95 remains unavailable, and TS baseline comparison remains blocked.

### RGA-07C rollback evidence

RGA-07C result:

| Gate | RGA-07C result | Delete-gate impact |
| --- | --- | --- |
| Implemented `DH_GRAPH_AST_ENGINE=ts|rust|compat` switch | Not found. | Blocks deletion. |
| Equivalent production rollback feature flag | Not found. | Blocks deletion. |
| Safe pre-deletion rollback rehearsal | Not attempted because unsupported. | Blocks deletion. |
| No post-delete fallback promise | Preserved; report explicitly does not create or promise a long-lived TS fallback. | Required constraint preserved. |
| TS graph deletion | Not performed. | Required constraint preserved for RGA-07C. |

## Remaining deletion gate blockers

RGA-08 remains blocked by these unresolved items:

1. Official-corpus parity is not gate-eligible: TS baseline coverage is partial, Rust parity CLI is fixture-scoped/degraded, and identity-level symbol/import/call/reference gap triage is unavailable.
2. Required parity thresholds are not proven: symbols ≥ 99%, imports/dependencies including cross-root ≥ 99%, calls/references ≥ 95% with all gaps triaged.
3. TS baseline comparison for `Rust full index+link+hydrate ≤ 80% TS baseline` is unavailable.
4. Changed 1-file incremental p95 fails the approved ≤ 500 ms budget.
5. Changed 10-file incremental p95 fails the approved ≤ 2 s budget.
6. Hydrate p95 is not instrumented/exposed through the current benchmark artifacts.
7. Memory evidence lacks TS baseline comparison and allocator-level profile; current RSS measurements are partial positive evidence only.
8. Payload and event-loop evidence are measured-subset passes only, not end-to-end UI/runtime coverage.
9. Rollback switch `DH_GRAPH_AST_ENGINE=ts|rust|compat` or equivalent is not implemented.
10. Safe rollback rehearsal is unavailable until the rollback switch exists or the user explicitly approves a documented exception.
11. `RGA-07-DELETE-GATE-BLOCKED` remains open, and `RGA-08` must not start deletion work.

## Issue and task-board direction

- Keep `RGA-07-DELETE-GATE-BLOCKED` open.
- Do not start `RGA-08`.
- `RGA-07C` may be marked `dev_done` as an evidence/report task because it completed the required inspection and recorded the rollback blocker honestly.
- The feature/work item remains blocked for deletion until the blockers above are resolved or the user explicitly approves exceptions.

## Scan/tool evidence

OpenKit `tool.rule-scan` was run directly on the RGA-07C rollback report.

| Scope | Direct tool status | Result | Caveat |
| --- | --- | --- | --- |
| `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07c-rollback-report.md` | available | succeeded, 0 findings | Semgrep reported 0 targets scanned for Markdown, so this is direct runtime-tooling availability/finding evidence, not Cargo/npm validation or rollback rehearsal evidence. |

Classification summary: `blocking=0`, `true_positive=0`, `non_blocking_noise=0`, `false_positive=0`, `follow_up=0`, `unclassified=0`.

OpenKit rule-scan is `runtime_tooling` evidence and does not replace Cargo/npm `target_project_app` validation. No app-native command can prove rollback behavior because the rollback flag/selector is not implemented.

## RGA-07C conclusion

RGA-07C is complete as a rollback-rehearsal report. The rollback rehearsal itself is blocked because no implemented flag or equivalent engine selection seam exists. The deletion gate remains blocked; do not delete TS graph code or start RGA-08 from this evidence.
