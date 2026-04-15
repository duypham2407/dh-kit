---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: ZERO-GO-ERADICATION
feature_slug: zero-go-eradication
source_scope_package: docs/scope/2026-04-15-zero-go-eradication.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Zero Go Eradication

## Chosen Approach
- Remove remaining active Go code and Go-facing residue in a phased cleanup that preserves the supported Rust + TypeScript path and avoids broad architecture drift.
- First classify every remaining Go trace as `remove`, `replace`, or `archive-only`, then cut active references over to the existing Rust + TypeScript path, then retire `packages/opencode-core/` as a single unit.
- Preserve history through existing artifacts, git history, and optional archive notes rather than by retaining a live Go package tree in active repository locations.

## Impacted Surfaces
- Active Go tree: `packages/opencode-core/**`
- Release/install scripts: `scripts/build-cli-bundle.sh`, `scripts/package-release.sh`, `scripts/verify-release-artifacts.sh`, `scripts/test-installers.sh`, install/upgrade/uninstall scripts
- CI/release workflows: `.github/workflows/ci.yml`, `.github/workflows/release-and-smoke.yml`, `.github/workflows/nightly-smoke.yml`
- Active docs and maintainer guidance: `README.md`, `AGENTS.md`, `context/core/*.md`, relevant `docs/operations/**`
- TS comments/messages and compatibility wording that still imply Go ownership:
  - `packages/opencode-app/src/executor/hook-enforcer.ts`
  - `packages/opencode-sdk/src/types/session.ts`
  - `packages/storage/src/sqlite/repositories/hook-invocation-logs-repo.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`

## Boundaries And Components
### Remove
- `packages/opencode-core/**` as an active repository surface, including Go module files, source, tests, and built artifacts under that tree.
- Script and workflow coupling that still reads from or writes into `packages/opencode-core/**`.
- Active docs, metadata, and guidance that present Go as current, supported, required, fallback, or compatibility runtime.

### Replace
- TS comments, messages, and docs that describe current behavior in Go terms when the supported path is now Rust + TypeScript.
- Safety or workspace detection wording that treats `go.mod` as an active supported-path signal rather than a generic project marker.
- Any active references to Go-based packaging, hook bridging, or sqlite readers with neutral or current-owner wording where the behavior still exists conceptually.

### Archive-only
- Historical migration rationale already under `docs/scope/`, `docs/solution/`, and `docs/qa/` may remain only if clearly non-active.
- If provenance from `packages/opencode-core/` needs a visible note, replace the live tree with an archive note pointing to git history or `docs/archive/`; do not retain the full Go implementation in active package space.

## Interfaces And Data Contracts
- The supported operator/release/runtime contract remains Rust + TypeScript only.
- Active install, run, doctor, upgrade, uninstall, release verification, and workflow guidance must not imply Go support.
- Historical Go references may remain only when they are clearly framed as archival and do not describe present support.
- `packages/opencode-core/` retirement must not remove any still-supported Rust + TypeScript artifact, script, or documented lifecycle behavior.

## Risks And Trade-offs
- Hidden dependency risk: scripts, workflows, or docs may still reference `packages/opencode-core/` indirectly after obvious Go files are removed.
- Truthfulness risk: deleting Go code before updating active guidance can leave the repo in a state where history and current support boundaries are ambiguous.
- Drift risk: broad cleanup outside active Go confusion could expand into unrelated Rust/TS refactors.
- Archive-boundary risk: keeping too much historical Go material in active locations will continue to signal support.
- Parallel execution risk is high because script, workflow, doc, and package retirement changes all touch the same support contract.

## Recommended Path
- Build one explicit inventory of remaining Go traces and classify each surface as `remove`, `replace`, or `archive-only`.
- Remove active script/workflow/config/doc coupling to `packages/opencode-core/` before deleting that tree.
- Retire `packages/opencode-core/` only after no active supported surface depends on it.
- Keep historical context through archive framing and git history, not through a live Go package path.

## Implementation Slices
### Slice 1: Final Go trace classification
- **Goal:** produce the execution contract for what must be removed, what must be rewritten, and what may remain as archive-only history.
- **Primary files/surfaces:** `packages/opencode-core/**`, `.github/workflows/*`, `scripts/*`, `README.md`, `AGENTS.md`, `context/core/**`, relevant `docs/operations/**`, TS files with Go-runtime wording.
- **Details:**
  - Confirm each remaining Go-related surface is classified as `remove`, `replace`, or `archive-only`.
  - Record any surface that still actively depends on `packages/opencode-core/`.
  - Use this classification as the implementation and review checklist.
- **Validation hook:** repository inspection only.

### Slice 2: Active supported-path cleanup
- **Goal:** remove or rewrite active references that still imply Go is part of the supported product path.
- **Primary files/surfaces:** release/install scripts, workflows, active docs, TS comments/messages.
- **Details:**
  - Remove script/workflow references to `packages/opencode-core/` and Go-era release flow assumptions.
  - Rewrite comments/messages/docs to describe the current Rust + TypeScript ownership truthfully.
  - Keep active commands and supported operator behavior unchanged unless an already approved deprecation exists.
- **Depends on:** Slice 1
- **Validation hook:** `npm run check`, `npm test`, active-surface review.

### Slice 3: `packages/opencode-core` retirement
- **Goal:** retire the remaining Go package safely once no active supported path depends on it.
- **Primary files/surfaces:** `packages/opencode-core/**`, any script/workflow/config paths that still reference it.
- **Details:**
  - Remove the directory as one retirement unit rather than leaving partial active remnants.
  - If a provenance note is needed, replace the live tree with a short archive pointer instead of preserving code in `packages/`.
  - Block retirement if any active release/install/runtime path still reads from this tree.
- **Depends on:** Slice 2
- **Validation hook:** `npm run check`, `npm test`, repository reference audit.

### Slice 4: Historical framing cleanup
- **Goal:** preserve history without implying active Go support.
- **Primary files/surfaces:** active maintainer docs plus any retained historical solution/scope/QA artifacts that still appear near active guidance.
- **Details:**
  - Ensure retained Go references are clearly archival and not written as current-state guidance.
  - Keep migration-era documents that are still useful for provenance, but do not let them act as active architecture authority.
  - Add or tighten archive framing only where current placement still creates confusion.
- **Depends on:** Slice 3
- **Validation hook:** doc review against approved scope and current repo reality.

## Dependency Graph
- Critical path: `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- Active supported-path cleanup must happen before `packages/opencode-core/` retirement.
- Historical framing cleanup follows package retirement so archive boundaries can be described truthfully.

## Parallelization Assessment
- parallel_mode: `none`
- why: script, workflow, docs, and package retirement all affect the same supported-path truth contract and are too easy to desynchronize.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- integration_checkpoint: verify that no active script, workflow, config, or doc surface still depends on or implies `packages/opencode-core` or Go support before closing the work.
- max_active_execution_tracks: 1

## Validation Matrix
- **No active Go support implied in operator guidance** -> inspect `README.md`, install/upgrade/uninstall scripts, workflow docs
- **No active Go support implied in maintainer guidance** -> inspect `AGENTS.md`, `context/core/**`, relevant `docs/operations/**`
- **No active workflow or script dependency on Go tree** -> inspect `.github/workflows/*`, `scripts/*`, references to `packages/opencode-core`, `go.mod`, `go.sum`
- **Rust + TS path remains intact** -> `npm run check`, `npm test`
- **Remaining Go mentions are archival only** -> inspect retained historical docs after cleanup

## Integration Checkpoint
- Required checkpoint before handoff closure:
  1. No active script or workflow still references `packages/opencode-core/`.
  2. No active doc or message presents Go as supported, required, or fallback runtime.
  3. `packages/opencode-core/` is retired or explicitly blocked pending a named active dependency.
  4. Remaining Go references are clearly archival.
  5. `npm run check` and `npm test` still pass.

## Rollback Notes
- If hidden active dependencies on `packages/opencode-core/` are found late, restore retirement as a single unit rather than partially reintroducing Go-era references.
- Do not accept a partial rollback where docs say Go is gone but workflows/scripts still depend on it, or vice versa.
- Triggers for rollback: broken supported-path behavior, late-discovered script/workflow coupling, or archive framing that still implies active Go support.

## Reviewer Focus Points
- Verify the implementation removes active Go confusion across code, config, workflows, scripts, and docs rather than only deleting Go files.
- Verify TS comments/messages no longer describe current ownership in Go terms.
- Verify `packages/opencode-core/` is not retained as an active package-space archive.
- Block unrelated Rust/TS refactors or broad cleanup not required for zero-Go clarity.

## Non-Goals
- Rewriting all historical Go mentions across the entire repository
- Broad Rust or TypeScript refactors unrelated to zero-Go clarity
- New operator or maintainer features unrelated to Go eradication
- Workflow redesign beyond making current active surfaces truthful
