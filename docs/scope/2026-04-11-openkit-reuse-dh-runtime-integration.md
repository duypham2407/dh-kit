# Scope Package: OpenKit Reuse — DH Runtime Integration

Date: 2026-04-11
Owner: DH runtime/intelligence team
Execution drivers:
- `docs/architecture/openkit-reuse-dh-runtime-integration-checklist.md` (10-phase checklist, P0-P9)
- `docs/architecture/openkit-reuse-integration-plan.md` (architecture plan, 3 migration phases)
Target packages: `packages/storage/`, `packages/intelligence/`, `packages/runtime/`

---

## Problem Statement

DH's code-understanding layer is currently regex-based and lacks the structured data backbone needed to answer cross-file questions reliably. Three concrete gaps exist:

1. **No graph DB** — DH's SQLite schema (`packages/storage/src/sqlite/db.ts`) has tables for workflow, audit, chunks, and embeddings but zero graph tables. There is no structured way to query "which files import X", "who calls function Y", or "where is symbol Z referenced" — all answers require full-text regex scanning at query time.
2. **Regex-only extraction** — `extract-import-edges.ts` uses a single regex (`/^\s*import\s+.*?from\s+["'](.+?)["'];?/gm`) that misses `require()`, dynamic `import()`, re-exports, type-only imports, and side-effect imports. `extract-call-edges.ts` and `extract-call-sites.ts` use `\bname\s*\(` text matching that cannot distinguish real call expressions from comments, strings, or property accesses, and cannot resolve callees to specific files/symbols.
3. **No runtime enforcement** — DH has no `pre_tool_exec` hook blocking OS commands on source files and no `pre_answer` evidence gating. AI can freely use `grep`, `cat`, `find` on source code instead of structural tools, and can answer structural questions without graph evidence.

The user value: when AI in DH answers "who calls this function" or "what does this file depend on", the answer must come from parsed AST data in a queryable graph, not from regex guesses. And the runtime must enforce this preference instead of relying on prompt suggestions alone.

---

## Current State vs Target State

| Dimension | Current state | Target state |
|---|---|---|
| Graph schema | Zero graph tables in `bootstrapDhDatabase()` | Five `graph_*` tables (nodes, edges, symbols, symbol_references, calls) with indexes and FK cascades |
| Import extraction | Single regex in `extract-import-edges.ts` (23 lines); misses require, dynamic import, re-exports, type imports | AST-walk strategy via `web-tree-sitter`; covers static, dynamic, require, re-export, type-only, side-effect imports; resolves specifiers to absolute paths |
| Call graph extraction | Regex `\bname\s*\(` in `extract-call-edges.ts` (78 lines); file-level only, no caller-callee symbol resolution | AST-walk extraction at symbol level; resolves callees via import map + DB lookup; persists to `graph_calls` table |
| Reference tracking | Not implemented | AST-walk identifier collection with imported-name mapping, lexical scope tracking, declaration-vs-usage distinction; persists to `graph_symbol_references` |
| Graph query tools | None | DH-native tools: `dh.find-dependencies`, `dh.find-dependents`, `dh.find-symbol`, `dh.find-references`, `dh.call-hierarchy`, `dh.goto-definition`, `dh.syntax-outline`, `dh.ast-search`, `dh.rename-preview`, `dh.import-graph` |
| Bash guard / enforcement | Not implemented; no `hooks/` directory in `packages/runtime/src/` | `pre_tool_exec` blocks OS commands on source files (strict mode default), suggests DH tool alternatives |
| Evidence gating | Not implemented | `pre_answer` checks structural evidence before allowing answers to dependency/reference/call questions |
| Incremental indexing | Not implemented | Content-hash/mtime-based; only re-indexes changed files |
| Repository layer | No graph repo | `graph-repo.ts` with prepared statements for all graph CRUD operations |
| Indexer orchestration | No graph indexer | `graph-indexer.ts` orchestrates parse -> symbols -> imports -> references -> calls -> persist |

---

## In Scope

All items below correspond to the 10 phases (P0-P9) in the execution checklist. Each phase maps to specific deliverables.

### Phase P0 — Baseline inventory and destination mapping
- Inventory all DH files related to storage schema, intelligence graph extraction, runtime hooks, and tool surfaces.
- Create 1:1 mapping from OpenKit source references in the plan to DH target paths.
- Finalize "port" vs "do not port" list per the plan's exclusion table.
- Assign phase ownership (Storage / Intelligence / Runtime / Tooling / Docs).
- Produce a baseline artifact for session continuity.

### Phase P1 — Graph DB schema groundwork
- Add five `graph_*` tables (`graph_nodes`, `graph_edges`, `graph_symbols`, `graph_symbol_references`, `graph_calls`) as additive migration in `bootstrapDhDatabase()`.
- Add required indexes for dependency/reference/call queries.
- Verify FK `ON DELETE CASCADE` works correctly.
- Create repository layer (`graph-repo.ts`) with prepared statements in `packages/storage/src/sqlite/repositories/`.
- Use `TEXT` IDs with `createId()` per DH convention.
- Write smoke validation: insert/query round-trip for nodes, symbols, edges, references, calls.

### Phase P2 — AST import graph
- Rewrite `extract-import-edges.ts` to use tree-sitter AST walk instead of regex.
- Cover: static import, side-effect import, re-export from, type-only import, `require()`, dynamic `import()`.
- Implement module resolution for relative paths with extension and index file fallback.
- Persist edges to `graph_edges` and verify correctness with real queries.
- Compare regex-old vs AST-new output on the same file set to measure coverage delta.

### Phase P3 — AST call graph
- Create `extract-call-graph.ts` using AST walk in `packages/intelligence/src/graph/`.
- Identify callable symbols (function, method, arrow function, constructor).
- Extract call expressions within each callable body.
- Resolve callees via import map and DB symbol lookup where possible.
- Persist to `graph_calls` with caller_symbol_id, callee_name, callee_node_id, callee_symbol_id.
- Validate with member calls, local calls, and unresolved calls.

### Phase P4 — Reference tracking
- Create `reference-tracker.ts` in `packages/intelligence/src/graph/`.
- Build imported-name map from import declarations.
- Apply basic lexical scope tracking to reduce false positives from shadowing.
- Distinguish declaration site vs usage site and type-reference vs value-reference.
- Persist to `graph_symbol_references` and verify with cross-file queries.

### Phase P5 — Syntax index manager and parser cache
- Design or update `graph-indexer.ts` orchestration: parse -> symbols -> imports -> references -> calls -> persist.
- Attach parser cache keyed by file content-hash/mtime to avoid redundant parsing.
- Implement incremental indexing: only re-index changed files.
- Handle file deletion/rename by clearing stale graph data.
- Benchmark full vs incremental indexing on DH repo.

### Phase P6 — DH-native tool family surface
- Register P0 tools: `dh.find-dependencies`, `dh.find-dependents`, `dh.find-symbol`, `dh.find-references`.
- Register P1 tools: `dh.call-hierarchy`, `dh.goto-definition`, `dh.syntax-outline`.
- Register P2 tools: `dh.ast-search`, `dh.rename-preview`, `dh.import-graph`.
- Standardize output format (path, symbol, line/col, confidence note for unresolved).
- Unified error handling (tool unavailable, index stale, symbol not found).

### Phase P7 — pre_tool_exec / pre_answer enforcement
- Port bash guard policy to DH: strict default, advisory fallback for debug.
- Wire bash guard into `pre_tool_exec` via Go-TS bridge.
- Add suggestion mapping from blocked commands to DH tool alternatives.
- Add advisory tool-preference nudging when AI uses generic tools for structural tasks.
- Implement `pre_answer` evidence gating for structural intent (dependency/reference/call).
- Log tool usage audit for adoption analysis.

### Phase P8 — Retrieval/runtime integration
- Define how graph evidence combines with existing retrieval pipeline (additive, not replacing embedding pipeline).
- Set minimum evidence threshold for structural answers.
- Handle fallback when graph is not indexed or stale.
- Add clear runtime guardrail messages when evidence is insufficient.
- Run scenario tests: "who calls function X", "what does file Y depend on", "refactor Z impact".

### Phase P9 — Docs, validation, handoff
- Update architecture docs if contract or tool IDs changed.
- Add operations checklist for index/reindex/debug enforcement.
- Compile validation evidence per phase with links to tests/logs/queries.
- Record outstanding risks and deferred decisions.
- Finalize overall status and conditions for next optimization cycle.

---

## Out of Scope

- **No OpenKit package imports.** DH does not depend on or import any OpenKit npm package/module. Port means read-understand-rewrite in TypeScript, not copy or wrap.
- **No OpenKit runtime wiring.** Do not port workflow kernel, hook composition factory, tool registry, session hooks, skill hooks, capability registry, or OpenCode layering adapter from OpenKit.
- **No engine replacement.** DH uses `node:sqlite` (DatabaseSync) and `web-tree-sitter` + `tree-sitter-wasms`. Do not introduce `better-sqlite3` or native tree-sitter bindings.
- **No embedding pipeline replacement.** The existing `packages/retrieval/` embedding pipeline is not modified. Graph evidence is additive.
- **No Go runtime modification.** Hook enforcement logic lives in TypeScript called via bridge. Go core hooks and bridge are not modified in this scope.
- **No tool implementation copy.** DH builds its own tools on top of the new graph DB. OpenKit tool source code in `src/runtime/tools/` is reference only.
- **No workflow or lane policy changes.** This work does not modify DH session, workflow, or lane semantics.

---

## Business Rules

1. **DH owns all code.** Every line produced in this work is DH-owned TypeScript. No runtime dependency on OpenKit. OpenKit source is read-reference only.
2. **Additive schema only.** Graph tables use `CREATE TABLE IF NOT EXISTS`. No modification to existing DH tables. No breaking migration.
3. **DH ID convention.** All graph table primary keys use `TEXT` type with `createId()` from `packages/shared/src/utils/ids.ts`. No INTEGER autoincrement.
4. **Enforcement is graduated.** Bash guard starts in advisory mode during development, moves to strict once replacement tools are usable. Do not enable strict enforcement before P6 tools exist.
5. **Incremental indexing required before production use.** Full-repo re-index on every session is not acceptable. Content-hash/mtime gating must be in place (P5) before daily-use rollout.
6. **Evidence before completion.** No checklist item can be marked `[Completed]` without validation evidence (query result, test output, or log).
7. **Existing extractors preserved until replacement proven.** `extract-import-edges.ts` and `extract-call-edges.ts` are rewritten in-place only after the AST replacement demonstrates superior coverage on the same file set.

---

## Acceptance Criteria Matrix

Each criterion maps to Definition of Done items from the checklist and plan. All must be true for completion.

| # | Criterion | Source reference | Observable check |
|---|---|---|---|
| AC-1 | Five `graph_*` tables exist in DH SQLite schema with indexes and FK cascades | Checklist P1, Plan DoD P0 | `bootstrapDhDatabase()` creates tables; smoke insert/query round-trip succeeds |
| AC-2 | `graph-repo.ts` provides prepared-statement CRUD for all five graph tables | Checklist P1 | Repository exports NodeRepo, EdgeRepo, SymbolRepo, ReferenceRepo, CallRepo operations (or unified GraphRepo) |
| AC-3 | Import extraction uses tree-sitter AST walk covering static, dynamic, require, re-export, type-only, side-effect imports | Checklist P2, Plan DoD P0 | Comparison test: AST extractor finds strictly more valid edges than regex extractor on the same file set, with zero regressions on previously-detected edges |
| AC-4 | Module resolution resolves relative paths to absolute with extension and index file fallback | Checklist P2, Plan DoD P0 | Resolution test: `./foo` resolves to `foo.ts`, `foo/index.ts`, or correct extension variant |
| AC-5 | Call graph extraction uses AST walk at symbol level with callee resolution via import map and DB | Checklist P3, Plan DoD P1 | `graph_calls` table contains caller_symbol_id → callee entries; member calls (`foo.bar()`) are captured |
| AC-6 | Reference tracking distinguishes declaration vs usage, handles cross-file references via imported-name map | Checklist P4, Plan DoD P1 | `graph_symbol_references` contains usage-site entries for symbols imported from other files; false positives from local shadowing are reduced compared to naive approach |
| AC-7 | `graph-indexer.ts` orchestrates full pipeline: parse -> symbols -> imports -> references -> calls -> persist | Checklist P5 | Indexing DH repo populates all five graph tables with consistent data |
| AC-8 | Incremental indexing re-indexes only changed files based on content-hash or mtime | Checklist P5 | After indexing, modifying one file and re-indexing takes < 1 second (not full re-index) |
| AC-9 | P0 DH tools operational: `dh.find-dependencies`, `dh.find-dependents`, `dh.find-symbol`, `dh.find-references` | Checklist P6, Plan DoD P0/P1 | Each tool returns correct results when queried against indexed DH repo |
| AC-10 | P1 DH tools operational: `dh.call-hierarchy`, `dh.goto-definition`, `dh.syntax-outline` | Checklist P6, Plan DoD P1 | `dh.call-hierarchy functionX` returns callers and callees from graph data |
| AC-11 | Bash guard blocks OS commands on source files at `pre_tool_exec` with DH tool suggestions | Checklist P7, Plan DoD P1 | `grep -r 'auth' src/` is blocked with suggestion to use `dh.find-references` or Grep tool; `git status` passes through |
| AC-12 | `pre_answer` evidence gating checks structural evidence before allowing answers to dependency/reference/call questions | Checklist P7, Plan DoD P2 | Answer to "who calls function X" without prior `dh.call-hierarchy` call triggers warning |
| AC-13 | Graph evidence integrates with retrieval pipeline without replacing embedding pipeline | Checklist P8 | Existing embedding-based search continues working; graph tools provide additive structured evidence |
| AC-14 | Architecture docs, operations checklist, and validation evidence are updated and linked | Checklist P9 | No orphaned checklist items; each completed phase has evidence pointer |
| AC-15 | `vitest run` passes for all new graph-related test files | Plan DoD all phases | CI-equivalent test run shows green for graph-repo, import extraction, call graph, reference tracking tests |

---

## Key Risks and Assumptions

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **`node:sqlite` performance on large graphs** — `node:sqlite` DatabaseSync is newer and less battle-tested than `better-sqlite3` | Query latency may exceed acceptable thresholds for p95 on projects with 1000+ files | Benchmark in P1 smoke validation; if unacceptable, evaluate query optimization or batch strategies before escalating to engine change |
| **`web-tree-sitter` WASM parse speed** — WASM tree-sitter is 3-5x slower than native bindings | Full-repo indexing may be slow on large projects | Incremental indexing (P5) is the primary mitigation; batch parsing if needed; accept WASM tradeoff since DH has committed to it |
| **Module resolution accuracy** — tsconfig path aliases, monorepo refs, subpath exports are hard | Import graph has gaps for non-relative imports | P2 targets relative paths only; tsconfig paths and bare specifier resolution are deferred to a follow-up; unresolved specifiers return null |
| **False positives in reference tracking** — tree-sitter CST is not a type-checker; lexical scope tracking is imperfect | `dh.find-references` may report phantom usages | Prefer precision over recall; only link when match is unambiguous; port lexical scope tracking from OpenKit reference implementation |
| **Go bridge latency for enforcement hooks** — each tool call round-trips Go -> TS -> enforcement -> Go | Added latency per tool call | Bash guard logic is lightweight regex matching (< 1ms expected); measure in P7; fall back to Go-native guard if bridge overhead is excessive |
| **Schema migration safety** — DH already has a running SQLite DB with production tables | Additive migration could interact with existing data or constraints | All graph tables are `CREATE IF NOT EXISTS` with `graph_` prefix; no existing tables modified; no cross-table FKs to existing tables |
| **Adoption friction** — AI may still prefer OS commands if graph tools are slow or output is hard to parse | Enforcement value is reduced if tools are unusable | This is why enforcement is graduated: advisory first, strict only after tools prove usable; output format must be clear and consistent |

### Assumptions

1. DH's `web-tree-sitter` + `tree-sitter-wasms` parser stack is operational and can parse TS/TSX/JS/JSX files used by the graph extractors.
2. The Go-TS bridge used by DH hooks (`pre_tool_exec`, `pre_answer`) exists and can invoke TypeScript enforcement logic. If the bridge does not yet support these hook points, wiring them is a prerequisite that may belong to a separate scope.
3. `packages/storage/src/sqlite/db.ts` `bootstrapDhDatabase()` is the correct and only place to add graph schema DDL.
4. `vitest` is available as the test runner (`vitest.config.ts` exists at repo root).
5. No other team is concurrently modifying the graph extraction or storage schema areas.
6. The `tool_usage_audit` table already exists in DH schema and can be used for enforcement audit logging without modification.
7. OpenKit source files referenced in the plan (`import-graph-builder.js`, `call-graph-builder.js`, `reference-tracker.js`, `project-graph-db.js`, `bash-guard-hook.js`) are accessible as read-references during development.

---

## Execution Sequencing Expectations

```
P0 (Baseline inventory)
  |
  v
P1 (Graph DB schema)       <- hard prerequisite for all extraction phases
  |
  +------+------+
  |      |      |
  v      v      v
P2     P3     P4           <- can run in parallel after P1; all are extraction
(import) (call) (reference)
  |      |      |
  +------+------+
         |
         v
P5 (Index manager / cache) <- needs stable extractors; enables incremental
  |
  v
P6 (DH tool surface)       <- needs graph data to be correct and queryable
  |
  v
P7 (Enforcement hooks)     <- needs P6 tools to exist before strict mode
  |
  v
P8 (Retrieval integration) <- needs enforcement + tools for full loop
  |
  v
P9 (Docs + validation)     <- final gate
```

### Hard sequencing rules (from checklist section 6)
- P1 must complete before P2, P3, or P4 (schema + repo layer required to persist data).
- P2 + P3 + P4 must be stable before P6 (tool surface depends on correct graph data).
- P6 must have at least P0 tools registered before P7 enables strict enforcement.
- P7 should graduate: advisory first, strict after replacement tools are confirmed usable.
- P5 incremental indexing should complete before any production-like rollout.

### Recommended sprint grouping (from checklist)
- Sprint A: P0 + P1
- Sprint B: P2 + P3
- Sprint C: P4 + P5
- Sprint D: P6 + P7
- Sprint E: P8 + P9

### Parallel opportunities
- P2, P3, P4 are independent extraction workstreams that can proceed in parallel once P1 is done.
- P9 doc preparation can start alongside P8 but finalizes only after P8 outcomes.

---

## Handoff Notes for Solution Lead

1. The execution checklist at `docs/architecture/openkit-reuse-dh-runtime-integration-checklist.md` is the primary task tracker. Solution design should map implementation tasks to checklist items, not create a parallel structure.
2. P1 (Graph DB schema) is the foundation. Get it right before anything else. The schema SQL in the integration plan (section "Storage/schema") is a vetted starting point — adapt for any DH conventions missed.
3. P2 (import extraction rewrite) is the highest-risk extraction phase because module resolution accuracy directly affects all downstream tools. Start with relative-path resolution only; defer tsconfig paths to a follow-up.
4. The existing `extract-import-edges.ts` (23 lines, regex) and `extract-call-edges.ts` (78 lines, regex) must be preserved until their AST replacements demonstrate strictly better coverage. Do not delete old code before comparison evidence exists.
5. `packages/runtime/src/` currently has no `hooks/` directory. P7 will need to create this path and wire it into the Go bridge. Confirm bridge hook-point availability early (Sprint A ideally) to avoid P7 becoming a blocker.
6. The `IndexedEdge` type in `packages/shared/src/types/indexing.ts` may need extension to support the richer edge data from AST extraction (e.g., line numbers, edge subtypes). Evaluate during P1/P2 whether to extend the existing type or introduce graph-specific types.
7. Validation strategy: use `vitest` for unit/integration tests on repos and extractors; use manual query verification against the DH repo itself for end-to-end validation; use `tsc --noEmit` for type safety.
