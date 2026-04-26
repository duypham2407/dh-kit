# Solution Package: Workspace Segmentation Consumer Alignment

**Date:** 2026-04-24
**Feature ID:** `WORKSPACE-SEGMENTATION-CONSUMER-ALIGNMENT`
**Approved scope:** `docs/scope/2026-04-24-workspace-segmentation-consumer-alignment.md`
**Baseline solution:** `docs/solution/2026-04-11-marker-driven-multi-workspace-segmentation-dh.md`
**Status:** ready for Fullstack execution

---

## Recommended Path

Harden the existing segmented-consumer path by making `resolveIndexedFileAbsolutePath(repoRoot, file)` the single authority for reading an `IndexedFile`, then verify every indexing, graph, retrieval, diagnostics, and operator-safe consumer either uses that helper or explicitly operates on already-canonical absolute paths.

This is enough because marker-driven segmentation, `workspaceRoot` propagation, and several workspace-aware readers already exist. The remaining delivery risk is not segmentation discovery; it is consistency: no consumer should silently reinterpret `IndexedFile.path` as repo-root-relative when `workspaceRoot` identifies a child workspace. Keep `IndexedFile.path` workspace-relative, keep graph/retrieval persisted display paths repo-relative where they already are, and add only the smallest diagnostics/display metadata needed to make workspace ownership visible.

Canonical operator-safe path display format for this work:

- Preserve existing readable target/path fields where callers already expect them.
- For segmented workspace context, display **repo-relative target path plus additive workspace metadata**: `workspaceRoot` as a canonical absolute path, `workspaceRelativePath` as the path relative to that workspace root, and `repoRelativePath` where an output already exposes repo-relative identity.
- Do **not** switch broad operator output to raw absolute file paths as the primary display form; use absolute `workspaceRoot` only as boundary metadata so operators can distinguish same relative paths in sibling workspaces.

Legacy or missing `workspaceRoot` fallback behavior:

- `resolveIndexedFileAbsolutePath(repoRoot, file)` may continue to treat missing `file.workspaceRoot` as `repoRoot` for legacy single-root indexed data and current single-root compatibility.
- Any segmented consumer input that has known multi-workspace context must treat missing `workspaceRoot` as degraded input: skip/report the affected file or diagnostic reason rather than guessing repo root.
- Boundary violations from `workspaceRoot + file.path` resolving outside the owning workspace must return `null` or a visible degraded/unsafe diagnostic; they must never be read silently.

---

## Impacted Surfaces

Exact files to inspect and, if needed, edit:

| Surface | File(s) | Responsibility / boundary |
|---|---|---|
| Shared path contract | `packages/intelligence/src/workspace/scan-paths.ts` | Keep `resolveIndexedFileAbsolutePath()` as the shared `(workspaceRoot, file.path)` resolver; add focused degraded/error helpers only if consumers need a visible reason. Preserve `IndexedFile.path` as workspace-relative. |
| Workspace scan truth source | `packages/intelligence/src/workspace/detect-projects.ts`; `packages/intelligence/src/workspace/detect-projects.test.ts` | Inspect only to confirm emitted files carry `workspaceRoot` and workspace-relative paths. Do not redesign marker discovery, marker set, scan budgets, or nested-root policy under this scope. |
| Graph indexing and deletion safety | `packages/intelligence/src/graph/graph-indexer.ts`; `packages/intelligence/src/graph/graph-indexer.test.ts` | Ensure graph reads, repo-relative node paths, target lookup, and partial-scan delete protection respect workspace-aware absolute resolution. Partial segmented scans must remain conservative. |
| Import resolution | `packages/intelligence/src/graph/extract-import-edges.ts`; `packages/intelligence/src/graph/extract-import-edges.test.ts`; `packages/intelligence/src/graph/module-resolver.ts`; `packages/intelligence/src/graph/module-resolver.test.ts` | Preserve alias/module boundary checks rooted at the source file's `workspaceRoot`. Do not broaden alias semantics beyond existing module-resolution scope. |
| Call extraction | `packages/intelligence/src/graph/extract-call-edges.ts`; `packages/intelligence/src/graph/extract-call-edges.test.ts`; `packages/intelligence/src/graph/extract-call-sites.ts`; `packages/intelligence/src/graph/extract-call-sites.test.ts` | Ensure call readers use workspace-aware file resolution and test child workspace files that would fail under `repoRoot + file.path`. |
| Symbol extraction | `packages/intelligence/src/parser/ast-symbol-extractor.ts`; `packages/intelligence/src/parser/ast-symbol-extractor.test.ts`; `packages/intelligence/src/symbols/extract-symbols.ts`; `packages/intelligence/src/symbols/extract-symbols.test.ts` | AST and regex fallback symbol extraction must read from `workspaceRoot + file.path` and handle unsafe/missing workspace data without crossing boundaries. |
| Retrieval chunking and result normalization | `packages/retrieval/src/semantic/chunker.ts`; `packages/retrieval/src/semantic/chunker.test.ts`; `packages/retrieval/src/query/run-retrieval.ts`; `packages/retrieval/src/query/run-retrieval.test.ts` | Chunk content must come from owning workspace root while chunk/result `filePath` remains the current canonical repo-relative display where expected. Preserve reduced-coverage signals. |
| Index-job diagnostics | `packages/runtime/src/jobs/index-job-runner.ts`; `packages/runtime/src/jobs/index-job-runner.test.ts` | Ensure `workspaceCount`, `workspaceCoverage`, partial status, stop reasons, and summary wording expose workspace-level truth without implying whole-repo failure for one partial workspace. |
| Operator-safe segmentation consumers | `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`; `packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`; `packages/runtime/src/workspace/operator-safe-project-worktree-snapshot.ts`; `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts`; `packages/shared/src/types/operator-worktree.ts` | Only align boundary checks and display/context metadata. Do not add shell orchestration, git lifecycle actions, reset/checkout flows, or project/worktree lifecycle parity. |
| Validation/tooling contract | `package.json` | Repo-real validation commands are `npm run check` and `npm run test`. Do not invent package-manager, lint, build, or CI commands. |

Technical risks to watch:

- Hidden fallback to `repoRoot + file.path` in readers that still accept `IndexedFile`.
- Duplicate workspace-relative paths across sibling workspaces if storage/display dedupes only by `file.path`.
- Overcorrecting display contracts to absolute paths and breaking existing repo-relative graph/retrieval expectations.
- Treating operator-safe utility alignment as permission to implement broader worktree lifecycle behavior.

---

## Implementation Slices

### Slice 1: Boundary resolver audit and legacy behavior freeze

- **Goal:** Freeze the resolver contract before touching consumers.
- **Files:** `packages/intelligence/src/workspace/scan-paths.ts`; `packages/intelligence/src/workspace/detect-projects.ts`; `packages/intelligence/src/workspace/detect-projects.test.ts`; targeted tests that construct `IndexedFile` inputs.
- **Work:**
  - Confirm `resolveIndexedFileAbsolutePath(repoRoot, file)` resolves from `file.workspaceRoot ?? repoRoot` and rejects `..`/absolute escape attempts.
  - Add or tighten tests for child workspace resolution, missing `workspaceRoot` single-root fallback, and boundary violation rejection.
  - If a consumer needs a reason instead of `null`, add a narrow helper or diagnostic wrapper without changing `IndexedFile.path` semantics.
- **Dependencies:** none.
- **Validation hook:** `npm run check`; `npm run test`.

### Slice 2: Graph, import, call, and symbol consumers

- **Goal:** Prove graph extraction reads and relates files from their owning workspace roots.
- **Files:** `packages/intelligence/src/graph/graph-indexer.ts`; `packages/intelligence/src/graph/extract-import-edges.ts`; `packages/intelligence/src/graph/extract-call-edges.ts`; `packages/intelligence/src/graph/extract-call-sites.ts`; `packages/intelligence/src/parser/ast-symbol-extractor.ts`; `packages/intelligence/src/symbols/extract-symbols.ts`; matching tests listed in Impacted Surfaces.
- **Work:**
  - Replace or reject any remaining direct `repoRoot + file.path` read pattern for `IndexedFile` consumers.
  - Keep graph node paths repo-relative through `toRepoRelativePath(repoRoot, resolvedAbsPath)` after workspace-aware resolution.
  - Add segmented fixture coverage where a child workspace file has the same workspace-relative path as a sibling/root file and would fail under repo-root resolution.
  - Preserve existing module alias boundary behavior that stops at `workspaceRoot` when available.
- **Dependencies:** Slice 1.
- **Validation hook:** `npm run check`; `npm run test`.

### Slice 3: Retrieval chunking and reduced-coverage visibility

- **Goal:** Keep semantic chunks and retrieval results anchored to the actual workspace-owned content while preserving existing result path compatibility.
- **Files:** `packages/retrieval/src/semantic/chunker.ts`; `packages/retrieval/src/semantic/chunker.test.ts`; `packages/retrieval/src/query/run-retrieval.ts`; `packages/retrieval/src/query/run-retrieval.test.ts`; storage chunk tests only if path metadata changes require them.
- **Work:**
  - Ensure `chunkFile()` and refresh filtering read content via `resolveIndexedFileAbsolutePath()`.
  - Keep chunk/result `filePath` in the current canonical repo-relative form unless an additive workspace metadata field is required for ambiguity.
  - Add tests proving child workspace content is chunked/retrieved correctly and reduced coverage remains visible for partial segmented scans.
- **Dependencies:** Slice 1; can start after resolver contract is frozen, but should integrate after Slice 2 to reuse fixture conventions.
- **Validation hook:** `npm run check`; `npm run test`.

### Slice 4: Diagnostics, summaries, and operator-safe path display

- **Goal:** Make segmented coverage and operator-safe boundaries truthful without adding lifecycle functionality.
- **Files:** `packages/runtime/src/jobs/index-job-runner.ts`; `packages/runtime/src/jobs/index-job-runner.test.ts`; `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`; `packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`; `packages/runtime/src/workspace/operator-safe-project-worktree-snapshot.ts`; `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts`; `packages/shared/src/types/operator-worktree.ts`.
- **Work:**
  - Keep `workspaceCount` and `workspaceCoverage` authoritative in index-job diagnostics and ensure summary text distinguishes per-workspace partial states.
  - In operator-safe context/report surfaces, expose the target as repo-relative where existing output does, plus `workspaceRoot` and `workspaceRelativePath` where a detected workspace owns the target.
  - Assert unsupported lifecycle operations remain blocked/advisory-only and no new shell orchestration commands are introduced.
- **Dependencies:** Slices 1-3 for final wording/evidence; limited test drafting can happen earlier.
- **Validation hook:** `npm run check`; `npm run test`.

Sequential/parallel assessment:

- Recommended execution is **mostly sequential**: Slice 1 -> Slice 2 -> Slice 3 -> Slice 4.
- Limited parallel work is safe only after Slice 1 freezes the resolver contract: graph tests and retrieval tests may be drafted in parallel if they do not edit shared helper semantics.
- Do not parallelize edits to `scan-paths.ts`, shared indexing types, or shared segmented fixtures. Those are integration-sensitive shared surfaces.
- Critical path: resolver contract and legacy fallback behavior first, then all file-reading consumers, then display/diagnostics polish.

---

## Validation Matrix

Repo-real validation commands:

- `npm run check`
- `npm run test`

No repo-native lint or build command is defined beyond the TypeScript check/test scripts above.

| Acceptance target | Validation path |
|---|---|
| AC-1 workspace-root file reads | Add/extend resolver and graph/indexing tests with child workspace files that fail under `repoRoot + file.path`; run `npm run test`. |
| AC-2 graph import/call/symbol extraction | Extend `graph-indexer`, import-edge, call-edge/call-site, AST symbol, and regex symbol tests; run `npm run test`. |
| AC-3 semantic chunking/retrieval | Extend `chunker.test.ts` and `run-retrieval.test.ts` for child workspace content and distinguishable path metadata; run `npm run test`. |
| AC-4 workspace-level diagnostics | Extend `index-job-runner.test.ts` for `workspaceCount`, `workspaceCoverage`, partial workspace stop reason, and summary wording; run `npm run test`. |
| AC-5 partial scan delete safety | Extend `graph-indexer.test.ts` to prove partial segmented scan suppresses unsafe stale cleanup for affected workspace data; run `npm run test`. |
| AC-6 single-root compatibility | Keep existing single-root tests green and add fallback assertion for missing `workspaceRoot`; run `npm run test`. |
| AC-7 path escape rejection | Add boundary tests for `../` or normalized escape in `resolveIndexedFileAbsolutePath()` and at least one consumer-level degraded path; run `npm run test`. |
| AC-8 operator-safe boundary output | Extend operator-safe utility/snapshot tests to assert repo-relative target display plus `workspaceRoot`/workspace-relative context and no lifecycle expansion; run `npm run test`. |
| AC-9 wording and scope boundary | Manual review of changed docs/runtime strings plus snapshot assertions where available; verify no project/worktree lifecycle parity or shell orchestration claims. |
| AC-10 repository validation | Run `npm run check` and `npm run test`; record actual outcomes in Fullstack handoff. |

Reviewer focus points:

- Search for remaining direct `path.join(repoRoot, file.path)` or equivalent `repoRoot + IndexedFile.path` assumptions in `packages/**`.
- Verify `IndexedFile.path` is never converted to repo-relative identity before combining with `workspaceRoot` for reads.
- Verify graph/retrieval persisted paths remain compatible for single-root callers.
- Verify missing `workspaceRoot` fallback is only legacy/single-root compatible, not used to flatten segmented data.

---

## Integration Checkpoint

Before Code Review and QA, Fullstack must demonstrate one segmented fixture or equivalent test setup where:

- Two detected workspaces contain at least one same workspace-relative path or a child workspace path that would be wrong under `repoRoot + file.path`.
- Graph indexing extracts imports/symbols/calls from the child workspace file using `workspaceRoot + file.path`.
- Retrieval chunking returns content from the child workspace file, while result path display remains compatible and distinguishable.
- Index-job diagnostics show workspace count and per-workspace partial/stop-reason truth where applicable.
- Operator-safe output shows the target with repo-relative display plus additive workspace boundary metadata and no lifecycle/shell orchestration expansion.

Responsibilities and boundaries:

- **FullstackAgent must preserve:** `workspaceRoot` as boundary authority, `IndexedFile.path` as workspace-relative, single-root fallback behavior, conservative partial-scan delete safety, and out-of-scope lifecycle boundaries.
- **Code Reviewer must verify:** every affected consumer resolves indexed-file reads through the shared workspace-aware contract; no broad graph/retrieval/worktree redesign was introduced; display changes are additive and truthful.
- **QAAgent must verify:** segmented fixture behavior, single-root compatibility, reduced-coverage visibility, operator-safe boundary presentation, and absence of shell/lifecycle claims.

Blockers for Fullstack execution: none identified. If implementation discovers an affected consumer that cannot safely access `workspaceRoot`, stop and route back to Solution Lead rather than flattening to repo-root behavior.
