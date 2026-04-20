---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: MULTI-LANGUAGE-SUPPORT
feature_slug: multi-language-support
source_scope_package: docs/scope/2026-04-18-multi-language-support.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Multi Language Support

## Chosen Approach

- Extend multi-language support **Rust-first** by making Rust the only structural source of truth for:
  - language detection and adapter routing
  - parse diagnostics and normalized extraction
  - indexable facts and stale-fact cleanup
  - query-capability truth by language
- Keep TypeScript responsible for:
  - operator-visible wording
  - support-state presentation
  - separation between language/capability state and answer/result state
  - bounded reporting when a query crosses supported, partial, best-effort, or unsupported language surfaces
- Preserve the current TS/JS baseline as the strongest path, then add **bounded** Python, Go, and Rust support without promising equal semantic depth.
- Treat repository-level retrieval and search as additive only. File/path discovery, concept search, or retrieval-backed results must **not** be used as proof that a language has parser-backed code-intelligence support.

Why this is enough:

- The repo already has the Rust parser/indexer/query/bridge skeleton and a truthful TS operator/reporting layer.
- The real gap is not “multi-language everywhere”; it is the missing contract that says **which language supports which capability, from which layer, with what limitations**.
- One Rust-authored capability matrix plus additive adapters and TS presentation alignment closes that gap without reopening topology, daemon mode, or parity claims that the repository cannot support honestly.

## Impacted Surfaces

### Rust structural-truth surfaces

- `rust-engine/Cargo.toml`
- `rust-engine/crates/dh-parser/Cargo.toml`
- `rust-engine/crates/dh-types/src/lib.rs`
- `rust-engine/crates/dh-parser/src/lib.rs`
- `rust-engine/crates/dh-parser/src/registry.rs`
- `rust-engine/crates/dh-parser/src/pool.rs`
- `rust-engine/crates/dh-parser/src/adapters/mod.rs`
- `rust-engine/crates/dh-parser/src/adapters/typescript.rs`
- `rust-engine/crates/dh-parser/src/adapters/python.rs` _(new)_
- `rust-engine/crates/dh-parser/src/adapters/go.rs` _(new)_
- `rust-engine/crates/dh-parser/src/adapters/rust.rs` _(new)_
- `rust-engine/crates/dh-parser/tests/`
- `rust-engine/crates/dh-indexer/src/scanner.rs`
- `rust-engine/crates/dh-indexer/src/lib.rs`
- `rust-engine/crates/dh-indexer/tests/integration_test.rs`
- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`

### TypeScript presentation and operator-honesty surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- `apps/cli/src/presenters/knowledge-command.ts`
- `packages/runtime/src/diagnostics/doctor.ts`
- `packages/runtime/src/diagnostics/doctor.test.ts`
- `packages/intelligence/src/symbols/extract-symbols.ts`
- `packages/intelligence/src/symbols/extract-symbols.test.ts`

### Existing truth surfaces this feature must preserve

- `docs/scope/2026-04-18-multi-language-support.md`
- `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`
- `docs/migration/deep-dive-01-indexer-parser.md`
- `docs/solution/2026-04-13-rust-ts-code-intelligence-migration.md`
- `docs/solution/2026-04-17-ts-brain-layer-completion.md`

## Boundaries And Components

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| Language detection and adapter routing | file detection, adapter selection, parse lifecycle, normalized facts | display of which languages are in scope and why | a second TS-authored language-truth source |
| Parser/indexer structural truth | symbols, imports, exports, calls, references, chunks, diagnostics, parse status, stale-fact cleanup | operator summaries of supported/partial/best-effort/unsupported | a retrieval-backed guess layer presented as parser truth |
| Query capability truth | which query classes are truly supported for a language | wording of limitations and degraded outcomes | a global “all relations supported for all languages” story |
| Answer/report envelope | additive metadata about involved languages and weakest capability support | `grounded/partial/insufficient/unsupported` answer-state reporting | collapse of answer-state and language-state into one field |
| Retrieval/file discovery | optional search/retrieval evidence | messaging that it is retrieval-only when parser support is absent | proof of parser-backed support |

### Architecture boundary to preserve

- **Rust remains authoritative** for parser/indexer/query/search/storage structural truth and language adapters.
- **TypeScript remains authoritative** for support-state presentation, operator wording, and bounded reporting of capability support.
- TS helper surfaces such as `packages/intelligence/src/symbols/extract-symbols.ts` may remain as implementation details or diagnostics, but they must no longer be treated as the product’s primary language-support truth once Rust exposes the capability contract.

### Product boundary to preserve

- No compiler-grade semantic parity claim for Python, Go, or Rust.
- No universal parity claim across all query classes.
- No topology rewrite, daemon mode, remote execution, or Rust-host inversion work.
- No use of unsupported-language retrieval results as evidence of parser-backed support.

## Interfaces And Data Contracts

## 1. Rust release-truth capability contract

Add one explicit Rust-owned capability model alongside the existing `LanguageId`, `ParseStatus`, `AnswerState`, and `QuestionClass` types.

Recommended additive contract shape:

- `LanguageCapabilityState = supported | partial | best_effort | unsupported`
- `LanguageCapability`
  - `parse_diagnostics`
  - `structural_indexing`
  - `symbol_search`
  - `definition_lookup`
  - `dependencies`
  - `dependents`
  - `references`
  - `call_hierarchy`
  - `trace_flow`
  - `impact`
- `LanguageCapabilityEntry`
  - `language`
  - `capability`
  - `state`
  - `reason`
  - `parser_backed`

Contract rule:

- This matrix is the **single product truth** for language/capability support.
- TypeScript may present or summarize it, but must not derive a stronger story from local grammar availability, fallback parsing, or retrieval hits.

## 2. File-level degradation contract

Reuse the existing Rust file/index truth as the file-level degradation source:

- `File.language`
- `File.parse_status`
- `File.parse_error`
- `ParseDiagnostic[]`

Rule:

- Release-level support matrix says what the product promises in general.
- File-level parse/index status says whether a specific file was healthy, partially extracted, failed, or skipped in a specific run.
- Fatal adapter/grammar failures must clear stale facts and leave the file in a degraded/failed state instead of presenting old facts as current truth.

## 3. Query-class mapping contract

The current bridge/query catalog remains bounded. This feature extends language coverage inside that catalog instead of expanding the catalog itself.

### Parser-backed query classes

| Query class / surface | TS/JS baseline | Python | Go | Rust | Notes |
| --- | --- | --- | --- | --- | --- |
| `search_symbol` | `supported` | `supported` | `supported` | `supported` | Parser-backed symbol search from indexed facts |
| `graph_definition` | `supported` | `supported` | `supported` | `supported` | Direct definition lookup only |
| `graph_relationship_dependencies` | `supported` | `supported` | `supported` | `supported` | Direct import/use dependency edges only |
| `graph_relationship_dependents` | `supported` | `supported` | `supported` | `supported` | Direct reverse dependency edges only |
| `graph_relationship_usage` | current bounded baseline; strongest path | `partial` | `partial` | `partial` | Do not imply parity completeness |
| `graph_call_hierarchy` | current bounded baseline; TS/JS-first strongest path | `unsupported` | `best_effort` | `best_effort` | Go/Rust remain conservative and syntax-first |
| `graph_trace_flow` | current bounded baseline; TS/JS-first strongest path | `unsupported` | `unsupported` | `unsupported` | No deep flow parity for new languages in this feature |
| `graph_impact` | current bounded baseline; TS/JS-first strongest path | `unsupported` | `unsupported` | `unsupported` | No deep impact parity for new languages in this feature |

### Non-proof search/retrieval surfaces

| Surface | Contract |
| --- | --- |
| `search_file_discovery` | Cross-language retrieval/file-path discovery. Never proof of parser-backed support. |
| `search_structural` | May use bounded structural proxies, but must not upgrade unsupported languages to parser-backed support on its own. |
| `search_concept_relevance` | Retrieval/semantic ranking only. Never proof of parser-backed support. |

## 4. Bridge and TS report contract

Keep the existing answer-state contract unchanged:

- answer/result support state: `grounded | partial | insufficient | unsupported`

Add one separate additive report field for language/capability truth, for example:

- `languageCapabilitySummary`
  - `capability`
  - `weakestState`
  - `languages[]`
    - `language`
    - `state`
    - `reason`
    - `parserBacked`
  - `retrievalOnly`

Rules:

- `supportState` in `run-knowledge-command.ts` remains answer-state only.
- `languageCapabilitySummary` carries language/capability truth only.
- A response may be `partial` as an answer while the involved language capability is `best_effort` or `unsupported`.
- A retrieval-backed answer over an unsupported language remains answerable only as retrieval output, never as parser-backed support.

## 5. Operator-facing state vocabulary contract

Replace or demote TS-only operator wording that currently uses `supported | limited | fallback-only` as the primary truth source.

Required outward product vocabulary for this feature:

- language/capability state: `supported | partial | best-effort | unsupported`
- answer/result state: `grounded | partial | insufficient | unsupported`

Compatibility rule:

- Existing TS diagnostics helpers may keep internal status names temporarily, but operator-facing output must not lead with them once Rust capability truth is available.

## Risks And Trade-offs

- **Rust-vs-TS truth drift**
  - Current TS diagnostics surfaces classify Python/Go/Rust as `limited` based on local grammar/symbol helpers.
  - Mitigation: Rust capability matrix becomes the authoritative source; TS helpers become secondary or internal-only.

- **Global bridge capability overclaim**
  - Current bridge initialization advertises relation methods globally, not by language.
  - Mitigation: keep method availability global but add per-language/per-capability truth in additive bridge metadata and answer/report envelopes.

- **TS/JS regression risk**
  - Multi-language work can accidentally weaken the current strongest adapter/indexer/query path.
  - Mitigation: keep TS/JS parity-preservation as a hard gate before shipping broader language claims.

- **Python dynamic behavior risk**
  - `__import__`, star imports, monkey patching, and runtime metaprogramming can make static support look broader than it is.
  - Mitigation: keep Python support bounded to explicit syntax subset and direct structural retrieval only.

- **Go package-awareness risk**
  - Go support is not honest if symbols remain file-isolated.
  - Mitigation: add conservative same-package awareness inside the supported subset before claiming supported definition/dependency lookup.

- **Rust macro/trait complexity risk**
  - Macro-heavy or trait-heavy code can create misleading call/impact edges.
  - Mitigation: keep Rust call-oriented reasoning best-effort only and keep trace/impact out of the supported contract.

- **Stale-fact trust risk**
  - Fatal parser or adapter failures can leave old facts looking current.
  - Mitigation: keep file-atomic rewrite/cleanup behavior; failed files must clear facts and expose degradation.

- **Scope-expansion risk**
  - It is easy to convert “multi-language support” into a promise of full parity or broader language expansion.
  - Mitigation: hard-stop at TS/JS + Python + Go + Rust and preserve unsupported status for all other languages.

## Dependencies

- Approved upstream scope package:
  - `docs/scope/2026-04-18-multi-language-support.md`
- Architecture and parser/indexer reference context:
  - `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`
  - `docs/migration/deep-dive-01-indexer-parser.md`
- Existing migration baseline to preserve:
  - `docs/solution/2026-04-13-rust-ts-code-intelligence-migration.md`
- Existing TS support/report boundary to preserve:
  - `docs/solution/2026-04-17-ts-brain-layer-completion.md`
- Real repository validation commands:
  - from repo root: `npm run check`
  - from repo root: `npm test`
  - from `rust-engine/`: `cargo test --workspace`
- Additional implementation dependencies expected in Rust workspace:
  - `tree-sitter-python`
  - `tree-sitter-go`
  - `tree-sitter-rust`
- No new operator environment variables are required for the recommended path.

## Recommended Path

- **Step 1: freeze one Rust-owned capability matrix before broad adapter work.**
  - Fullstack should not implement Python/Go/Rust support first and define the product truth later.
- **Step 2: extend scanner + parser registry + parser pool so Python, Go, and Rust files route into explicit Rust adapters.**
- **Step 3: implement language adapters in priority order: Python, then Go, then Rust, while preserving the TS/JS baseline.**
- **Step 4: gate query/bridge claims by the capability matrix rather than by method availability alone.**
- **Step 5: move TS operator-facing support summaries onto Rust truth and keep retrieval-only surfaces explicitly separate.**

This is the simplest adequate path because it keeps one structural truth source, one presentation layer, and one inspectable capability contract.

## Implementation Flow

1. **Freeze support truth in Rust**
   - define the language/capability matrix and additive bridge/report payloads first
2. **Expand routing and indexability**
   - scanner detection, parser registry, parser pool, and fixture coverage for Python/Go/Rust
3. **Implement bounded adapters in release order**
   - Python subset first, then Go with same-package awareness, then Rust with conservative macro/trait handling
4. **Bind query behavior to capability truth**
   - direct structural retrieval may be supported before deeper relation reasoning
5. **Align TS presentation**
   - keep answer-state separate from language-state and remove grammar-only overclaims
6. **Run one integration checkpoint**
   - prove TS/JS baseline preservation plus honest degraded behavior for Python/Go/Rust and unsupported languages

## Implementation Slices

### Slice 1: Freeze the Rust multi-language capability contract

- **Files:**
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- **Goal:** define one inspectable source of truth for per-language/per-capability support and keep it separate from answer-state.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - add additive types for language/capability state and capability summaries
  - keep `AnswerState` and `QuestionClass` intact
  - extend bridge results and/or initialize metadata so TS can present per-language capability truth without re-deriving it
  - reviewer focus: no global relation-advertisement story may be interpreted as universal language support

### Slice 2: Expand Rust detection, routing, and index eligibility for Python, Go, and Rust

- **Files:**
  - `rust-engine/Cargo.toml`
  - `rust-engine/crates/dh-parser/Cargo.toml`
  - `rust-engine/crates/dh-parser/src/lib.rs`
  - `rust-engine/crates/dh-parser/src/registry.rs`
  - `rust-engine/crates/dh-parser/src/pool.rs`
  - `rust-engine/crates/dh-parser/src/adapters/mod.rs`
  - `rust-engine/crates/dh-indexer/src/scanner.rs`
  - `rust-engine/crates/dh-indexer/src/lib.rs`
- **Goal:** make new in-scope languages route through explicit Rust adapters and participate in index eligibility and stale-fact handling.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - add tree-sitter grammar crates for Python, Go, and Rust
  - extend scanner detection beyond TS/TSX/JS/JSX
  - preserve file-atomic failure handling so fatal parse failures still clear stale facts
  - reviewer focus: TS/JS baseline detection must not regress while new languages are added

### Slice 3: Add bounded Python structural support

- **Files:**
  - `rust-engine/crates/dh-parser/src/adapters/python.rs`
  - `rust-engine/crates/dh-parser/tests/`
  - `rust-engine/crates/dh-indexer/tests/integration_test.rs`
- **Goal:** support the approved Python subset for parse/index plus direct structural retrieval classes.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - support `def`, `async def`, `class`, module-scope assignments, imports, base classes, direct calls, and identifier/attribute references in the supported subset
  - mark `graph_relationship_usage` as `partial`
  - keep `graph_call_hierarchy`, `graph_trace_flow`, and `graph_impact` outside the supported Python contract for this feature
  - reviewer focus: no star-import, monkey-patching, or dynamic-import parity claims

### Slice 4: Add bounded Go and Rust structural support

- **Files:**
  - `rust-engine/crates/dh-parser/src/adapters/go.rs`
  - `rust-engine/crates/dh-parser/src/adapters/rust.rs`
  - `rust-engine/crates/dh-parser/tests/`
  - `rust-engine/crates/dh-indexer/tests/integration_test.rs`
- **Goal:** support the approved Go and Rust subsets without deep semantic overclaims.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - Go must include conservative same-package awareness before claiming supported definition/dependency behavior
  - Rust must support `fn`, `struct`, `enum`, `trait`, `type`, `impl`, `use`, and module declarations in the approved subset
  - Go/Rust `graph_relationship_usage` remains `partial`
  - Go/Rust `graph_call_hierarchy` may be `best_effort` only when backed by actual indexed call edges
  - `graph_trace_flow` and `graph_impact` remain unsupported for Go/Rust in this feature
  - reviewer focus: best-effort means explicit and inspectable, not hidden parity marketing

### Slice 5: Align query gating, bridge output, and TypeScript operator presentation

- **Files:**
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `packages/intelligence/src/symbols/extract-symbols.ts`
  - `packages/intelligence/src/symbols/extract-symbols.test.ts`
- **Goal:** present one truthful product story by language and capability while keeping retrieval-only and answer-state reporting separate.
- **Validation Command:** `cargo test --workspace && npm run check && npm test`
- **Details:**
  - TS must consume Rust capability truth rather than local grammar availability as the primary support signal
  - `run-knowledge-command` keeps `supportState` for answer-state only and adds a distinct language/capability summary
  - doctor/report/presenter output must use the approved vocabulary `supported | partial | best-effort | unsupported` outwardly
  - unsupported-language retrieval/file-path results must stay visibly retrieval-only
  - reviewer focus: no operator surface may imply parser-backed support because a retrieval hit happened to mention a file

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- Why sequential:
  - Slice 1 defines the contract every later slice relies on.
  - Slice 2 must land before any non-TS adapter can index files honestly.
  - Slice 3 and Slice 4 rely on shared scanner/registry/pool behavior from Slice 2.
  - Slice 5 must consume the final Rust capability truth, not intermediate guesses.

## Parallelization Assessment

- parallel_mode: `none`
- why: the feature depends on shared Rust contract types, shared scanner and parser routing, shared query/bridge truth, and shared TS support-state wording. Partial overlap would create a high risk of contradictory support claims.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- integration_checkpoint: verify one coherent story across Rust capability truth, bridge output, `run-knowledge-command`, CLI presentation, and doctor output for TS/JS, Python, Go, Rust, and one unsupported language.
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
| TS/JS baseline remains intact | from `rust-engine/`: `cargo test --workspace`; existing TS adapter, parity, and indexer integration coverage must still pass |
| Python subset parses, indexes, and degrades honestly | from `rust-engine/`: `cargo test --workspace`; parser fixtures plus indexer integration coverage for recoverable and fatal cases |
| Go same-package bounded support is real | from `rust-engine/`: `cargo test --workspace`; Go fixtures must cover same-package symbol visibility and direct dependency/dependent behavior |
| Rust subset stays bounded and macro/trait-heavy behavior does not overclaim | from `rust-engine/`: `cargo test --workspace`; Rust fixtures must verify best-effort call behavior and unsupported deep-trace/impact presentation |
| fatal failures do not leave stale facts current | from `rust-engine/`: `cargo test --workspace`; indexer integration tests must assert stale facts are cleared on fatal parse/read failures |
| bridge/report surfaces distinguish answer-state from language-state | from repo root: `npm run check && npm test`; from `rust-engine/`: `cargo test --workspace` |
| retrieval-only surfaces do not imply parser-backed support | from repo root: `npm run check && npm test`; presenter and knowledge-command tests must assert explicit retrieval-only limitations |
| doctor/support summaries reflect Rust truth | from repo root: `npm run check && npm test`; doctor tests must stop relying on `supported|limited|fallback-only` as the outward product contract |

Validation reality notes:

- No repo-native lint command is defined; do not invent one.
- The strongest real automated paths in this repository are `cargo test --workspace`, `npm run check`, and `npm test`.

## Integration Checkpoint

Before `solution_to_fullstack` is treated as execution-ready, the implementation path should be able to satisfy all of the following in one combined review pass:

- TS/JS files still behave as the strongest and least-degraded path.
- Python files in the supported subset can be parsed, indexed, and queried for symbol search, definition, dependencies, and dependents.
- Go files in the supported subset show same-package-aware direct structural behavior before they are labeled supported.
- Rust files in the supported subset can be parsed/indexed and queried for direct structural behavior without macro/trait parity claims.
- A Python request for call hierarchy or a Go/Rust request for trace/impact does **not** look supported if the matrix says otherwise.
- An unsupported-language file can still appear in retrieval/file search without being presented as parser-backed code intelligence.
- `run-knowledge-command` and CLI output keep answer-state (`grounded/partial/insufficient/unsupported`) separate from language/capability state (`supported/partial/best-effort/unsupported`).
- doctor and other operator-facing summaries no longer use TS grammar availability alone as the main proof of language support.

## Rollback Notes

- If any newly in-scope language cannot honestly reach supported parse/index plus supported direct structural retrieval, narrow that language’s capability entries explicitly rather than hiding behind a generic multi-language claim.
- If Go same-package awareness is not ready, keep Go dependencies/dependents or definition behavior at `partial` until the evidence is real.
- If Rust macro/trait-heavy call edges are noisy, keep `graph_call_hierarchy` unsupported instead of shipping misleading best-effort output.
- If bridge metadata and TS wording drift apart, Rust capability truth wins; remove or narrow TS presentation rather than maintaining two truths.
- If TS/JS baseline tests regress, stop multi-language expansion and restore the TS/JS path before shipping broader support claims.

## Reviewer Focus Points

- Preserve the architecture boundary:
  - Rust = parser/indexer/query/search/storage structural truth and adapters
  - TypeScript = support-state presentation and operator wording
- Reject any implementation that uses TS grammar/WASM availability or retrieval hits as primary proof of parser-backed language support.
- Reject any wording that implies full parity, compiler-grade semantics, or all-language support.
- Verify direct structural retrieval reaches `supported` before any deeper relation class is upgraded.
- Verify unsupported or best-effort classes are surfaced explicitly, not silently degraded into ambiguous “partial support” messaging.
- Verify fatal adapter or grammar failures clear stale facts.
- Verify TS/JS baseline behavior is preserved and not relabeled as experimental.

### Preservation notes by downstream role

- **Fullstack Agent must preserve:**
  - one Rust-authored capability truth source
  - bounded Python/Go/Rust support only
  - explicit unsupported/best-effort behavior for deeper relation classes
  - retrieval-only vs parser-backed separation
- **Code Reviewer must preserve:**
  - no second TS-owned language truth source
  - no universal bridge capability story without language boundaries
  - no operator wording that collapses answer-state and language-state
  - no parity claims beyond the approved matrix
- **QA Agent must preserve:**
  - scenario coverage for TS/JS baseline, Python supported subset, Go supported subset, Rust supported subset, and one unsupported language
  - verification that unsupported/degraded cases are visible and not hidden by retrieval success
  - verification that stale facts are removed on fatal parser failures
