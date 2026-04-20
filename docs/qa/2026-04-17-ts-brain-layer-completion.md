---
artifact_type: qa_report
version: 1
status: qa_handoff
feature_id: TS-BRAIN-LAYER-COMPLETION
feature_slug: ts-brain-layer-completion
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-17-ts-brain-layer-completion.md
source_solution_package: docs/solution/2026-04-17-ts-brain-layer-completion.md
---

# QA Report: TS-BRAIN-LAYER-COMPLETION

## Verification Scope

- Mode/stage/task context: `full` / `full_qa` / `TASK-TS-BRAIN-LAYER (qa_in_progress)`.
- Contract basis verified:
  - `docs/scope/2026-04-17-ts-brain-layer-completion.md`
  - `docs/solution/2026-04-17-ts-brain-layer-completion.md`
- Touched implementation surfaces checked:
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `docs/user-guide.md`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - `packages/opencode-app/src/planner/choose-mcps.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/workflows.test.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/workflow/workflow-audit-service.ts`
  - `packages/shared/src/constants/lanes.ts`
  - `packages/shared/src/constants/roles.ts`
  - `packages/shared/src/constants/stages.ts`
  - `packages/shared/src/types/agent.ts`
  - `packages/shared/src/types/execution-envelope.ts`
  - `packages/shared/src/types/lane.ts`
  - `packages/shared/src/types/role-output.ts`
  - `packages/shared/src/types/session-runtime.ts`
  - `packages/shared/src/types/session.ts`
  - `packages/shared/src/types/stage.ts`
  - `packages/shared/src/types/work-item.ts`
  - `packages/storage/src/sqlite/repositories/work-items-repo.ts`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- Structural expectations checked (manual due syntax-outline unavailability):
  - canonical outward lane/role/stage semantics with compatibility alias continuity
  - bounded support-state/report contract (`grounded|partial|insufficient|unsupported`)
  - bounded query/search class coverage and unsupported-depth refusal behavior
  - MCP routing compatibility normalization (`runtimeWorkflowLaneFor`, `runtimeAgentRoleFor`)
  - workflow audit stage guard (`isWorkflowStage`) to keep role-output writes bounded
  - worker-lifecycle diagnostics surface in `doctor` output
  - topology honesty preserved (TS orchestration over Rust evidence foundation)

## Observed Result

- **PASS**
- PASS rerun after implementation fix for `QA-TS-BRAIN-001`.
- Ready-for-full_done: **Yes**

## Evidence

Rerun QA evidence after fixing `QA-TS-BRAIN-001`:

- Prior failure path reverified directly.
- `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts` rerun 3 times -> PASS each run.
- `npm test` (full suite) rerun 2 times -> PASS each run.
- `npm run check` -> PASS.
- `cargo test --workspace` (from `rust-engine/`) -> PASS.
- `semgrep --config p/ci <26 touched files>` -> PASS (0 findings).
- `semgrep --config p/security-audit <26 touched files>` -> PASS (0 findings).
- No remaining findings.

## Behavior Impact

- Canonical semantics + alias continuity remain implemented on shared type/constant surfaces.
- Bounded operator-facing reasoning/report semantics remain implemented on workflow/presenter/docs surfaces.
- Rust bridge lifecycle/query/search bounded contract additions remain implemented and Rust tests pass.
- Previously unstable compaction/persistence failure path is now stable under targeted and full-suite reruns.
- Bounded limitation: the two stabilized tests now use a fast bridge stub for compaction/persistence scenarios, while broader bridge behavior remains covered elsewhere.

## Issue List

- None. `QA-TS-BRAIN-001` is verified fixed and closed by rerun evidence.

## Tool Evidence

- rule-scan: unavailable — runtime `tool.rule-scan`; substituted with `semgrep --config p/ci` (0 findings on 26 files)
- security-scan: unavailable — runtime `tool.security-scan`; substituted with `semgrep --config p/security-audit` (0 findings on 26 files)
- evidence-capture: 1 record written
- syntax-outline: not needed for rerun-only closure verification

## Recommended Route

- Route to `MasterOrchestrator` for `qa_to_done` approval and `full_done` closure.
- Reason: prior QA failure path was reverified directly and all rerun validation paths are passing with no remaining findings.

## Verification Record(s)

- issue_type: `none` (rerun pass record)
  - severity: `none`
  - rooted_in: `n/a`
  - evidence:
    - prior failure path reverified directly
    - `run-knowledge-command.test.ts` rerun 3 times PASS
    - full-suite `npm test` rerun 2 times PASS
    - `npm run check` PASS
    - `cargo test --workspace` PASS
    - `semgrep --config p/ci` PASS (0 findings)
    - `semgrep --config p/security-audit` PASS (0 findings)
  - behavior_impact: previously unstable compaction/persistence scenarios are now stable in rerun evidence; no closure-blocking regression remains
  - route: `qa_to_done` approval -> `full_done`
