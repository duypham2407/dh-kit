---
artifact_type: implementation_parity_report
version: 1
status: delete_gate_blocked
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
task_id: RGA-07G
source_solution_package: docs/solution/2026-04-30-rust-graph-ast-migration.md
owner: FullstackAgent
validation_surface: target_project_app + runtime_tooling + documentation
generated_at: 2026-05-02
---

# RGA-07G Official Corpus Parity Report

## Executive result

RGA-07G produced the strongest currently possible official DH/OpenKit corpus parity report after the RGA-07A partial coverage limitation. The report improves RGA-07A by anchoring the TypeScript baseline file set to the current Rust `dh-index.db` active JS-like file set instead of relying on the legacy `detectProjects` leaf-root baseline path.

The improved baseline reached **100% common-file coverage for Rust-indexed JS-like files**:

- RGA-07A: 29 common files over 348 Rust files (`8.333%` common-over-Rust coverage).
- RGA-07G: 345 common files over 345 Rust JS-like files (`100%` common-over-Rust-JS-like coverage), with 0 TS-only and 0 Rust-only JS-like files.

The RGA-08 deletion gate remains **blocked**. Normalized count parity is far below the approved thresholds and identity-level symbol/import/call/reference parity is still unavailable from the current tooling. This report does **not** fabricate a pass, does **not** approve exceptions, does **not** delete TypeScript graph code, and does **not** start RGA-08.

## Artifacts produced

| Artifact | Purpose | Result |
| --- | --- | --- |
| `docs/solution/rga-07g-official-parity-tool.test.ts` | Env-gated non-production parity evidence tool | Added; skipped unless `RGA_07G_GENERATE_OFFICIAL_PARITY=1` is set. |
| `docs/solution/rga-07g-official-cold-full-index.json` | Fresh Rust official-corpus forced full-index artifact | Generated; complete local debug-run evidence, 355 scanned files, 353 refreshed current files, 2 degraded partial files, 0 not-current files. |
| `docs/solution/rga-07g-rust-index-counts.json` | Read-only Rust `dh-index.db` aggregate/per-file counts | Generated; 355 active files, 345 JS-like files, 5,819 symbols, 2,406 imports/re-exports, 13,941 calls, 60,727 references/type references. |
| `docs/solution/rga-07g-ts-baseline.json` | Non-production TypeScript baseline over the Rust active JS-like file set | Generated; 345 files, 1,605 symbols, 1,440 imports, 5,146 calls, 2,343 references. |
| `docs/solution/rga-07g-normalized-parity.json` | Normalized TS-vs-Rust count parity and gap classification | Generated; `gateEligible=false`, `gateDecision=delete_gate_blocked`. |
| `docs/solution/rga-07g-threshold-classification.json` | Compact threshold/gate decision artifact | Generated; thresholds not met and blockers explicit. |

The TypeScript baseline tool imports legacy TS extraction modules only inside an env-gated Vitest file under `docs/solution/`. It is test/parity-only evidence tooling and does not reintroduce production TypeScript graph extraction, `GraphRepo` writes, or runtime fallback behavior.

## RGA-07A inspection summary

RGA-07A established the first comparable artifacts but could not support a deletion gate:

- Legacy TS baseline: 35 files.
- Rust indexed corpus: 348 files.
- Common files: 29.
- Common-over-Rust coverage: `8.333%`.
- Rust parity CLI still treated the workspace as a curated root-level fixture set, not full official-corpus parity.
- Comparison was count-level only, not identity-level parity.

RGA-07G improved the **coverage blocker** by bypassing the TS leaf-root discovery limitation for evidence generation. It did not and cannot solve the **model-equivalence blocker**: the legacy TS extractor and Rust extractor emit different fact models, and no current tooling provides stable identity keys for a real symbol/import/call/reference parity gate.

## Official corpus and coverage

Source artifacts:

- Rust index refresh: `docs/solution/rga-07g-official-cold-full-index.json`
- Rust count artifact: `docs/solution/rga-07g-rust-index-counts.json`
- TS baseline artifact: `docs/solution/rga-07g-ts-baseline.json`
- Normalized parity: `docs/solution/rga-07g-normalized-parity.json`

Coverage from `rga-07g-normalized-parity.json`:

| Field | Value |
| --- | ---: |
| Rust indexed active files, all languages/statuses | 355 |
| Rust JS-like files | 345 |
| TS baseline files | 345 |
| Common files | 345 |
| TS-only files | 0 |
| Rust-only JS-like files | 0 |
| Common-over-Rust-JS-like coverage | 100% |
| Common-over-all-Rust-active-files coverage | 97.183% |

The `97.183%` all-file coverage is caused by Rust `Unknown` skipped/non-JS-like entries. RGA-07G parity is scoped to symbol/import/call/reference parity for JS/TS graph extraction because that is the legacy TS graph extractor domain. The official DH/OpenKit corpus still has fewer than 3,000 active files; this is an approved phase-one corpus limitation, not a pass/fail exception for parity thresholds.

## Normalized parity thresholds

Required thresholds from the approved solution:

- symbols ≥ 99%
- imports/dependencies including cross-root ≥ 99%
- calls/references ≥ 95% with gaps triaged
- critical fixture queries 100% pass

Measured normalized count-level results:

| Metric | TS expected | Rust actual | Parity | Threshold | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Symbols | 1,605 | 5,819 | 27.582% | ≥99% | Fail |
| Imports/re-exports | 1,440 | 2,406 | 59.850% | ≥99% | Fail |
| Resolved imports | 32 | 1,311 | 2.441% | ≥99% | Fail |
| Cross-root resolved imports | 0 | 38 | 0.000% | ≥99% | Fail / not comparable |
| Calls | 5,146 | 13,941 | 36.913% | ≥95% | Fail |
| References/type references | 2,343 | 60,727 | 3.858% | ≥95% | Fail |
| Critical parity fixtures | 5 passed / 0 failed | 5 passed / 0 failed | 100% | 100% | Pass |

Critical fixtures were validated separately by:

```bash
cargo test -p dh-indexer --test parity_harness_test
```

Result: 5 tests passed, 0 failed.

## Gap classification

### Blocking

- `symbols_below_99_count_parity`
- `imports_below_99_count_parity`
- `cross_root_imports_below_99_count_parity`
- `calls_below_95_count_parity`
- `references_below_95_count_parity`
- `identity_level_parity_unavailable`

### True-positive gaps

- Legacy TS baseline and Rust extractor emit different symbol/reference models.
- Legacy TS import resolver does not model all Rust resolver, package-export, and cross-root metadata.
- Rust records resolved/unresolved graph edges and comprehensive references that legacy TS `GraphIndexer` did not expose as equivalent identity facts.
- TS baseline resolved only 32 imports while Rust resolved 1,311 imports and 38 cross-root imports; this is not a passable equivalence signal.

### Non-blocking noise

- DH/OpenKit remains below the 3,000-file large-corpus target, but it is still the approved official phase-one corpus.
- The comparison is intentionally count-level because current tooling lacks stable identity-key export from both sides.

### False positives

- None classified. The threshold failures are treated as real blockers because the approved gate requires parity proof, not a qualitative explanation that Rust is richer.

### Follow-up needed

- Add or expose an official TS baseline mode that covers the same file set and stable identity keys, or replace the gate with user-approved Rust-owned golden parity fixtures.
- Extend parity tooling to compare stable identities for symbols, dependencies, calls, and references instead of only aggregate counts.
- Decide whether Rust's richer fact model should supersede TS parity criteria through an explicit approved exception or revised acceptance gate; RGA-07G does not approve that.

## Threshold decision

RGA-07G is **report complete** but **not parity-gate eligible**.

| Gate condition | Decision |
| --- | --- |
| Full JS-like official-corpus coverage | Met for RGA-07G evidence generation. |
| Symbols ≥99% | Not met. |
| Imports/dependencies including cross-root ≥99% | Not met. |
| Calls/references ≥95% | Not met. |
| Critical fixture queries 100% pass | Met via Cargo parity harness test. |
| Identity-level gap triage | Not met; no current identity-level tool. |
| RGA-08 delete gate | Blocked. |

## Exact blocker and what is needed

The exact blocker is **not** only partial TS file coverage anymore. RGA-07G improved file coverage to 345/345 Rust JS-like files. The remaining blocker is that current TS/Rust parity tooling cannot produce gate-eligible parity because:

1. The normalized counts are below the approved thresholds.
2. Current comparison is aggregate/count-level and cannot prove identity-level symbol/import/call/reference equivalence.
3. The legacy TS extractor undercounts or models facts differently from Rust, especially references, resolved imports, and cross-root imports.

To unblock RGA-08 without a user-approved exception, one of these must happen:

- implement identity-level parity artifacts for both TS baseline and Rust facts and make the thresholds pass; or
- update the approved solution/scope through the proper workflow to replace TS parity with Rust-owned golden fixture coverage plus explicit acceptance of Rust's richer fact model; or
- get an explicit user-approved exception for the failing parity thresholds.

No exception is approved in this report.

## Validation commands/tools

Commands/tools run for RGA-07G:

```bash
npm test -- docs/solution/rga-07g-official-parity-tool.test.ts
RGA_07G_GENERATE_OFFICIAL_PARITY=1 npm test -- docs/solution/rga-07g-official-parity-tool.test.ts
cargo test -p dh-indexer --test parity_harness_test
cargo run -p dh-engine -- benchmark --class cold-full-index --workspace "/Users/duypham/Code/DH" --output "/Users/duypham/Code/DH/docs/solution/rga-07g-official-cold-full-index.json"
RGA_07G_GENERATE_OFFICIAL_PARITY=1 npm test -- docs/solution/rga-07g-official-parity-tool.test.ts
```

OpenKit tools used:

- `tool.import-graph status` — degraded/read-only with zero indexed graph nodes; not used as parity proof.
- `tool.syntax-outline` — available for TS tooling; degraded/unsupported for Rust files, so Rust source was inspected with direct reads after the preferred tool reported unsupported language.
- `tool.rule-scan` — required after artifact generation; record as runtime-tooling scan evidence.

## Scan/tool evidence

OpenKit `tool.rule-scan` must cover the changed RGA-07G report/tool/JSON artifacts:

- `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07g-official-parity.md`
- `docs/solution/rga-07g-official-parity-tool.test.ts`
- `docs/solution/rga-07g-official-cold-full-index.json`
- `docs/solution/rga-07g-rust-index-counts.json`
- `docs/solution/rga-07g-ts-baseline.json`
- `docs/solution/rga-07g-normalized-parity.json`
- `docs/solution/rga-07g-threshold-classification.json`

Expected classification for scan findings after generation: no blocking findings should be accepted without triage. Runtime-tooling scan evidence does not replace Cargo/Vitest validation.

## RGA-07G conclusion

RGA-07G can move to `dev_done` as a reporting/evidence task because it produced the requested official-corpus parity report and JSON artifacts, improved coverage beyond RGA-07A, validated critical fixtures, and clearly states the remaining parity blocker without fabricating a pass.

RGA-08 must remain blocked because parity thresholds are not met and no user-approved exception exists.
