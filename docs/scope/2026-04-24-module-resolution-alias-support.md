---
artifact_type: scope_package
version: 1
status: ready
feature_id: MODULE-RESOLUTION-ALIAS-SUPPORT
feature_slug: module-resolution-alias-support
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Module Resolution Alias Support

## Goal

Resolve bounded TypeScript/JavaScript import aliases from truthful project configuration so DH graph indexing records import edges for common repo-local aliases instead of leaving them unresolved when they can be deterministically mapped inside the workspace.

## Target Users

- Operators and maintainers using DH/OpenKit graph intelligence tools to inspect dependencies, dependents, symbols, and references in TS/JS projects.
- Implementation and QA agents relying on graph evidence for code navigation and impact analysis.

## Problem Statement

The DH runtime integration intentionally deferred module resolution for non-relative import specifiers such as `@/` and `~/`, logging them as unresolved even when a project’s `tsconfig.json` or `jsconfig.json` contains enough local configuration to resolve them. This keeps the system truthful, but it reduces graph usefulness for repositories that use standard TS/JS alias patterns. The feature should close that bounded gap by resolving aliases only from readable project configuration and only to files within repo/workspace roots, while keeping unresolved or ambiguous specifiers explicit and inspectable.

## In Scope

- Read relevant TS/JS project configuration files that are present and parseable, including `tsconfig.json` and `jsconfig.json` where the current runtime can truthfully discover them.
- Support bounded `baseUrl` and `paths` alias mapping for static TS/JS import specifiers during graph import-edge extraction and indexing.
- Resolve alias targets to repo/workspace-local files using the current resolver’s file and directory fallback expectations where applicable, including supported TS/JS source extensions and index-file fallback already covered by the resolver scope.
- Preserve and expose unresolved, unsupported, external, or ambiguous import specifiers instead of silently dropping or fabricating graph edges.
- Keep behavior additive to existing relative import resolution and existing graph indexing flows.
- Add or update focused tests/fixtures covering alias success, unresolved aliases, ambiguous aliases, workspace-root boundaries, and config parsing failures.
- Keep operator-facing/runtime output honest about whether an import was resolved, unresolved, unsupported, external, or ambiguous.

## Out of Scope

- Package-manager resolution redesign for npm/pnpm/yarn/bun workspaces or `node_modules` package lookup.
- Node condition exports, `exports`/`imports` field parity, package self-references, or compiler-grade NodeNext/Bundler resolution parity.
- Universal TypeScript compiler module-resolution parity or claims that DH exactly matches `tsc` for every project.
- Runtime support for non-TS/JS language alias systems.
- Rust bridge work unless implementation discovers a concrete blocker that cannot be solved in the current TS/JS runtime path.
- Rewriting graph storage, graph tool semantics, parser architecture, or unrelated indexing behavior.
- Resolving aliases outside approved repo/workspace roots, even if a config points there.
- Inferring aliases from convention alone when no readable project configuration supports the mapping.

## Main Flows

- As a graph-tool operator, I want imports using configured aliases such as `@/components/Button` to resolve to repo-local files so that dependency and dependent queries reflect actual project structure.
- As an implementation agent, I want unresolved and ambiguous specifiers to remain visible so that I can distinguish “not supported/resolved” from “no dependency exists.”
- As a maintainer, I want alias behavior to derive from checked-in TS/JS config rather than hard-coded assumptions so that graph output remains truthful across different repositories.

## Business Rules

1. Alias resolution may only use project configuration files that are found, readable, and parseable by the runtime.
2. Supported configuration inputs are bounded to TS/JS config semantics needed for `baseUrl` and `paths`; unsupported fields must not be treated as implemented.
3. Alias targets must resolve within the repo/workspace roots recognized by the runtime. Targets outside those boundaries must remain unresolved or rejected with an inspectable reason.
4. Existing relative import behavior must not regress.
5. Bare package specifiers without a local alias match remain out of scope and must stay explicit as external/unresolved according to the current graph model.
6. If multiple configs or path patterns could resolve a specifier and the runtime cannot choose deterministically from documented precedence, the result must be marked ambiguous rather than guessed.
7. If a config file is missing, invalid, or unreadable, graph indexing must continue with existing supported resolution and record/report the config limitation without crashing the whole index.
8. Alias matching must not fabricate graph edges for files that do not exist after supported extension/index fallback.
9. Resolution status must be inspectable in tests and operator/runtime output: at minimum, successful alias edge creation and unresolved/ambiguous cases must be distinguishable.
10. The feature must not claim full compiler parity; documentation and messages must describe this as bounded TS/JS alias support.

## Operator / Runtime Truth Rules

- Successful alias resolution should create the same kind of import edge expected for a resolved local dependency, with enough metadata/logging to understand that an alias mapping was used when the current graph model supports it.
- Unresolved specifiers must remain inspectable; no warning or unresolved record should be removed merely because alias support exists.
- Ambiguous specifiers must be reported as ambiguous, not resolved to the first filesystem match unless a deterministic, documented config precedence applies.
- Config read/parse failures must be reported as degraded alias-resolution capability while allowing indexing to continue for unaffected files.
- Operator-facing summaries, test names, and docs must avoid “TypeScript-compatible resolver” or “full module resolution” claims.

## Acceptance Criteria Matrix

| ID | Acceptance Criterion | Inspectable Expectation |
| --- | --- | --- |
| AC-1 | Given a TS/JS fixture with a readable config containing `baseUrl` and a matching `paths` alias, when the graph indexes a static import using that alias, then the import edge resolves to the correct repo-local file. | A focused resolver/indexer test asserts the alias specifier maps to the expected path and graph edge. |
| AC-2 | Given an existing relative import fixture, when alias support is enabled, then existing relative import resolution behavior remains unchanged. | Existing relative import tests pass or equivalent regression coverage asserts unchanged output. |
| AC-3 | Given a static import with an alias-like prefix that is not present in readable config, when indexed, then it remains unresolved/unsupported rather than guessed from naming convention. | Test asserts unresolved status/reason and no fabricated local edge. |
| AC-4 | Given a config path mapping whose resolved target is outside the repo/workspace root, when indexed, then no local graph edge is created and the reason is inspectable. | Test fixture asserts boundary rejection/unresolved status. |
| AC-5 | Given invalid or unreadable `tsconfig`/`jsconfig`, when indexing runs, then indexing continues for files that do not depend on that config and alias capability is reported as degraded. | Test asserts no whole-index crash and a visible config error/degraded result. |
| AC-6 | Given multiple alias mappings that make a specifier ambiguous under the bounded resolver rules, when indexed, then the specifier is marked ambiguous rather than silently choosing an arbitrary target. | Test asserts ambiguous status/reason and no arbitrary edge. |
| AC-7 | Given a bare external package import with no local alias match, when indexed, then the feature does not attempt package-manager or `node_modules` resolution. | Test asserts external/unresolved behavior remains explicit. |
| AC-8 | Given alias imports that resolve via supported extension or index fallback, when indexed, then they resolve consistently with the current local file resolver’s supported fallback set. | Tests cover extension and directory index fallback for alias targets. |
| AC-9 | Given graph/dependency tools consume indexed data, when an alias-resolved import has been indexed, then dependency/dependent queries can show the resolved local relationship. | Integration-style test or tool-level fixture verifies graph query output includes the relationship. |
| AC-10 | Given docs or runtime messages added for this feature, when reviewed, then they describe bounded TS/JS alias support and do not claim compiler-grade module resolution. | Manual review or test snapshot verifies wording avoids unsupported claims. |

## Edge Cases

- Multiple `tsconfig.json` / `jsconfig.json` files in nested workspace areas where config ownership for a source file must be determined truthfully.
- `extends` chains in TS config: support only if the current implementation can read and merge them deterministically; otherwise record as unsupported/degraded rather than guessing.
- Path patterns with wildcards, multiple target entries, trailing slashes, directory targets, and extensionless targets.
- Alias target exists in several extensions; the resolver must use documented deterministic fallback order or mark ambiguity if no safe order exists.
- Alias maps to a directory with index variants.
- Config contains comments or JSONC syntax if current config parsing supports it; if not, invalid parse handling must be explicit.
- Imports used in `import`, `export ... from`, side-effect imports, dynamic `import()` with static string literals, and `require()` with static string literals only where the current extractor already treats them as static import edges.
- Type-only imports should follow existing graph edge semantics and must not introduce inconsistent behavior.

## Error And Failure Cases

- Missing config: continue with relative resolution and explicit no-alias-config behavior.
- Invalid config: continue indexing where possible; expose parse/read failure in logs/results/tests.
- Alias target missing: no graph edge; unresolved reason remains visible.
- Alias target outside workspace root: no graph edge; boundary reason remains visible.
- Ambiguous mapping: no arbitrary edge; ambiguous reason remains visible.
- Unsupported compiler option or module-resolution feature: do not emulate it partially without a named acceptance criterion; report unsupported/degraded behavior.

## Open Questions

- Should `extends` chains be included in the first implementation if the existing config loader can read them safely, or should they be explicitly deferred to keep this slice smaller?
- What exact runtime surface should expose resolution status if the current graph edge schema lacks a dedicated status/reason field: logs, structured resolver result, graph metadata, or a test-only return shape?
- Which workspace-root source is authoritative in DH for alias boundary checks when a project has nested packages: repo root only, discovered workspace roots, or both?

## Success Signal

- Alias-heavy TS/JS fixture projects produce graph import edges for resolvable local aliases while unresolved, external, ambiguous, or unsafe aliases remain explicit and inspectable.
- Downstream graph queries show local dependency relationships for successfully alias-resolved imports without regressing existing relative import behavior.

## Handoff Notes For Solution Lead

- Design from the existing module resolver and graph indexing surfaces; keep this feature bounded to alias inputs from truthful project config.
- Preserve explicit unresolved/ambiguous status as a first-class requirement, not a logging afterthought.
- Validate with focused resolver tests plus at least one graph/indexer integration path that proves alias-resolved edges are queryable.
- Do not plan package-manager resolution, Node condition exports parity, or Rust bridge changes unless a concrete implementation blocker proves they are necessary.
