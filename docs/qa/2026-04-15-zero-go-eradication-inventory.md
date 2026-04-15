# ZERO-GO-ERADICATION — Final Trace Classification Inventory

Date: 2026-04-15  
Work item: ZERO-GO-ERADICATION  
Task: TASK-ZERO-GO

## Classification Summary

### Remove
- `packages/opencode-core/**` (entire Go package tree retired from active package space)
- `packages/opencode-core/go.mod`
- `packages/opencode-core/go.sum`
- Go-specific ignore entries in `.gitignore` (`packages/opencode-core/dist/`, `packages/opencode-core/dh`, generated clibundle path under opencode-core)

### Replace
- `scripts/build-cli-bundle.sh`
  - Output path moved from `packages/opencode-core/internal/clibundle/cli-bundle.mjs` to `dist/cli-bundle/cli-bundle.mjs`
- `packages/opencode-app/src/executor/hook-enforcer.ts`
  - Go runtime wording replaced with neutral runtime-hook wording
- `packages/opencode-sdk/src/types/session.ts`
  - Go-specific sqlite reader wording reframed as legacy reader wording
- `packages/storage/src/sqlite/repositories/hook-invocation-logs-repo.ts`
  - Go runtime wording replaced with runtime hook handler wording
- `packages/intelligence/src/workspace/detect-projects.ts`
  - workspace marker detection switched from `go.mod` to `Cargo.toml`
  - workspace type switched from `go` to `rust`
- `packages/intelligence/src/workspace/detect-projects.test.ts`
  - marker fixtures switched from `go.mod` to `Cargo.toml`
- `packages/shared/src/types/indexing.ts`
  - marker shape changed from `hasGoMod` to `hasCargoToml`
- `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - marker checks/messages switched from `go.mod` to `Cargo.toml`

### Archive-only
- `docs/archive/operations/upstream-sync-checklist.md`
- `docs/archive/operations/openkit-reuse-runtime-integration-runbook.md`
- Architecture references updated to point at archive paths:
  - `docs/architecture/openkit-reuse-dh-runtime-integration-checklist.md`
  - `docs/architecture/opencode-upstream-update-plan.md`
- Historical architecture docs that retain Go-era framing are explicitly marked archive-only:
  - `docs/project-architecture.md`
  - `docs/structure.md`

## Active Reference Audit Targets

Confirmed for active-surface cleanup focus:
- `packages/opencode-core` active references removed from scripts/workflows/context-core/AGENTS surfaces
- `go.mod`/`go.sum` as active supported-path signals removed from TypeScript runtime/workspace checks
- retained Go references moved or framed as archive-only where kept for provenance
