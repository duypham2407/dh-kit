---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: ENGINE-DEPTH-COMPLETION
feature_slug: engine-depth-completion
source_scope_package: docs/scope/2026-04-15-engine-depth-completion.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Engine Depth Completion

## Chosen Approach

- Complete engine depth by keeping the current Rust workspace boundaries and filling the missing middle layers: `dh-storage` remains the source of indexed facts, `dh-graph` becomes the graph projection/traversal layer, `dh-query` becomes the bounded query layer, and `dh-engine` exposes those results plus evidence packets through the existing bridge path.
- The implementation should replace the current ad hoc bridge scanning in `rust-engine/crates/dh-engine/src/bridge.rs` with graph-backed query behavior for the approved bounded question classes only.
- This is enough because the repository already has real parser/indexer/storage foundations (`dh-indexer`, `dh-storage`, `dh-types`) and an existing bridge host (`dh-engine`), but not truthful depth for graph, query, trace, impact, and evidence-backed answers.

## Impacted Surfaces

- `rust-engine/crates/dh-types/src/lib.rs`
- `rust-engine/crates/dh-storage/src/lib.rs`
- `rust-engine/crates/dh-graph/src/lib.rs`
- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`
- `rust-engine/crates/dh-engine/src/main.rs`
- existing Rust tests under:
  - `rust-engine/crates/dh-indexer/tests/`
  - `rust-engine/crates/dh-engine/src/bridge.rs` test module
  - `rust-engine/crates/dh-storage/src/lib.rs` test module

## Boundaries And Components

### Exact bounded question classes for this feature

Support only these operator-visible classes in this work item:

1. **Definition**
   - where a symbol is defined
   - bounded to indexed symbol facts and definition locations already represented in storage

2. **References / usages**
   - what uses a symbol
   - bounded to indexed references and call edges in the current workspace

3. **Dependencies**
   - what a file/module depends on
   - bounded to direct import/re-export relationships and direct file-level dependency traversal

4. **Dependents**
   - what depends on a file/module/symbol
   - bounded to reverse import/reference/call relationships available in the current index

5. **Call hierarchy**
   - who calls a symbol and what that symbol calls
   - bounded to stored call edges, with unresolved dynamic calls reported as partial rather than grounded

6. **Trace / flow**
   - how a flow works across files
   - bounded to short, explainable paths across resolved import/reference/call edges only
   - not full control-flow or data-flow analysis

7. **Impact**
   - what may be impacted by changing a target symbol/module
   - bounded impacted neighborhood derived from direct dependents, references, callers, and limited graph expansion when each hop remains grounded
   - not exhaustive transitive blast-radius analysis

8. **Evidence**
   - every returned answer must include inspectable evidence or an explicit partial/insufficient/unsupported state

### Component ownership

- `dh-storage`: persists indexed facts and adds any missing repository/query helpers needed by graph-backed traversal.
- `dh-graph`: owns canonical graph projections and bounded traversal primitives over stored facts.
- `dh-query`: owns bounded question execution and answer-state decisions.
- `dh-engine`: owns bridge request/response handling and evidence packet emission for the operator path.
- `dh-indexer`: remains the producer of file/symbol/import/call/reference/chunk facts and should not be widened into answer assembly.

## Interfaces And Data Contracts

### Graph engine expectations

The first-release graph contract should stay narrow:

- **nodes**
  - file
  - symbol
  - chunk only where needed for snippets/evidence support
- **edges**
  - contains / definition ownership
  - imports / re-exports
  - references
  - calls

The graph layer must preserve whether an edge is resolved, unresolved, direct, or best-effort so the query layer can distinguish grounded from partial answers.

### Query result expectations

Each bounded query should return a structured result shape that can support:

- subject identity
- bounded result set or path
- explicit stop reason / hop bound when traversal is truncated
- answer state: `grounded | partial | insufficient | unsupported`
- evidence refs sufficient for operator inspection

### Evidence packet shape expectations

All supported question classes should converge on one minimum evidence packet shape:

- `answer_state`: `grounded | partial | insufficient | unsupported`
- `question_class`
- `subject`
- `summary`
- `conclusion`
- `evidence[]` entries containing:
  - `kind`: definition | reference | dependency | dependent | call | trace_step | impact_edge | chunk
  - `file_path`
  - `symbol` or node label when available
  - `line_start`
  - `line_end`
  - `snippet` when available
  - `reason`
  - `source`: graph | query | storage
  - `confidence`: grounded | partial
- `gaps[]` for missing resolution, unresolved edges, traversal limit, or unsupported depth
- `bounds` with fields such as hop count, node limit, and traversal scope where applicable

The packet shape must be stable enough that `dh-engine` can emit inspectable grounded answers without forcing operators to inspect raw DB rows or internal graph state.

## Risks And Trade-offs

- **Overclaim risk:** trace and impact can easily sound broader than the available evidence. Mitigation: require explicit hop bounds, stop reasons, and partial states.
- **Bridge replacement risk:** `dh-engine/src/bridge.rs` currently contains demo-style filesystem scanning for definition/relationship behavior. Mitigation: replace narrow behaviors incrementally behind the same bridge surface instead of rewriting the host process.
- **Ambiguity risk:** unresolved imports, calls, and references may still exist after indexing. Mitigation: propagate unresolved status into query and evidence output instead of dropping it.
- **Schema drift risk:** graph/query depth may require additional repository helpers or indexed access paths. Mitigation: prefer additive storage/repository changes over reshaping core index facts unless required.
- **Scope-drift risk:** the existence of empty interfaces in `dh-query` can tempt roadmap expansion. Mitigation: freeze this feature to the approved bounded classes only.

## Recommended Path

- Replace bridge-local heuristic lookup with graph-backed query execution.
- Keep first-release analysis bounded to definition, references, dependencies, dependents, call hierarchy, short trace, and bounded impact.
- Make evidence mandatory for every supported answer.
- Treat unsupported and insufficient-evidence states as first-class success conditions when the engine cannot answer truthfully.

## Implementation Slices

### Slice 1: Canonical graph fact and traversal layer

- **Goal:** make stored symbol/import/call/reference facts queryable as one coherent graph contract.
- **Files:**
  - `rust-engine/crates/dh-graph/src/lib.rs`
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-storage/src/lib.rs`
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - keep node scope to file, symbol, and evidence-supporting chunk nodes only
  - keep edge scope to contains/definition, imports/re-exports, references, and calls
  - add bounded traversal helpers for direct neighbors, reverse neighbors, short path assembly, and bounded neighborhood expansion
  - preserve resolved/unresolved edge state so later slices can report partial evidence honestly

### Slice 2: Storage and repository helpers for graph-backed queries

- **Goal:** expose the read-side helpers the graph/query layers need without pushing traversal logic into `dh-engine`.
- **Files:**
  - `rust-engine/crates/dh-storage/src/lib.rs`
  - `rust-engine/crates/dh-types/src/lib.rs` if result/helper structs are needed there
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - add repository methods for definition lookup, reverse references, reverse imports, caller/callee lookup, and bounded file/symbol neighborhood reads
  - keep changes additive to the current storage schema and repository model where possible
  - reviewer focus: storage should remain persistence/query support, not answer assembly

### Slice 3: Bounded query engine implementation

- **Goal:** turn the placeholder `dh-query` interface into real bounded behavior for approved question classes.
- **Files:**
  - `rust-engine/crates/dh-query/src/lib.rs`
  - any adjacent query implementation files added under `rust-engine/crates/dh-query/src/`
  - supporting changes in `rust-engine/crates/dh-graph/src/lib.rs`
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - implement real support for:
    - `find_symbol`
    - `goto_definition`
    - `find_references`
    - `find_dependencies`
    - `find_dependents`
    - `call_hierarchy`
    - `trace_flow`
    - `impact_analysis`
  - keep trace limited to short explainable graph paths
  - keep impact limited to bounded neighborhoods with explicit stop reasons
  - return `grounded`, `partial`, `insufficient`, and `unsupported` states explicitly

### Slice 4: Evidence builder and packet assembly

- **Goal:** make every supported answer inspectable and truthfully bounded.
- **Files:**
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-types/src/lib.rs`
  - optional adjacent evidence-specific module under `rust-engine/crates/dh-query/src/`
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - define one shared evidence packet shape for all approved question classes
  - include supporting file/span/snippet/reason metadata for each surfaced conclusion
  - require explicit gaps and bounds for partial or insufficient cases
  - reviewer focus: a result may be partial, but it must never look unqualified

### Slice 5: Bridge integration on the existing engine host path

- **Goal:** expose graph-backed query and evidence results through the current `dh-engine` bridge path.
- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-engine/src/main.rs`
  - supporting `dh-query` / `dh-graph` wiring as needed
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - preserve the existing JSON-RPC host shape and `dh.initialize`
  - replace current heuristic implementations for `query.definition` and `query.relationship` with query-engine backed responses
  - add bounded methods/result variants only where needed for call hierarchy, trace, impact, and evidence-backed answer output
  - reviewer focus: no new daemon/runtime model and no broad protocol expansion

### Slice 6: Integration checkpoint for bounded operator-visible depth

- **Goal:** prove at least one truthful scenario for each approved question class.
- **Files:**
  - surfaces above
  - downstream QA artifact under `docs/qa/`
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - definition example returns grounded answer plus evidence
  - reference/dependency/dependent examples return bounded sets plus evidence
  - call hierarchy example returns callers/callees with explicit unresolved handling when needed
  - trace example returns a short explainable path or explicit insufficient evidence
  - impact example returns bounded impact neighborhood or explicit partial state
  - unsupported/too-broad query returns explicit unsupported or insufficient state instead of confident output

## Dependency Graph

- Critical path: `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- Slice 1 must happen first because the graph contract defines what the query layer can truthfully traverse.
- Slice 2 must precede Slice 3 because query behavior depends on additive repository accessors.
- Slice 4 depends on Slice 3 because evidence packets reflect actual query outputs and answer states.
- Slice 5 depends on Slices 3 and 4 because bridge output should not invent its own answer logic.
- Slice 6 is the integration gate before review and QA.

## Parallelization Assessment

- parallel_mode: `none`
- why: graph contract, repository helpers, query result shape, evidence packet shape, and bridge wiring all touch the same narrow Rust path and create high integration-collision risk if split prematurely.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- integration_checkpoint: prove one example per supported question class with evidence-backed or explicitly partial/insufficient handling before QA handoff.
- max_active_execution_tracks: `1`

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix

| Target | Validation path |
| --- | --- |
| Definition questions are truthful | Rust tests cover definition lookup returning grounded or insufficient states with evidence refs |
| Reference/use questions are truthful | Rust tests cover reference lookup with resolved vs unresolved handling |
| Dependency/dependent questions are bounded | Rust tests cover direct dependency and reverse dependency results with explicit hop bounds |
| Call hierarchy is bounded and honest | Rust tests cover caller/callee results and partial handling for unresolved dynamic calls |
| Trace answers are explainable | Rust tests cover short path assembly and explicit stop reasons when no grounded path exists |
| Impact answers stay narrow | Rust tests cover bounded neighborhood output and partial/insufficient states when expansion exceeds evidence |
| Evidence is inspectable | result-shape tests assert file path, symbol/path labels, ranges, reasons, snippets, and bounds |
| Unsupported questions are not overclaimed | bridge/query tests assert unsupported or insufficient state rather than confident fallback |

## Integration Checkpoint

Before handoff to Code Reviewer and QA, implementation should demonstrate all of the following through the existing Rust test surface:

- one grounded definition example
- one grounded usage/reference example
- one grounded dependency example
- one grounded dependent example
- one bounded call hierarchy example
- one bounded trace example with explicit path or explicit insufficient evidence
- one bounded impact example with explicit neighborhood limits
- one unsupported or insufficient case that is labeled honestly

## Rollback Notes

- If graph-backed query depth destabilizes the bridge surface, the safe rollback is to keep the existing host/transport path and revert only the new graph/query/evidence wiring while preserving parser/indexer/storage gains.
- Do not roll back by widening TypeScript or non-Rust surfaces to own structural truth; this feature is specifically about making Rust the truthful owner of graph/query/evidence depth.

## Reviewer Focus Points

- Preserve the approved bounded question classes; do not expand into arbitrary semantic QA or unbounded explainability.
- Ensure `trace` and `impact` outputs always disclose bounds, gaps, and stop reasons.
- Ensure unresolved imports/references/calls remain visible as uncertainty rather than being silently filtered out.
- Ensure `dh-engine/src/bridge.rs` is using query-engine-backed behavior rather than a renamed heuristic scan.
- Ensure evidence packet output is inspectable without requiring raw DB inspection.
- Ensure no new product claim implies unsupported languages, cross-repo reasoning, daemonization, or roadmap-complete graph intelligence.
