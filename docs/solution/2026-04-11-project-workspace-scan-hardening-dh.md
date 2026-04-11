# Solution Package: Project / Workspace Scan Hardening (DH)

**Date:** 2026-04-11
**Approved scope:** `docs/scope/2026-04-11-project-workspace-scan-hardening-dh.md`
**Analysis input:** `docs/opencode/project-workspace-scan-hardening-selective-port-mapping-dh.md`

---

## Recommended Path

Harden DH's existing workspace scan in place around `detect-projects.ts`, then align the three downstream consumers that already depend on it.

This is enough because DH already has the right choke point and consumer seams:

- `packages/intelligence/src/workspace/detect-projects.ts`
- `packages/intelligence/src/graph/graph-indexer.ts`
- `packages/retrieval/src/query/run-retrieval.ts`
- `packages/runtime/src/jobs/index-job-runner.ts`
- `packages/intelligence/src/graph/module-resolver.ts`
- `packages/shared/src/types/indexing.ts`

The required work is scan-contract hardening, canonical-path consistency, marker-based workspace typing, and partial-scan awareness. It is **not** a full port of upstream project/worktree/filesystem/shell subsystems.

---

## Repository Reality Constraints

1. **`detectProjects()` is the current intake path for multiple flows.**
   - `GraphIndexer.indexProject()` calls it directly.
   - `runRetrieval()` calls it directly.
   - `runIndexWorkflow()` calls it directly.

2. **The current scan implementation is intentionally thin.**
   - `detect-projects.ts` recursively walks from `repoRoot` with fixed ignored directories and a fixed extension map.
   - It always returns a single workspace rooted at `repoRoot`.
   - `detectWorkspaceType()` currently inspects already-filtered indexed files, so `package.json` and `go.mod` cannot be observed correctly.

3. **Path normalization is currently local and inconsistent.**
   - `graph-indexer.ts` defines its own `normalizePath()` helper.
   - `module-resolver.ts` returns absolute paths without a shared canonicalization contract with scan output.

4. **Downstream consumers currently assume scan coverage is authoritative.**
   - `graph-indexer.ts` deletes nodes that are no longer present in the current scan result.
   - `run-retrieval.ts` and `index-job-runner.ts` do not currently surface partial-coverage warnings.

5. **DH has real repo-native validation commands.**
   - `npm run check`
   - `npm run test`

The solution should use those commands and extend the current Vitest coverage rather than inventing new validation tooling.

---

## Architecture Decisions

### AD-1: Keep `detect-projects.ts` as the scan authority; do not introduce a new project-management subsystem

The scan contract should be hardened at the existing entry point instead of adding an upstream-style `Project`/`Vcs`/`Worktree` service layer. This keeps change localized to DH's current architecture and preserves existing call paths.

### AD-2: Canonical relative path output becomes a required invariant owned by the scan layer

`detectProjects()` should emit canonical workspace-relative paths, and downstream consumers should rely on that output instead of re-normalizing inconsistently. A small shared workspace/path helper is recommended so `detect-projects.ts`, `graph-indexer.ts`, and `module-resolver.ts` use the same normalization semantics.

Required invariant:

- scan output paths are relative to the workspace root
- path separators are normalized consistently
- paths outside the allowed root are rejected rather than emitted

### AD-3: Workspace typing must be marker-based, not derived from indexable-file output

Workspace type detection should inspect marker existence independently of indexable content filtering. `package.json`, `go.mod`, and similar markers inform workspace typing even when they are not part of the indexed source-file set.

### AD-4: Partial scan is a first-class state, not an implicit success

Budget stops, size limits, symlink skips, and localized IO failures should produce diagnostics that downstream consumers can interpret. Partial scan should degrade behavior safely, not silently masquerade as full coverage.

### AD-5: Initial delivery preserves the current single-root workspace model

The first delivery should keep `detectProjects()` compatible with current single-root behavior while adding the contracts needed for future segmentation. Multi-workspace segmentation is a later, conditional follow-on slice, not a prerequisite for this task.

### AD-6: Safe-by-default traversal rules are mandatory

The scan layer should define explicit defaults for:

- max files
- max depth
- max file size
- no-follow symlink behavior
- ignored-directory policy
- localized error capture instead of whole-run failure on one unreadable branch

### AD-7: Worktree and shell helpers remain deferred beyond scan/path hardening

This task may add only the scan/path helpers required to make workspace discovery safe and consistent. **Worktree lifecycle helpers, shell orchestration, shell fallback, process-tree management, and other project/worktree helpers beyond scan/path hardening are explicitly deferred.**

---

## Impacted Surfaces

### Existing files to modify

| File | Why it changes |
|---|---|
| `packages/intelligence/src/workspace/detect-projects.ts` | Main hardening surface for scan options, marker detection, canonical paths, symlink policy, diagnostics, and stop behavior |
| `packages/shared/src/types/indexing.ts` | Additive scan metadata and diagnostics fields for workspace/file contracts |
| `packages/intelligence/src/graph/graph-indexer.ts` | Consume canonical scan paths and prevent budget-stopped scans from being treated as authoritative delete signals |
| `packages/retrieval/src/query/run-retrieval.ts` | Surface reduced-coverage metadata when scan results are partial |
| `packages/runtime/src/jobs/index-job-runner.ts` | Aggregate workspace scan diagnostics into operator-visible summary and result diagnostics |
| `packages/intelligence/src/graph/module-resolver.ts` | Align path normalization semantics with the scan contract to reduce resolver/indexer mismatch |
| `packages/intelligence/src/graph/graph-indexer.test.ts` | Cover partial-scan/delete-protection behavior |
| `packages/retrieval/src/query/run-retrieval.test.ts` | Cover reduced-coverage signaling in retrieval results |
| `packages/runtime/src/jobs/index-job-runner.test.ts` | Cover operator-visible diagnostics and summary behavior |
| `packages/intelligence/src/graph/module-resolver.test.ts` | Cover normalization consistency expectations |

### Recommended new files

| File | Responsibility |
|---|---|
| `packages/intelligence/src/workspace/detect-projects.test.ts` | Focused scan-contract tests for marker detection, budgets, symlink behavior, and canonical paths |
| `packages/intelligence/src/workspace/scan-paths.ts` | Shared canonical-path and root-containment helpers used by scan and downstream consumers |

### Optional follow-on only if Phase 3 is approved

| File | Responsibility |
|---|---|
| `packages/intelligence/src/workspace/workspace-boundaries.ts` | Marker-driven workspace segmentation helper if DH moves beyond the initial single-root delivery |

---

## Technical Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Budget-stop scans trigger false deletions | `graph-indexer.ts` currently deletes nodes absent from the current file set | Gate delete behavior on scan completeness and carry stop state through workspace diagnostics |
| Canonicalization is implemented differently in multiple places | Scan, graph, and resolver keys can still drift | Introduce one shared workspace/path helper and remove local normalization duplication where possible |
| Marker detection grows too broad | Scope can expand into full workspace-management heuristics | Keep the initial marker set narrow and explicit (`package.json`, `go.mod`, equivalent approved markers only) |
| Over-tight defaults reduce usefulness on larger repos | Hardening can become operationally noisy or incomplete | Start with conservative defaults and emit diagnostics that make stop reasons visible |
| Scope creeps into worktree/shell/platform parity | Delivery expands beyond approved scan hardening | Treat non-scan helper work as deferred and review each change against the scope's out-of-scope list |

---

## Phased Implementation Plan

### Phase 0: Contract freeze and test-first baseline

- **Goal:** Lock the hardened scan vocabulary before behavior changes.
- **Primary files:**
  - `packages/intelligence/src/workspace/detect-projects.ts`
  - `packages/shared/src/types/indexing.ts`
  - `packages/intelligence/src/workspace/detect-projects.test.ts`
- **Work:**
  - define the scan option surface and default values
  - define workspace/file diagnostics fields and stop-reason vocabulary
  - define the canonical path expectation for scan output
  - add baseline tests before changing behavior so current and target semantics are explicit
- **Dependencies:** none
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 1: Core scan hardening in `detect-projects.ts`

- **Goal:** Make scan behavior bounded, observable, and safe by default.
- **Primary files:**
  - `packages/intelligence/src/workspace/detect-projects.ts`
  - `packages/intelligence/src/workspace/scan-paths.ts`
  - `packages/shared/src/types/indexing.ts`
  - `packages/intelligence/src/workspace/detect-projects.test.ts`
- **Work:**
  - add `ScanOptions` with safe defaults, including file/depth/size limits and explicit symlink policy
  - canonicalize emitted paths and reject out-of-root paths
  - split marker detection from source-file indexing so workspace type is based on real markers
  - add diagnostics for visited/indexed/ignored/skipped/error counts and stop reason
  - keep single-root workspace return behavior for compatibility
  - degrade gracefully on localized read/stat failures instead of failing the full scan when possible
- **Dependencies:** Phase 0
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 2: Consumer alignment for partial-scan awareness

- **Goal:** Make downstream consumers understand that partial scan is not full-state truth.
- **Primary files:**
  - `packages/intelligence/src/graph/graph-indexer.ts`
  - `packages/runtime/src/jobs/index-job-runner.ts`
  - `packages/retrieval/src/query/run-retrieval.ts`
  - `packages/intelligence/src/graph/module-resolver.ts`
  - corresponding test files
- **Work:**
  - make `graph-indexer.ts` use canonical scan paths from the shared helper
  - prevent deletion logic from treating budget-stopped or partial scans as authoritative absence
  - propagate scan diagnostics into `IndexJobResult.diagnostics` and summary text
  - surface reduced-coverage metadata in retrieval results so downstream planners/operators know coverage is incomplete
  - align resolver normalization with scan canonicalization rules
- **Dependencies:** Phase 1
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 3: Conditional marker-driven segmentation follow-up

- **Goal:** Prepare for multi-workspace awareness only if the hardened single-root contract is stable and marker boundaries are unambiguous.
- **Primary files:**
  - `packages/intelligence/src/workspace/detect-projects.ts`
  - optional `packages/intelligence/src/workspace/workspace-boundaries.ts`
  - affected consumer tests if behavior changes
- **Work:**
  - evaluate marker-driven segmentation for monorepo-style layouts
  - preserve backward compatibility with the existing single-root assumption unless a caller is explicitly updated
  - keep this slice separate from the required hardening milestone
- **Dependencies:** Phase 2 and explicit approval to widen within the same scope family
- **Validation hook:**
  - `npm run check`
  - `npm run test`

---

## Dependency Graph

- **Sequential:** Phase 0 -> Phase 1 -> Phase 2
- **Conditional follow-on:** Phase 3 only after Phase 2 is stable
- **Shared-surface checkpoint:** Canonical-path helpers and scan diagnostics must be settled before consumer alignment begins
- **Critical path:** scan contract -> safe scan behavior -> downstream partial-scan handling

Parallel work is only safe inside a phase when one owner maintains the shared scan contract and the other owner updates consumers against that frozen contract. Parallel implementation should not proceed before the canonical-path and diagnostics vocabulary is fixed.

---

## Validation Strategy

### Primary commands

- `npm run check`
- `npm run test`

### Required test coverage additions or updates

| Surface | Validation focus |
|---|---|
| `packages/intelligence/src/workspace/detect-projects.test.ts` | marker-based workspace typing, ignored directories, max-depth/file-size/file-count stops, no-follow symlink behavior, canonical relative path output, localized IO error handling |
| `packages/intelligence/src/graph/graph-indexer.test.ts` | budget-stopped or partial scan does not trigger false deletions; canonical paths still map consistently to graph nodes |
| `packages/runtime/src/jobs/index-job-runner.test.ts` | summary and diagnostics reflect partial scan or budget-stop conditions |
| `packages/retrieval/src/query/run-retrieval.test.ts` | retrieval output carries reduced-coverage metadata when scan is partial |
| `packages/intelligence/src/graph/module-resolver.test.ts` | resolver normalization stays compatible with canonical scan paths |

### Acceptance-to-validation matrix

| Acceptance target | Validation path |
|---|---|
| Hardened scan controls and stop behavior | `npm run test` with focused `detect-projects` scenarios plus `npm run check` |
| Marker-based workspace typing | `detect-projects` tests using repos with `package.json` / `go.mod` markers not included in indexed file extensions |
| Diagnostics and stop reasons | `detect-projects` tests plus `index-job-runner` summary assertions |
| Safe symlink default | `detect-projects` tests proving no-follow behavior and non-recursion through unsafe links |
| Canonical path consistency | `detect-projects`, `graph-indexer`, and `module-resolver` tests with normalized path assertions |
| Partial-scan downstream awareness | `graph-indexer`, `run-retrieval`, and `index-job-runner` tests |

---

## Compatibility and Out-of-Scope Boundaries

### Compatibility rules

1. `detectProjects(repoRoot)` must remain callable by current consumers; any expanded options should be additive.
2. `IndexedWorkspace` and `IndexedFile` changes should be additive or optional so current callers do not break.
3. Initial delivery should preserve the current single-root workspace behavior even if richer metadata is added.
4. `graph-indexer.ts` should become safer under partial scans without changing its core indexing role.
5. Retrieval and index-job outputs may gain metadata/diagnostics, but current primary result shapes should remain usable by existing callers.

### Explicitly out of scope

- full upstream `Project`, `Vcs`, `Worktree`, or Effect-layer service parity
- worktree lifecycle operations such as create/remove/reset
- shell orchestration, shell fallback selection, or process-tree management
- broad filesystem abstraction replacement across DH
- unrelated MCP, plugin, or runtime-subsystem changes
- forced full multi-workspace parity in the initial hardening milestone

### Explicit defer note

**Worktree/shell helpers beyond scan/path hardening are deferred.** This package allows only the minimum helper extraction needed to support canonical path handling and safe workspace scan boundaries.

---

## Handoff Notes

### Preserve for FullstackAgent

- Keep the implementation centered on `detect-projects.ts` plus the listed consumers.
- Do not widen into general project/worktree/shell infrastructure.
- Freeze the canonical-path helper contract before consumer rewiring.

### Preserve for Code Reviewer

- Verify there is one shared normalization path instead of duplicated local helpers.
- Verify partial scan cannot trigger false graph deletions.
- Verify new type fields are additive and callers remain compatible.
- Reject any change that broadens into non-scan worktree/shell helper work.

### Preserve for QA Agent

- Validate with temporary repos that cover marker detection, symlink behavior, budget stops, and partial-scan signaling.
- Confirm operator-visible summaries and retrieval-facing metadata accurately describe incomplete coverage.
- Confirm no unrelated worktree or shell behavior changed as part of this task.

---

## Pass Condition for This Solution Package

This package is approval-ready because it:

- selects one implementation path centered on existing DH seams
- makes boundaries and affected surfaces explicit
- sequences scan hardening before consumer alignment
- uses real repository validation commands
- records the compatibility contract and defers non-scan worktree/shell helpers explicitly
