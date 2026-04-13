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

1. Collect current artifact inventory with runtime helper:
   - `listOperatorSafeArtifacts(repoRoot)`
2. Inspect recent execution reports to confirm outcome/failure trends.
3. Prune stale artifacts with policy TTL:
   - `pruneOperatorSafeArtifacts({ repoRoot, olderThanMs })`
4. Re-run one bounded flow (`index_workspace`) and verify new report/snapshot generation.

## Default policy recommendations

- Reports retention: 7 days
- Snapshots retention: 3 days
- Temp workspaces retention: 24 hours

## Failure/degraded handling

- If report outcome is `rollback_degraded`, treat as bounded recovery warning and ensure stale temp artifacts are removed.
- If preflight is blocked repeatedly, use `recommendedAction` from the report and adjust operation target before retry.

## Anti-drift guardrail

This runbook supports the bounded operator-safe lifecycle only. It does **not** introduce branch/worktree platform operations and must not be expanded toward VCS parity behavior.
