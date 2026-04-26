---
artifact_type: solution_package
version: 1
status: ready
feature_id: MODULE-RESOLUTION-ALIAS-SUPPORT
feature_slug: module-resolution-alias-support
source_scope_package: docs/scope/2026-04-24-module-resolution-alias-support.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Module Resolution Alias Support

**Date:** 2026-04-24
**Upstream scope:** `docs/scope/2026-04-24-module-resolution-alias-support.md`
**Prior runtime integration context:** `docs/solution/2026-04-11-openkit-reuse-dh-runtime-integration.md`

## Recommended Path

Add a bounded TypeScript/JavaScript alias-resolution layer inside the existing graph import-edge extraction path, not a broader module-resolution rewrite. The resolver should read nearest applicable `tsconfig.json` / `jsconfig.json` files, interpret only `compilerOptions.baseUrl` and `compilerOptions.paths`, resolve deterministic in-workspace targets through the existing extension/index fallback behavior, and return structured resolution outcomes for every static TS/JS import specifier.

This is enough because the current graph pipeline already has:

- AST-based static import specifier extraction in `packages/intelligence/src/graph/extract-import-edges.ts`.
- Local relative path fallback in `packages/intelligence/src/graph/module-resolver.ts`.
- Workspace discovery and per-file workspace roots through `detectProjects()` / `IndexedFile.workspaceRoot`.
- Graph persistence for resolved local edges in `graph_edges`, but no dedicated table/column for unresolved import outcomes.
- Repo-real validation commands in root `package.json`: `npm test -- ...` through Vitest and `npm run check` through `tsc --noEmit`.

The implementation must not claim compiler-grade TypeScript resolution, package-manager lookup, Node condition exports parity, or Rust bridge changes. Bare package imports stay explicit as external/unresolved unless a configured alias maps them to a local workspace path.

## Impacted Surfaces

| Surface | Exact files to inspect/edit | Expected change |
|---|---|---|
| Resolver | `packages/intelligence/src/graph/module-resolver.ts` | Expand from `string | null` relative-only resolution to structured TS/JS resolution outcomes, including alias config support and status/reason. |
| Resolver tests | `packages/intelligence/src/graph/module-resolver.test.ts` | Add focused fixtures for `baseUrl`, `paths`, `extends`, invalid config, ambiguity, external packages, workspace boundary rejection, extension fallback, and index fallback. |
| Import extraction | `packages/intelligence/src/graph/extract-import-edges.ts` | Consume structured resolver outcomes and emit only successful local edges while preserving inspectable unresolved/ambiguous/external/unsafe/degraded outcomes. |
| Import extraction tests | `packages/intelligence/src/graph/extract-import-edges.test.ts` | Assert alias-resolved edges and no fabricated edges for unresolved/ambiguous/external/unsafe cases. |
| Graph indexer | `packages/intelligence/src/graph/graph-indexer.ts` | Preserve alias diagnostics across indexing and expose them through graph-index stats or resolver diagnostics without changing edge semantics. |
| Graph indexer tests | `packages/intelligence/src/graph/graph-indexer.test.ts` | Add integration fixture proving alias-resolved dependencies/dependents are queryable after indexing. |
| Shared graph/indexing types | `packages/shared/src/types/graph.ts`; optionally `packages/shared/src/types/indexing.ts` | Add typed resolution outcome/diagnostic shapes if resolver results cross module boundaries. Avoid broad `any`; make status and reason explicit. |
| Storage layer | `packages/storage/src/sqlite/db.ts`; `packages/storage/src/sqlite/repositories/graph-repo.ts`; `packages/storage/src/sqlite/repositories/graph-repo.test.ts` | Only edit if persistence is chosen for unresolved diagnostics. Do not rewrite graph schema. Prefer no schema change for this feature unless tests prove operator output cannot inspect statuses otherwise. |
| Workspace discovery | `packages/intelligence/src/workspace/detect-projects.ts`; `packages/intelligence/src/workspace/scan-paths.ts`; related tests only if needed | Inspect for workspace-root semantics. Edit only if nested package boundary behavior cannot be implemented using existing `IndexedFile.workspaceRoot` and scan helpers. |
| Documentation/messages | This solution package and any runtime output strings touched by implementation | Use “bounded TS/JS alias support”; avoid “TypeScript-compatible resolver” or “full module resolution.” |

## Boundaries And Technical Risks

- **Static TS/JS imports only:** preserve the current extractor’s supported static forms: `import`, side-effect import, re-export, type-only import, static-string `require()`, and static-string dynamic `import()` where already collected. Do not add dynamic expression resolution.
- **No package-manager resolution redesign:** non-relative bare specifiers without a local `paths` match are `external` or `unresolved` with reason, not looked up in `node_modules`.
- **No Rust bridge work:** all planned changes are in TypeScript graph/indexing surfaces. Escalate only if an existing runtime tool cannot expose diagnostics without a TS-side path.
- **Current storage gap:** `graph_edges` stores only resolved local edges. Failed resolutions must be inspectable through structured resolver/import-extraction/indexer results first. Add persistent diagnostics only if a repo-real operator surface requires status after process completion.
- **Nested package risk:** `detectProjects()` discovers leaf package roots by `package.json` / `Cargo.toml` and each `IndexedFile` carries `workspaceRoot`. Alias config selection must respect the source file’s workspace root, not accidentally resolve through an unrelated sibling package.
- **Config complexity risk:** `extends` support can become compiler-grade quickly. Keep it bounded to readable local JSON/JSONC config inheritance and only merge the fields needed for `baseUrl` and `paths`.

## Interfaces And Data Contracts

### Resolver result contract

Replace or wrap `resolveModuleSpecifier()` with a structured result shape. Keep a compatibility helper only if existing callers still need `string | null` during transition.

Recommended shared/local type:

```ts
type ModuleResolutionStatus =
  | "resolved"
  | "unresolved"
  | "ambiguous"
  | "external"
  | "unsafe"
  | "degraded";

type ModuleResolutionReason =
  | "relative_target_found"
  | "alias_target_found"
  | "alias_config_missing"
  | "alias_pattern_not_matched"
  | "target_missing"
  | "target_outside_workspace"
  | "multiple_targets"
  | "external_package"
  | "config_unreadable"
  | "config_parse_error"
  | "extends_unreadable"
  | "extends_parse_error"
  | "extends_outside_workspace"
  | "unsupported_config_shape";
```

`resolved` results must include `resolvedAbsPath` and `resolutionKind: "relative" | "alias"`. Non-resolved results must include `specifier`, `containingFileAbsPath`, `status`, and `reason`. Tests should assert status/reason instead of relying on logs.

### Where status/reason is represented without graph storage support

Decision: status/reason is represented in structured TypeScript return values and indexer diagnostics first, not in `graph_edges`.

- `graph_edges` remains reserved for truthful resolved local relationships.
- `module-resolver.ts` returns a structured status/reason for every specifier.
- `extract-import-edges.ts` should internally retain non-resolved outcomes in a diagnostics collection while returning resolved `IndexedEdge[]` for existing consumers.
- If changing the public return type of `extractImportEdges()` would break existing callers, add `extractImportEdgesWithDiagnostics()` and have `extractImportEdges()` delegate and return only `.edges`.
- `GraphIndexStats` in `packages/shared/src/types/graph.ts` may be extended with optional counters such as `importsResolved`, `importsUnresolved`, `importsExternal`, `importsAmbiguous`, `importsUnsafe`, `importsDegraded`; this is the preferred operator-inspectable surface for indexing summaries.
- Do not add a `graph_import_resolution_diagnostics` table in the first pass unless Fullstack discovers that tests/tool output cannot inspect required statuses without persistence. If added, it must be additive and scoped to import diagnostics only, with no change to resolved edge semantics.

### `tsconfig` / `jsconfig` discovery and `extends` handling

Decision: support bounded local `extends` chains in the first implementation, because scope explicitly calls this out and config inheritance commonly holds `baseUrl`/`paths`.

Rules:

1. For a source file, find the nearest `tsconfig.json` or `jsconfig.json` at or above the containing file directory, stopping at that file’s `workspaceRoot` when available; otherwise stop at `repoRoot`.
2. If both `tsconfig.json` and `jsconfig.json` exist in the same directory, prefer `tsconfig.json` and record deterministic precedence in tests.
3. Parse JSONC-compatible config using a bounded parser strategy already available in the repo. If no JSONC parser dependency exists, implement a small comment/trailing-comma tolerant helper only if tests demand it; otherwise invalid JSONC must produce `degraded/config_parse_error` rather than a crash. Do not add a new dependency without explicit implementation justification.
4. Support `extends` only when it resolves to a readable config file inside the same workspace boundary. Relative `extends` paths are resolved from the child config directory. Bare package `extends` is out of scope and should produce `degraded/unsupported_config_shape` for alias capability while indexing continues.
5. Merge only `compilerOptions.baseUrl` and `compilerOptions.paths`. Child config overrides parent values following TypeScript’s normal object-override intuition for the supported fields: child `baseUrl` replaces parent `baseUrl`; child `paths` entries override same keys and otherwise merge with parent keys.
6. Detect cycles and excessive chain depth as `degraded/unsupported_config_shape`, not a thrown whole-index failure.
7. Cache loaded config results by config path for a single indexing run to avoid repeated I/O.

### Alias matching and target resolution

Rules:

- Apply `paths` pattern matches before bare `baseUrl` fallback.
- Support exact keys (`"@lib"`) and one-wildcard keys (`"@/*"`, `"~/*"`). Multiple-wildcard patterns are unsupported/degraded for that pattern.
- For matching wildcard keys, substitute the captured segment into each target pattern in order.
- Resolve target patterns relative to the effective `baseUrl` when present; otherwise relative to the config directory for `paths` entries.
- Reuse the existing deterministic extension/index fallback order from `module-resolver.ts`: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, then `index` variants in the same extension order.
- If exactly one candidate resolves to an existing file inside the source file’s workspace boundary, return `resolved/alias_target_found`.
- If more than one target entry or fallback candidate resolves to different files for the same specifier, return `ambiguous/multiple_targets`; do not choose the first one unless tests document a deterministic precedence that preserves truthfulness.
- If a target resolves outside the source file’s workspace boundary, return `unsafe/target_outside_workspace` and do not create a local edge.
- If no configured alias matches, return `external/external_package` for bare package-like specifiers and `unresolved/alias_pattern_not_matched` for alias-like prefixes only when a config exists but does not match.

### Workspace-root boundary for nested packages

Decision: the source file’s `IndexedFile.workspaceRoot` is the authoritative boundary for alias config discovery and target acceptance. If unavailable, use `repoRoot` as fallback.

- A file in `packages/app-a` may resolve aliases only to files inside `packages/app-a` when that is the detected workspace root.
- A root-level workspace file uses repo root as its boundary.
- Cross-package aliases remain out of scope unless the source workspace root is the repo root and the target is inside it.
- This boundary should be tested with nested fixture packages to prevent accidental sibling-package edges.

## Implementation Slices

### Slice 1: Resolver contract and config loader

**Goal:** Establish a truthful structured resolver API and config loading/merging behavior without changing graph persistence.

**Files:**

- `packages/intelligence/src/graph/module-resolver.ts`
- `packages/intelligence/src/graph/module-resolver.test.ts`
- Optional only if types need sharing: `packages/shared/src/types/graph.ts` or a new local resolver type file under `packages/intelligence/src/graph/`

**Details:**

- Add structured resolution statuses/reasons.
- Preserve relative import success behavior through tests before alias work.
- Add config discovery bounded by `workspaceRoot` and support local `extends` chains as described above.
- Keep file lookup deterministic and boundary-checked.

**Validation Command:**

- `npm test -- packages/intelligence/src/graph/module-resolver.test.ts`
- `npm run check`

**Reviewer focus:** no compiler-parity claims, no package-manager lookup, no target outside workspace, no silent parse failures.

### Slice 2: Alias mapping and resolver diagnostics in import extraction

**Goal:** Use the resolver in import extraction so alias-resolved imports create local edges while non-resolved cases remain inspectable.

**Files:**

- `packages/intelligence/src/graph/extract-import-edges.ts`
- `packages/intelligence/src/graph/extract-import-edges.test.ts`
- `packages/shared/src/types/indexing.ts` only if `IndexedEdge` needs optional metadata; prefer separate diagnostics to avoid changing edge semantics.

**Details:**

- Add `extractImportEdgesWithDiagnostics(repoRoot, files)` returning `{ edges, diagnostics }` or equivalent.
- Keep `extractImportEdges(repoRoot, files): Promise<IndexedEdge[]>` for existing callers by returning only resolved edges.
- Pass each file’s actual workspace root into resolver, not only `repoRoot`.
- Assert that ambiguous, external, unsafe, degraded, and unresolved outcomes do not create `IndexedEdge` rows.
- Preserve existing AST extraction forms and regex fallback behavior where still needed, but avoid letting regex fallback fabricate unresolved alias edges.

**Validation Command:**

- `npm test -- packages/intelligence/src/graph/extract-import-edges.test.ts`
- `npm test -- packages/intelligence/src/graph/module-resolver.test.ts`
- `npm run check`

**Reviewer focus:** resolved aliases map to correct target file IDs; status/reason is testable; existing relative imports remain unchanged.

### Slice 3: Graph indexer integration and queryable edge proof

**Goal:** Ensure graph indexing carries alias-resolved edges into `graph_edges` and exposes resolution counters/diagnostics without schema overreach.

**Files:**

- `packages/intelligence/src/graph/graph-indexer.ts`
- `packages/intelligence/src/graph/graph-indexer.test.ts`
- `packages/shared/src/types/graph.ts`
- `packages/storage/src/sqlite/repositories/graph-repo.ts` and `packages/storage/src/sqlite/repositories/graph-repo.test.ts` only if persistence diagnostics become necessary.

**Details:**

- Have `GraphIndexer` call the diagnostic-aware extraction path.
- Extend `GraphIndexStats` with optional import-resolution counters or diagnostics summary, keeping existing required fields intact.
- Add an integration fixture with `tsconfig.json`/`jsconfig.json` aliases and verify `GraphRepo.findDependencies()` / `findDependents()` includes the alias-resolved relationship.
- Verify invalid config does not crash indexing and increments/reports degraded alias capability.

**Validation Command:**

- `npm test -- packages/intelligence/src/graph/graph-indexer.test.ts`
- `npm test -- packages/storage/src/sqlite/repositories/graph-repo.test.ts` if storage is touched
- `npm run check`

**Reviewer focus:** graph storage contains only resolved local edges; diagnostics do not corrupt incremental indexing; no unrelated graph schema rewrite.

### Slice 4: Regression, fixtures, and wording hardening

**Goal:** Complete acceptance coverage across edge cases and ensure operator-facing wording is honest.

**Files:**

- `packages/intelligence/src/graph/module-resolver.test.ts`
- `packages/intelligence/src/graph/extract-import-edges.test.ts`
- `packages/intelligence/src/graph/graph-indexer.test.ts`
- Any docs/runtime message files touched by Fullstack while exposing diagnostics

**Details:**

- Cover AC-1 through AC-10 explicitly in test names or assertion grouping.
- Include fixtures for alias success, relative regression, unmatched alias-like prefix, outside-workspace target, invalid config, ambiguous mapping, external package, extension fallback, index fallback, and queryable graph relationship.
- Review all added messages/docs for “bounded TS/JS alias support” wording.

**Validation Command:**

- `npm test -- packages/intelligence/src/graph/module-resolver.test.ts packages/intelligence/src/graph/extract-import-edges.test.ts packages/intelligence/src/graph/graph-indexer.test.ts`
- `npm run check`
- Optional final confidence: `npm test -- packages/intelligence/src/graph/`

**Reviewer focus:** tests prove behavior rather than implementation details; no broad fixture pollution; no claims beyond approved scope.

## Dependency Graph

```text
Slice 1 (resolver contract + config loader)
  -> Slice 2 (import extraction diagnostics + alias edges)
    -> Slice 3 (graph indexer stats + queryable edge proof)
      -> Slice 4 (acceptance regression + wording hardening)
```

Critical path: Slice 1 → Slice 2 → Slice 3 → Slice 4.

## Parallelization Assessment

- **parallel_mode:** `none`
- **why:** The resolver contract is the shared surface for import extraction and graph indexing. Running slices in parallel would likely cause incompatible result shapes, duplicate fixture setup, or false confidence around status/reason exposure.
- **safe_parallel_zones:** []
- **sequential_constraints:** [`TASK-RESOLVER -> TASK-IMPORT-EXTRACTION -> TASK-GRAPH-INDEXER -> TASK-ACCEPTANCE-HARDENING`]
- **integration_checkpoint:** After Slice 3, run resolver, import extraction, and graph-indexer tests together and confirm both resolved alias edges and non-resolved diagnostics are visible.
- **max_active_execution_tracks:** 1

## Validation Matrix

| Acceptance | Slice | Repository-real validation |
|---|---:|---|
| AC-1 readable config `baseUrl`/`paths` alias resolves to local graph edge | 1, 2, 3 | `npm test -- packages/intelligence/src/graph/module-resolver.test.ts packages/intelligence/src/graph/extract-import-edges.test.ts packages/intelligence/src/graph/graph-indexer.test.ts` |
| AC-2 existing relative imports unchanged | 1, 2 | `npm test -- packages/intelligence/src/graph/module-resolver.test.ts packages/intelligence/src/graph/extract-import-edges.test.ts` |
| AC-3 alias-like prefix without config match remains unresolved/unsupported | 1, 2 | Resolver/import tests assert status/reason and no edge. |
| AC-4 target outside workspace root rejected | 1, 2 | Resolver/import tests assert `unsafe/target_outside_workspace` and no edge. |
| AC-5 invalid/unreadable config degrades alias capability without whole-index crash | 1, 3 | Resolver test plus `npm test -- packages/intelligence/src/graph/graph-indexer.test.ts` asserts index stats/diagnostics. |
| AC-6 ambiguous mapping is ambiguous, not arbitrary | 1, 2 | Resolver/import tests assert `ambiguous/multiple_targets` and no edge. |
| AC-7 external package imports remain external/unresolved | 1, 2 | Resolver/import tests assert `external/external_package` and no package-manager lookup. |
| AC-8 extension and index fallback for alias targets | 1, 2 | `npm test -- packages/intelligence/src/graph/module-resolver.test.ts` with `.ts`/`.tsx` and `index.*` fixtures. |
| AC-9 dependency/dependent queries include alias-resolved relationship | 3 | `npm test -- packages/intelligence/src/graph/graph-indexer.test.ts`; use `GraphRepo.findDependencies()` / `findDependents()` assertions. |
| AC-10 wording avoids compiler-grade claims | 4 | Manual review of changed strings/docs plus test snapshot if runtime output is snapshotted. |
| Type safety across all touched TS surfaces | All | `npm run check` |

## Integration Checkpoint

Before handoff to Code Reviewer/QA, Fullstack must provide fresh evidence for:

1. `npm test -- packages/intelligence/src/graph/module-resolver.test.ts packages/intelligence/src/graph/extract-import-edges.test.ts packages/intelligence/src/graph/graph-indexer.test.ts`
2. `npm run check`
3. A short result summary showing:
   - at least one alias import resolved to a graph dependency edge,
   - at least one unresolved/unmatched alias-like specifier remained without an edge,
   - at least one ambiguous specifier remained without an edge,
   - at least one outside-workspace target was rejected,
   - invalid config did not crash indexing and was reported as degraded.

## Rollback Notes

- Resolver changes are localized to TypeScript graph intelligence. If alias support causes issues, keep structured relative resolution and disable alias config lookup behind a small internal option or by reverting `paths` handling.
- `graph_edges` semantics should remain compatible because only resolved local edges are inserted.
- If optional `GraphIndexStats` counters are added, they should be additive optional fields and safe to remove or ignore.
- Avoid schema changes in the preferred path. If a diagnostics table is introduced after a concrete blocker, it must be additive and independently droppable.

## Reviewer Focus Points

- Confirm implementation derives aliases only from readable, parseable config and bounded `extends` chains.
- Confirm source-file workspace root controls config discovery and target boundary checks.
- Confirm ambiguous/unsafe/external/degraded/unresolved statuses are testable and not reduced to silent `null`.
- Confirm existing relative import tests still pass and resolver fallback order remains deterministic.
- Confirm no `node_modules`, package manager, Node exports/imports, or Rust bridge behavior was added under this feature.
- Confirm wording says “bounded TS/JS alias support,” not TypeScript compiler parity.

## Notes for QA Agent

- Treat this as a graph-indexing behavior feature, not a UI or Rust bridge feature.
- QA should prioritize fixture-backed runtime behavior: resolved local alias edges appear in dependency/dependent queries; all non-resolved classes remain inspectable and do not fabricate graph edges.
- If a repo-wide `npm test` is too broad for the handoff, the minimum QA command set is the three graph test files plus `npm run check` listed in the Integration Checkpoint.
