# Solution Package: OpenKit Reuse — DH Runtime Integration

**Date:** 2026-04-11
**Upstream scope:** `docs/scope/2026-04-11-openkit-reuse-dh-runtime-integration.md`
**Execution tracker:** `docs/architecture/openkit-reuse-dh-runtime-integration-checklist.md`
**Architecture plan:** `docs/architecture/openkit-reuse-integration-plan.md`
**Target packages:** `packages/storage/`, `packages/intelligence/`, `packages/runtime/`, `packages/shared/`

---

## Recommended Path

Port OpenKit's graph intelligence layer into DH as native TypeScript, using DH's existing engine choices (`node:sqlite` DatabaseSync, `web-tree-sitter` + `tree-sitter-wasms`), in five sequential slices:

1. **Schema + repository layer** — additive graph tables in `bootstrapDhDatabase()` with a typed `GraphRepo` class.
2. **AST extraction rewrite** — replace regex-based import/call/reference extraction with tree-sitter AST walks, reusing DH's existing parser infrastructure (`packages/intelligence/src/parser/`).
3. **Index orchestration** — build `graph-indexer.ts` with content-hash incremental support.
4. **DH-native tool surface** — register `dh.*` tools in the Go tool registry, backed by graph queries.
5. **Enforcement hooks** — write TS bash-guard and evidence-gating logic that writes decisions to `hook_invocation_logs`, read by the existing Go bridge (`BridgePreToolExecHook`, `BridgePreAnswerHook`).

This is enough because:
- DH already has the tree-sitter parser stack operational (`tree-sitter-init.ts`, `ast-symbol-extractor.ts`).
- DH already has the Go-TS enforcement bridge working via shared SQLite (`bridge.go`, `bridge_hooks.go`, `hooks_registry.go`).
- The `hook_invocation_logs` and `tool_usage_audit` tables already exist, so enforcement decisions have a persistence path without schema changes.
- `vitest` is configured and running (`vitest.config.ts` at repo root).

---

## Dependencies

- **No new npm packages.** All work uses `node:sqlite`, `web-tree-sitter`, `tree-sitter-wasms` (all already in DH).
- **No new environment variables.**
- **No Go core changes required** for Slices 1-3. Slice 4 (tools) requires new Go tool implementations in `packages/opencode-core/internal/llm/tools/`. Slice 5 (enforcement) uses the existing bridge path with no Go-side changes.
- **Validation tooling available:** `vitest run` (unit/integration), `tsc --noEmit` (type safety).

---

## Architecture Decisions

### AD-1: Unified `GraphRepo` class, not per-table repos

The plan suggests either a unified `GraphRepo` or separate `GraphNodeRepo`/`GraphEdgeRepo`/etc. **Decision: single `GraphRepo` class.** Rationale: graph operations are transactional across tables (e.g., replacing all data for a node requires clearing edges, symbols, references, calls in one transaction). A single class with a shared `DatabaseSync` handle is simpler and avoids cross-repo coordination. This follows the pattern of DH's other repos (e.g., `HookInvocationLogsRepo`).

### AD-2: Extend `IndexedEdge` type minimally, introduce graph-specific types for new tables

The existing `IndexedEdge` type in `packages/shared/src/types/indexing.ts` serves the current regex pipeline. Rather than breaking that contract, introduce new types in a new `packages/shared/src/types/graph.ts` for the richer graph data (nodes with `content_hash`/`mtime`/`parse_status`, symbols with `is_export`/`signature`/`scope`, references with `col`/`kind`, calls with `callee_symbol_id`). The old `IndexedEdge`/`IndexedSymbol` types remain for backward compatibility with any consumers.

### AD-3: Rewrite extractors in-place only after comparison evidence

Per scope business rule 7, `extract-import-edges.ts` and `extract-call-edges.ts` keep their current regex implementations until AST replacements prove superior. Implementation pattern: create new AST-based functions alongside the old ones, run comparison, then swap the export once evidence confirms.

### AD-4: Enforcement via TS decision writes, not Go modification

DH's enforcement bridge already works: TS writes `hook_invocation_logs` rows with `decision: "block"/"allow"`, Go reads them via `BridgePreToolExecHook`. The bash guard will be a TS function that evaluates the command, writes the decision to `hook_invocation_logs`, and the existing Go hook reads it. No Go-side code changes for enforcement. New Go code is only needed for the tool surface (Slice 4).

### AD-5: DH tool IDs use `dh.` prefix, registered in Go tool registry

DH tools are Go `BaseTool` implementations in `packages/opencode-core/internal/llm/tools/`. Each graph tool reads from the shared SQLite DB directly (using the Go SQLite driver) or invokes a TS bridge endpoint. The simplest path: Go tools read the `graph_*` tables directly since Go already has a SQLite reader (`sqlite_reader.go`).

### AD-6: Incremental indexing via `content_hash` on `graph_nodes`

The `graph_nodes.content_hash` column enables skip-if-unchanged semantics. On each index run, compute file hash, compare against stored hash, skip if unchanged. File deletions are detected by diffing the current file list against `graph_nodes` paths and cascading deletes via FK.

---

## Impacted Surfaces

### Storage layer — `packages/storage/`

| File | Change |
|---|---|
| `packages/storage/src/sqlite/db.ts` | Add graph DDL to `bootstrapDhDatabase()` (additive, ~70 lines SQL) |
| `packages/storage/src/sqlite/repositories/graph-repo.ts` | **New file.** `GraphRepo` class with prepared-statement CRUD for all 5 graph tables |
| `packages/storage/src/sqlite/repositories/graph-repo.test.ts` | **New file.** Smoke tests: insert/query round-trip for nodes, edges, symbols, refs, calls; FK cascade test |

### Intelligence layer — `packages/intelligence/`

| File | Change |
|---|---|
| `packages/intelligence/src/graph/extract-import-edges.ts` | Add AST-based `extractImportEdgesAST()` alongside existing `extractImportEdges()`. Swap export after comparison. |
| `packages/intelligence/src/graph/extract-import-edges.test.ts` | **New file.** Tests for AST extraction covering static, dynamic, require, re-export, type-only, side-effect imports |
| `packages/intelligence/src/graph/module-resolver.ts` | **New file.** Resolve relative import specifiers to absolute paths with extension/index fallback |
| `packages/intelligence/src/graph/module-resolver.test.ts` | **New file.** Resolution tests for `.ts`, `.tsx`, `.js`, index file variants |
| `packages/intelligence/src/graph/extract-call-graph.ts` | **New file.** AST-based call graph extraction at symbol level |
| `packages/intelligence/src/graph/extract-call-graph.test.ts` | **New file.** Tests for member calls, local calls, unresolved calls |
| `packages/intelligence/src/graph/reference-tracker.ts` | **New file.** AST-based reference tracking with imported-name mapping and lexical scope |
| `packages/intelligence/src/graph/reference-tracker.test.ts` | **New file.** Tests for cross-file refs, shadowing, declaration-vs-usage distinction |
| `packages/intelligence/src/graph/graph-indexer.ts` | **New file.** Orchestrates: parse -> symbols -> imports -> references -> calls -> persist to `GraphRepo` |
| `packages/intelligence/src/graph/graph-indexer.test.ts` | **New file.** Integration test: index a small fixture project, verify all graph tables populated |

### Shared types — `packages/shared/`

| File | Change |
|---|---|
| `packages/shared/src/types/graph.ts` | **New file.** Types: `GraphNode`, `GraphEdge`, `GraphSymbol`, `GraphSymbolReference`, `GraphCall`, `GraphIndexerOptions` |

### Runtime/enforcement layer — `packages/runtime/`

| File | Change |
|---|---|
| `packages/runtime/src/hooks/bash-guard.ts` | **New file.** Bash guard policy: substitution rules, allowed prefixes, enforcement level config |
| `packages/runtime/src/hooks/bash-guard.test.ts` | **New file.** Tests: blocked commands, allowed commands, suggestion mapping |
| `packages/runtime/src/hooks/evidence-gate.ts` | **New file.** Pre-answer evidence gating: intent detection, tool-usage check, evidence score evaluation |
| `packages/runtime/src/hooks/evidence-gate.test.ts` | **New file.** Tests: structural intent detection, missing evidence warning |
| `packages/runtime/src/hooks/enforcement-writer.ts` | **New file.** Writes enforcement decisions to `hook_invocation_logs` via `HookInvocationLogsRepo` |

### Go tool layer — `packages/opencode-core/`

| File | Change |
|---|---|
| `packages/opencode-core/internal/llm/tools/graph_find_dependencies.go` | **New file.** `dh.find-dependencies` tool |
| `packages/opencode-core/internal/llm/tools/graph_find_dependents.go` | **New file.** `dh.find-dependents` tool |
| `packages/opencode-core/internal/llm/tools/graph_find_symbol.go` | **New file.** `dh.find-symbol` tool |
| `packages/opencode-core/internal/llm/tools/graph_find_references.go` | **New file.** `dh.find-references` tool |
| `packages/opencode-core/internal/llm/tools/graph_call_hierarchy.go` | **New file.** `dh.call-hierarchy` tool |
| `packages/opencode-core/internal/llm/tools/graph_goto_definition.go` | **New file.** `dh.goto-definition` tool |
| `packages/opencode-core/internal/llm/tools/graph_syntax_outline.go` | **New file.** `dh.syntax-outline` tool |
| `packages/opencode-core/internal/llm/tools/graph_tools_test.go` | **New file.** Go tests for graph tools |

---

## Solution Slices

### [ ] Slice 1: Graph DB schema + repository layer (maps to checklist P0 + P1)

**Goal:** Establish the graph persistence foundation. All subsequent slices depend on this.

**Files:**
- `packages/storage/src/sqlite/db.ts` — add graph DDL
- `packages/storage/src/sqlite/repositories/graph-repo.ts` — new
- `packages/storage/src/sqlite/repositories/graph-repo.test.ts` — new
- `packages/shared/src/types/graph.ts` — new

**Implementation details:**

1. Add the five `graph_*` table DDL statements from the architecture plan (section "Storage/schema") into `bootstrapDhDatabase()` after the existing `embeddings` table block. Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` — purely additive, no modification to existing tables.

2. Create `packages/shared/src/types/graph.ts` with typed interfaces:
   ```
   GraphNode { id, path, kind, language, contentHash, mtime, parseStatus, updatedAt }
   GraphEdge { id, fromNodeId, toNodeId, edgeType, line }
   GraphSymbol { id, nodeId, name, kind, isExport, line, startLine, endLine, signature, docComment, scope }
   GraphSymbolReference { id, symbolId, nodeId, line, col, kind }
   GraphCall { id, callerSymbolId, calleeName, calleeNodeId, calleeSymbolId, line }
   ```
   All `id` fields are `string` (TEXT), generated by `createId()`.

3. Create `GraphRepo` class in `packages/storage/src/sqlite/repositories/graph-repo.ts`:
   - Constructor takes `repoRoot: string`, uses `openDhDatabase(repoRoot)`.
   - Prepared statements for: `upsertNode`, `deleteNode`, `findNodeByPath`, `replaceEdgesForNode`, `findDependencies(nodeId)`, `findDependents(nodeId)`, `replaceSymbolsForNode`, `findSymbolByName`, `findSymbolsByNode`, `replaceReferencesForNode`, `findReferencesBySymbol`, `replaceCallsForNode`, `findCallers(symbolId)`, `findCallees(symbolId)`.
   - Transaction wrapper for bulk operations (`replaceAllForNode` — clears and re-inserts edges, symbols, refs, calls for one file in a single transaction).

4. Write `graph-repo.test.ts`: insert a node, add symbols, add edges between two nodes, add references, add calls. Query back and verify. Test FK cascade: delete node → verify edges/symbols/refs/calls are gone.

**Validation:**
- `vitest run packages/storage/src/sqlite/repositories/graph-repo.test.ts`
- `tsc --noEmit`

**Reviewer focus:** Schema SQL matches plan exactly. `createId()` usage is consistent. Prepared statements use parameter binding (no string interpolation). FK cascade tested.

---

### [ ] Slice 2: AST extraction rewrite (maps to checklist P2 + P3 + P4)

**Goal:** Replace regex-based extraction with tree-sitter AST walks for imports, calls, and references. This is the highest-risk slice due to module resolution accuracy.

**Files:**
- `packages/intelligence/src/graph/extract-import-edges.ts` — add AST version
- `packages/intelligence/src/graph/extract-import-edges.test.ts` — new
- `packages/intelligence/src/graph/module-resolver.ts` — new
- `packages/intelligence/src/graph/module-resolver.test.ts` — new
- `packages/intelligence/src/graph/extract-call-graph.ts` — new
- `packages/intelligence/src/graph/extract-call-graph.test.ts` — new
- `packages/intelligence/src/graph/reference-tracker.ts` — new
- `packages/intelligence/src/graph/reference-tracker.test.ts` — new

**Implementation details:**

**2a. AST import extraction:**
- Add `extractImportEdgesAST(repoRoot, files, graphRepo)` function to `extract-import-edges.ts`.
- Uses `parseSource()` from `tree-sitter-init.ts` (already working in DH).
- Walk tree-sitter CST nodes: `import_statement`, `import_clause`, `export_statement` (for re-exports), `call_expression` (for `require()` and dynamic `import()`).
- For each import specifier, call `moduleResolver.resolve(specifier, containingFile)` to get the absolute target path.
- Persist results as `GraphEdge` rows via `GraphRepo.replaceEdgesForNode()`.
- Keep the old `extractImportEdges()` function unchanged. Export both. Run comparison.

**2b. Module resolver:**
- Input: specifier string + containing file path.
- For relative specifiers (`./`, `../`): resolve against the containing file's directory, try extensions `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, then try `index.ts`/`index.js` in directory.
- For bare specifiers (npm packages): return `null` — out of scope per risk mitigation. Log unresolved.
- For `@/` or `~/` aliases: return `null` initially — deferred to follow-up. Log unresolved.

**2c. AST call graph:**
- New `extract-call-graph.ts` in `packages/intelligence/src/graph/`.
- Input: parsed tree + symbol list (from `ast-symbol-extractor.ts`) + import edge list + `GraphRepo`.
- Walk each callable symbol's body (function, method, arrow function, constructor).
- For each `call_expression` node: extract callee name, check if it's a member expression (`foo.bar()` → callee = `bar`, object = `foo`), resolve against import map and DB symbols.
- Output: `GraphCall[]` rows with `callerSymbolId`, `calleeName`, `calleeNodeId` (nullable), `calleeSymbolId` (nullable).
- Unresolved callees get `null` for node/symbol IDs but still record the name.

**2d. Reference tracker:**
- New `reference-tracker.ts` in `packages/intelligence/src/graph/`.
- Input: parsed tree + import declarations + symbol DB.
- Build imported-name map: `{ localName → { sourceFile, originalName } }` from import statements.
- Walk all identifier nodes in the tree.
- For each identifier: check if it's a declaration site (skip) or usage site. Check if it matches an imported name. If yes, resolve to the source symbol via DB lookup. Track lexical scope (function/block boundaries) to handle shadowing.
- Distinguish `kind: "usage" | "type-reference"` based on parent node context.
- Output: `GraphSymbolReference[]` rows.

**Validation:**
- `vitest run packages/intelligence/src/graph/` — all new test files pass.
- Comparison script: run both regex and AST extractors on a DH fixture directory, diff edge counts, verify AST finds >= regex results with zero regressions on known edges.
- `tsc --noEmit`

**Reviewer focus:** Tree-sitter node type coverage (are all import forms handled?). Module resolution correctness for DH's own file structure. Lexical scope tracking in reference-tracker (is shadowing handled?). Old extractors untouched until comparison evidence.

---

### [ ] Slice 3: Graph indexer with incremental support (maps to checklist P5)

**Goal:** Orchestrate the full extraction pipeline and support incremental re-indexing.

**Files:**
- `packages/intelligence/src/graph/graph-indexer.ts` — new
- `packages/intelligence/src/graph/graph-indexer.test.ts` — new

**Implementation details:**

1. `GraphIndexer` class with `indexProject(repoRoot, options)` method.
2. Pipeline sequence: discover files → for each file → compute content hash → check `graph_nodes.content_hash` → if unchanged, skip → if changed: parse → extract symbols (reuse `extractSymbolsFromFileAST()`) → extract imports → extract calls → extract references → persist all via `GraphRepo.replaceAllForNode()` in a transaction.
3. File deletion handling: diff current file list against `graph_nodes`, delete nodes for files no longer present (FK cascade cleans up).
4. File rename handling: treated as delete + add (no rename tracking, consistent with scope).
5. Parser cache: reuse `getParser(language)` from `tree-sitter-init.ts` which already caches parsers per language. Parse results for the current file are passed through the pipeline (parse once, extract many).
6. Options: `{ force?: boolean }` to skip content-hash check and re-index everything.
7. Return stats: `{ filesScanned, filesIndexed, filesSkipped, filesDeleted, durationMs }`.

**Validation:**
- `vitest run packages/intelligence/src/graph/graph-indexer.test.ts`
- Integration test: index a small fixture project, modify one file, re-index, verify only that file was re-processed.
- Benchmark: time full index + incremental index on a directory to verify incremental is significantly faster.
- `tsc --noEmit`

**Reviewer focus:** Transaction safety (partial extraction failure should not corrupt graph data). Content-hash comparison uses the same algorithm consistently. Cascade delete is correct.

---

### [ ] Slice 4: DH-native tool surface (maps to checklist P6)

**Goal:** Expose graph query capabilities as AI-callable tools.

**Files:**
- `packages/opencode-core/internal/llm/tools/graph_find_dependencies.go` — new
- `packages/opencode-core/internal/llm/tools/graph_find_dependents.go` — new
- `packages/opencode-core/internal/llm/tools/graph_find_symbol.go` — new
- `packages/opencode-core/internal/llm/tools/graph_find_references.go` — new
- `packages/opencode-core/internal/llm/tools/graph_call_hierarchy.go` — new
- `packages/opencode-core/internal/llm/tools/graph_goto_definition.go` — new
- `packages/opencode-core/internal/llm/tools/graph_syntax_outline.go` — new
- `packages/opencode-core/internal/llm/tools/graph_tools_test.go` — new
- Tool registration in `packages/opencode-core/internal/llm/agent/tools.go` — modify to register new tools

**Implementation details:**

1. Each tool implements the `BaseTool` interface (`Info() ToolInfo`, `Run(ctx, params) (ToolResponse, error)`).
2. Tools open the shared SQLite DB at `.dh/sqlite/dh.db` (using the same path convention as the bridge: `bridge.DBPathTemplate`).
3. Query the `graph_*` tables directly with SQL. This avoids adding a new bridge surface — Go already has a SQLite reader pattern.

**Tool specifications:**

| Tool ID | Input | Query | Output format |
|---|---|---|---|
| `dh.find-dependencies` | `filePath: string` | `graph_edges WHERE from_node_id = <nodeId>` joined with `graph_nodes` | List of `{ path, edgeType, line }` |
| `dh.find-dependents` | `filePath: string` | `graph_edges WHERE to_node_id = <nodeId>` joined with `graph_nodes` | List of `{ path, edgeType, line }` |
| `dh.find-symbol` | `name: string` | `graph_symbols WHERE name = ?` joined with `graph_nodes` | List of `{ path, name, kind, line, isExport }` |
| `dh.find-references` | `symbol: string` | `graph_symbol_references` joined via `graph_symbols` + `graph_nodes` | List of `{ path, line, col, kind }` |
| `dh.call-hierarchy` | `symbol: string, direction?: "callers"\|"callees"` | `graph_calls` joined with `graph_symbols` + `graph_nodes` | `{ callers: [...], callees: [...] }` |
| `dh.goto-definition` | `symbol: string` | `graph_symbols WHERE name = ?` filtered to export declarations | `{ path, line, kind }` or "not found" |
| `dh.syntax-outline` | `filePath: string` | `graph_symbols WHERE node_id = <nodeId>` | List of `{ name, kind, line, isExport }` |

4. Standardized error handling:
   - DB not found → `"Graph index not available. Run indexing first."`
   - Symbol not found → `"Symbol 'X' not found in graph index."`
   - Node not found → `"File 'X' not in graph index. It may need indexing."`
   - Index stale → advisory note in output (based on `graph_nodes.mtime` vs actual file mtime).

**Validation:**
- `go test ./packages/opencode-core/internal/llm/tools/...` — new test file
- Manual verification: call each tool against an indexed DH repo, verify correct results.
- `tsc --noEmit` (for TS changes)

**Reviewer focus:** SQL injection safety (parameterized queries). Tool output format is consistent and parseable. Error messages are actionable.

---

### [ ] Slice 5: Enforcement hooks — bash guard + evidence gating (maps to checklist P7 + P8)

**Goal:** Runtime enforcement that blocks OS commands on source files and gates structural answers on graph evidence.

**Files:**
- `packages/runtime/src/hooks/bash-guard.ts` — new
- `packages/runtime/src/hooks/bash-guard.test.ts` — new
- `packages/runtime/src/hooks/evidence-gate.ts` — new
- `packages/runtime/src/hooks/evidence-gate.test.ts` — new
- `packages/runtime/src/hooks/enforcement-writer.ts` — new

**Implementation details:**

**5a. Bash guard (`bash-guard.ts`):**

- `SUBSTITUTION_RULES`: array of `{ pattern: RegExp, category: string, suggestion: string }`:
  - `grep` → `"Use dh.find-references or Grep tool"`
  - `cat` on source files → `"Use Read tool or dh.syntax-outline"`
  - `find -name` → `"Use Glob tool or dh.find-symbol"`
  - `sed`/`awk` → `"Use Edit tool"`
  - `head`/`tail` → `"Use Read tool with offset/limit"`
  - `wc` → `"Use Read tool"`
- `ALLOWED_PREFIXES`: `["git", "npm", "pnpm", "node", "npx", "docker", "make", "cargo", "go", "python", "pip", "vitest", "tsc"]`
- `evaluateBashCommand(command: string, level: "strict" | "advisory")`:
  - Parse command to extract the base command.
  - Check allowed prefixes first → allow.
  - Check substitution rules → if match and strict → block; if match and advisory → allow with warning.
  - Return `{ allowed, blocked, reason, suggestion }`.

**5b. Evidence gate (`evidence-gate.ts`):**

- `STRUCTURAL_INTENT_PATTERNS`: array of patterns that indicate a structural question:
  - `"who calls"`, `"what calls"` → requires `dh.call-hierarchy` evidence
  - `"depends on"`, `"imports"`, `"dependencies"` → requires `dh.find-dependencies` evidence
  - `"references"`, `"used by"`, `"usages"` → requires `dh.find-references` evidence
  - `"refactor"`, `"rename"`, `"impact"` → requires reference + dependent evidence
- `evaluateEvidence(intent: string, toolsUsed: string[], evidenceScore: number)`:
  - Check if intent matches structural patterns.
  - If structural: check if appropriate graph tools were used → if not, return warning.
  - If evidence score < threshold (0.5) → return warning.
  - Return `{ allowed, reason, suggestion }`.

**5c. Enforcement writer (`enforcement-writer.ts`):**

- Integrates bash guard and evidence gate with `HookInvocationLogsRepo`.
- `writeBashGuardDecision(sessionId, envelopeId, command, result)` → writes to `hook_invocation_logs` with `hook_name: "pre_tool_exec"`, `decision: "allow"|"block"`.
- `writeEvidenceGateDecision(sessionId, envelopeId, intent, result)` → writes to `hook_invocation_logs` with `hook_name: "pre_answer"`, `decision: "allow"|"block"`.
- The existing Go bridge hooks (`BridgePreToolExecHook`, `BridgePreAnswerHook`) already read from `hook_invocation_logs` — no Go changes needed.

**5d. Enforcement graduation:**
- Default: `advisory` mode during Slice 2-4 development.
- Switch to `strict` mode only after Slice 4 tools are registered and confirmed usable.
- Enforcement level is configurable via the `sessions.tool_enforcement_level` column (already exists in DH schema).

**Validation:**
- `vitest run packages/runtime/src/hooks/` — all new test files pass.
- Manual test: simulate a bash command → verify `hook_invocation_logs` row written with correct decision → verify Go bridge reads it and blocks/allows accordingly.
- `tsc --noEmit`

**Reviewer focus:** Substitution rules match the DH tool IDs exactly. Allowed prefix list is complete for DH's workflow. Evidence patterns are not too broad (avoid false positives). Advisory vs strict transition is clean.

---

## Dependency Graph

```
Slice 1 (Schema + Repo)
   |
   v
Slice 2 (AST Extraction)     ← depends on Slice 1 for persistence
   |
   v
Slice 3 (Graph Indexer)       ← depends on Slice 2 for extraction functions + Slice 1 for repo
   |
   v
Slice 4 (Tool Surface)        ← depends on Slice 3 for populated graph data
   |
   v
Slice 5 (Enforcement)         ← depends on Slice 4 for tool IDs in suggestions
```

**All slices are strictly sequential.** No parallel execution is safe because each slice builds on the output of the previous one:
- Slice 2 persists to Slice 1's repo.
- Slice 3 orchestrates Slice 2's extractors.
- Slice 4 queries Slice 3's indexed data.
- Slice 5 references Slice 4's tool IDs.

**Critical path:** Slice 1 → Slice 2 → Slice 3 → Slice 4 → Slice 5.

**Within Slice 2, sub-tasks may be parallelized:**
- Import extraction (2a + 2b) and call graph extraction (2c) are independent once Slice 1 is done.
- Reference tracker (2d) depends on import extraction (for the imported-name map) and symbol extraction (already exists in DH), so it should follow 2a.
- Recommended order within Slice 2: 2a (imports + resolver) → parallel {2c (calls), 2d (references)}.

---

## Validation Matrix

| Acceptance Criterion | Slice | Validation Command | Evidence Type |
|---|---|---|---|
| AC-1: Five `graph_*` tables exist | Slice 1 | `vitest run graph-repo.test.ts` | Test pass + SQL schema inspection |
| AC-2: `GraphRepo` provides CRUD | Slice 1 | `vitest run graph-repo.test.ts` | Test pass: insert/query round-trip |
| AC-3: AST import extraction covers all import forms | Slice 2 | `vitest run extract-import-edges.test.ts` | Test pass + comparison with regex output |
| AC-4: Module resolution with extension/index fallback | Slice 2 | `vitest run module-resolver.test.ts` | Test pass |
| AC-5: AST call graph at symbol level | Slice 2 | `vitest run extract-call-graph.test.ts` | Test pass |
| AC-6: Reference tracking with cross-file support | Slice 2 | `vitest run reference-tracker.test.ts` | Test pass |
| AC-7: Graph indexer orchestrates full pipeline | Slice 3 | `vitest run graph-indexer.test.ts` | Test pass: all 5 tables populated |
| AC-8: Incremental indexing < 1s for single file change | Slice 3 | `vitest run graph-indexer.test.ts` (benchmark) | Test pass + timing assertion |
| AC-9: P0 tools operational | Slice 4 | `go test ./tools/...` + manual query | Test pass + correct results |
| AC-10: P1 tools operational | Slice 4 | `go test ./tools/...` + manual query | Test pass + correct results |
| AC-11: Bash guard blocks OS commands | Slice 5 | `vitest run bash-guard.test.ts` | Test pass: `grep` blocked, `git` allowed |
| AC-12: Evidence gating for structural answers | Slice 5 | `vitest run evidence-gate.test.ts` | Test pass: warning on missing evidence |
| AC-13: Graph additive to embedding pipeline | Slice 3 | Existing embedding tests still pass | `vitest run packages/retrieval/` |
| AC-14: Docs updated | Post-slice 5 | Manual review | Architecture docs reflect new tables/tools |
| AC-15: `vitest run` passes for all graph tests | All slices | `vitest run` | Full green |

---

## Rollback and Compatibility

### Schema rollback
- All graph tables use `CREATE TABLE IF NOT EXISTS` with `graph_` prefix. They do not reference or modify any existing DH table. Rollback = drop the five `graph_*` tables. No data loss in existing tables.

### Extractor rollback
- Old regex extractors (`extractImportEdges`, `extractCallEdges`) are preserved until AST versions prove superior. If AST extraction has issues, revert to the old export.

### Enforcement rollback
- Bash guard starts in `advisory` mode — no blocking. To rollback: set `tool_enforcement_level = "advisory"` in the sessions table, or remove the bash-guard decision-writer invocation.
- Evidence gate: same pattern — advisory first, strict only after confirmation.
- Go bridge uses `fail-open` semantics (`bridge_hooks.go` line 29): if TS has not written a decision, Go allows the operation. So removing the TS enforcement writer restores permissive behavior automatically.

### Tool rollback
- New Go tools are additive registrations. Removing them from the tool list in `tools.go` is the only change needed to rollback.

---

## Risks (execution-specific)

| Risk | Slice | Mitigation |
|---|---|---|
| `node:sqlite` prepared statement API differences from `better-sqlite3` | Slice 1 | `DatabaseSync` API is close but not identical. Validate `.prepare().run()` and `.prepare().all()` semantics in tests. The existing DH repos already use this pattern successfully. |
| Tree-sitter CST node types vary across TS/TSX grammars | Slice 2 | Test against both `.ts` and `.tsx` fixtures. The `ast-symbol-extractor.ts` already handles both — use the same grammar loading path. |
| Module resolution misses for non-relative imports | Slice 2 | Documented as deferred. Unresolved specifiers logged and returned as `null` edges. Does not block other features. |
| Full DH repo indexing time with WASM parser | Slice 3 | Incremental indexing is the primary mitigation. Full index is a one-time cost. Measure in integration test. |
| Go SQLite reader compatibility with new graph tables | Slice 4 | The Go `sqlite_reader.go` uses raw SQL queries. Graph tool queries will be standard SQL against the same DB file. Test with actual data. |
| Enforcement bridge timing — TS must write decision before Go reads it | Slice 5 | The existing bridge already handles this with fail-open semantics. The TS enforcement writer runs synchronously before returning control. |

---

## Sprint Mapping to Checklist Phases

| Slice | Checklist Phases | Recommended Sprint |
|---|---|---|
| Slice 1 | P0 (baseline), P1 (schema) | Sprint A |
| Slice 2 | P2 (imports), P3 (calls), P4 (references) | Sprint B + C |
| Slice 3 | P5 (indexer + incremental) | Sprint C |
| Slice 4 | P6 (tool surface) | Sprint D |
| Slice 5 | P7 (enforcement), P8 (retrieval integration), P9 (docs) | Sprint D + E |

---

## Notes for FullstackAgent

1. **Start every slice with tests.** `vitest` is available. Write the test file first for each new module, then implement to green.
2. **Reuse `tree-sitter-init.ts` everywhere.** Do not create a new parser initialization path. `parseSource(language, source)` and `getParser(language)` are the entry points.
3. **Reuse `createId(prefix)` for all IDs.** Prefixes: `"gnode"`, `"gedge"`, `"gsym"`, `"gref"`, `"gcall"`.
4. **Transaction discipline.** Use `database.exec("BEGIN"); ... database.exec("COMMIT")` for bulk operations in `GraphRepo`. DH's `DatabaseSync` supports this.
5. **Do not delete old extractors.** Keep `extractImportEdges()` and `extractCallEdges()` intact until comparison evidence is recorded in a test.
6. **Fixture project for integration tests.** Create a small TypeScript project fixture under `packages/intelligence/src/graph/__fixtures__/` with known import/call/reference patterns for deterministic testing.

## Notes for Code Reviewer

1. Verify graph DDL matches the architecture plan SQL exactly.
2. Verify no existing DH table is modified.
3. Verify tree-sitter node types cover the import/call forms listed in the scope.
4. Verify `ALLOWED_PREFIXES` in bash guard does not inadvertently block DH workflow commands.
5. Verify Go tools use parameterized SQL queries (no string interpolation).

## Notes for QA Agent

1. End-to-end scenario: index the DH repo itself, then query `dh.find-dependencies packages/storage/src/sqlite/db.ts` and verify correct results.
2. Enforcement scenario: attempt `grep -r 'function' src/` via bash tool and verify it is blocked (strict) or warned (advisory).
3. Evidence gating scenario: ask "who calls bootstrapDhDatabase" without calling `dh.call-hierarchy` first and verify the warning.
4. Regression check: existing `vitest run` passes without modification to existing test files.
