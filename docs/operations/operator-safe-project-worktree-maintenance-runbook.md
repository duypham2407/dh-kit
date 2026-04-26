# Runbook: Operator-safe project/worktree maintenance (DH)

**Date:** 2026-04-13  
**Status:** active

## Purpose

Maintain hygiene for bounded operator-safe artifacts created under:

- `.dh/runtime/operator-safe-worktree/reports/`
- `.dh/runtime/operator-safe-worktree/snapshots/`
- `.dh/runtime/operator-safe-worktree/temp/`

## Maintenance cadence

- Daily for active repositories with frequent indexing/debug operations.
- Weekly for low-activity repositories.

## Standard maintenance flow

1. Collect inventory through the operator surface:
   - `dh operator-safe-maintenance list --family all`
2. Inspect concrete artifacts before delete actions:
   - `dh operator-safe-maintenance inspect --family report --id <report-id>`
   - `dh operator-safe-maintenance inspect --family snapshot --id <snapshot-id>`
   - `dh operator-safe-maintenance inspect --family temp --id <temp-id>`
3. Run policy prune in dry-run first, then apply when output is acceptable:
   - `dh operator-safe-maintenance prune --mode dry-run`
   - `dh operator-safe-maintenance prune --mode apply`
4. Run targeted cleanup for degraded/orphan residue only:
   - `dh operator-safe-maintenance cleanup --mode dry-run --report <report-id>`
   - `dh operator-safe-maintenance cleanup --mode apply --report <report-id>`
   - `dh operator-safe-maintenance cleanup --mode dry-run --family temp --id <temp-id>`
5. Re-run one bounded flow (`index_workspace`) and verify new report/snapshot/temp artifacts are generated.

## Default policy recommendations

- Reports retention: 7 days
- Snapshots retention: 3 days
- Temp workspaces retention: 24 hours

## Failure/degraded handling

- If report outcome is `rollback_degraded`, treat as bounded recovery warning and ensure stale temp artifacts are removed.
- If preflight is blocked repeatedly, use `recommendedAction` from the report and adjust operation target before retry.

## Refusal and truth-boundary notes

- `prune` removes only policy-eligible artifacts under operator-safe roots and reports retained/skipped reasoning.
- `cleanup` is targeted only (`--report` or explicit `--family/--id`) and refuses unproven cleanup requests.
- `dh doctor --debug-dump` is a secondary summary surface and pointer only; canonical maintenance truth remains `dh operator-safe-maintenance` over live artifacts.
- Workflow-stage/approval state is out of scope for maintenance eligibility and must not be treated as artifact cleanup truth.

## Anti-drift guardrail

This runbook supports the bounded operator-safe lifecycle only. It does **not** introduce branch/worktree platform operations and must not be expanded toward VCS parity behavior.
