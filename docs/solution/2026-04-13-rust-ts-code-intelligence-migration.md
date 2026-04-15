---
artifact_type: solution_package
version: 2
status: solution_lead_handoff
feature_id: MIGRATE-RUST-TS
feature_slug: rust-ts-code-intelligence-migration
mode: migration
lane_source: user_explicit
owner: SolutionLead
current_stage_context: migration_strategy
approval_gate: strategy_to_upgrade
---

# Solution Package: Rust + TypeScript Code Intelligence Migration

## Recommended Path

Continue the migration as a behavior-preserving, slice-based Rust engine proof. The current work item should not broaden into a rewrite: preserve DH/OpenKit workflow behavior and use Rust only to replace the code-intelligence hot paths in controlled slices.

Scope amendment: before resuming parser implementation, add a narrow **Slice 2A: Rust toolchain and installer bootstrap contract**. This is enough because it makes the Rust development prerequisite path inspectable and repeatable without turning the app installer into an unsafe system package manager. After Slice 2A, resume the original parser work as **Slice 2B: `dh-parser` TS/JS adapter**. Do not start Slice 3 indexing or bridge work until Slice 2B can produce deterministic normalized parser facts and pass Rust validation.

## Source Context

- Workflow state mirror: `.opencode/workflow-state.json`
- Progress tracker: `docs/migration/PROGRESS.md`
- Migration plan: `docs/migration/2026-04-13-rust-ts-migration-plan-dh.md`
- Architecture analysis: `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`
- Parser/indexer design: `docs/migration/deep-dive-01-indexer-parser.md`
- Bridge protocol reference: `docs/migration/deep-dive-02-bridge-jsonrpc.md`
- Graph engine reference: `docs/migration/deep-dive-03-graph-engine.md`
- Process/distribution reference: `docs/migration/deep-dive-04-process-model.md`
- Current POSIX installer surfaces inspected for this amendment: `scripts/install.sh`, `scripts/install-from-release.sh`, `scripts/install-github-release.sh`, `scripts/upgrade.sh`, `scripts/upgrade-from-release.sh`, `scripts/test-installers.sh`, `scripts/package-release.sh`, `scripts/verify-release-artifacts.sh`, `scripts/generate-homebrew-formula.sh`
- Current release/install docs inspected: `docs/operations/release-and-install.md`, `docs/homebrew.md`

## Baseline Summary

- The user explicitly selected `/migrate`; the lane is locked to `mode = migration`, `lane_source = user_explicit`.
- Target architecture is decided: **Rust owns structural code intelligence; TypeScript owns orchestration/product behavior**.
- Go is not part of the end-state, but old logic may remain temporarily as a parity/benchmark reference during transition.
- Phase 1 is scoped to proving the Rust core engine directly, before TS workflow, LLM, JSON-RPC bridge, production packaging, or Go retirement work.
- Documented Slice 1 completion from `docs/migration/PROGRESS.md`:
  - Cargo workspace with seven crates: `dh-types`, `dh-storage`, `dh-parser`, `dh-indexer`, `dh-graph`, `dh-query`, `dh-engine`.
  - `dh-types` domain types exist for files, symbols, imports, call edges, references, chunks, index state, and export facts.
  - `dh-storage` has SQLite schema initialization, PRAGMA defaults, repository traits/impls, FTS5, and 5 passing unit tests per the progress tracker.
  - `dh-engine` has minimal `init`/`status` CLI smoke coverage per the progress tracker.
  - `dh-parser` has the `LanguageAdapter` contract plus registry/pool scaffolding.
- Documented baseline validation from `docs/migration/PROGRESS.md`:
  - Rust toolchain: `rustup stable` / `rustc 1.94.1`.
  - From `rust-engine/`: `cargo build --workspace` succeeded.
  - From `rust-engine/`: `cargo test --workspace` succeeded with 5 `dh-storage` tests.
  - CLI smoke: `dh-engine init/status` worked.
- Current observed implementation surface for Slice 2 planning:
  - `rust-engine/Cargo.toml` and `rust-engine/crates/dh-parser/Cargo.toml` already include `tree-sitter`, `tree-sitter-typescript`, `tree-sitter-javascript`, and `blake3` dependencies.
  - `rust-engine/crates/dh-parser/src/registry.rs` and `rust-engine/crates/dh-parser/src/pool.rs` exist.
  - `rust-engine/crates/dh-parser/src/adapters/mod.rs` declares `pub mod typescript;`, but no `typescript.rs` or `typescript/mod.rs` adapter module was found during this planning pass. Treat that as the concrete Slice 2 implementation gap and a build-consistency hotspot to verify before coding.
- Current observed installer/bootstrap surface for the new request:
  - `scripts/install.sh` and release helpers install prebuilt `dh` binaries with checksum/signature handling; they do not currently install Rust tooling.
  - Release artifact naming currently covers macOS and Linux (`dh-darwin-*`, `dh-linux-*`); no Windows release asset or PowerShell installer was found.
  - No repository-root `rust-toolchain.toml` was found, so Rust toolchain selection is currently documented only in migration notes.
  - `rusqlite` uses the bundled SQLite feature, and tree-sitter grammars are Rust crate dependencies, so runtime users of prebuilt binaries do not need system SQLite or a `tree-sitter` CLI.

## Target Outcome

### End-State Migration Outcome

- DH moves from Go + TypeScript to **Rust + TypeScript**.
- Rust owns CLI host/process foundation, parser, scanner/indexer, graph/query/search/evidence, storage, diagnostics, and JSON-RPC server surfaces.
- TypeScript owns agents, workflow lanes, approval gates, policy, skills, LLM/provider integration, prompt/context shaping, session memory, MCP routing, and answer formatting.
- Bridge contract is JSON-RPC 2.0 over stdio with Content-Length framing, with stdout reserved for protocol frames and stderr reserved for logs.
- Distribution is side-by-side first: Rust binary + bundled Node + TS worker bundle. Single-binary optimization is deferred until later hardening.

### Current Revised Slice 2 Outcome

First add the Rust toolchain/install bootstrap contract, then implement the `dh-parser` TypeScript/JavaScript adapter so TS, TSX, JS, and JSX files can be parsed into deterministic normalized domain facts without exposing raw tree-sitter nodes outside the parser crate.

Required Slice 2 outputs:

- Runtime installers keep prebuilt `dh` install Rust-free by default.
- Development/source bootstrap has an explicit cross-OS Rust toolchain contract and consent-gated install/check flow.
- Language registry/pool dispatch works for `TypeScript`, `Tsx`, `JavaScript`, and `Jsx`.
- `TypeScriptAdapter` parses with tree-sitter error recovery.
- Extractors produce normalized `dh-types` facts for:
  - symbols: functions, classes, methods, variables/constants, interfaces, type aliases, enums, and structurally important properties/fields;
  - imports: ESM, CommonJS, dynamic import, re-export import linkage, type-only imports;
  - exports: named, aliased, default, star, namespace, re-export, type-only where represented;
  - call edges: direct calls, method calls, constructor calls, optional-call forms best-effort;
  - references: identifier read/write/type references best-effort;
  - chunks: file header, symbol, method, and class-summary chunks;
  - diagnostics: tree-sitter `ERROR`/recoverable parse diagnostics;
  - fingerprints: stable `structure_fingerprint` and `public_api_fingerprint` using deterministic ordering and hashing.
- Advanced resolution methods may remain explicit stubs in Slice 2 when honest: `resolve_imports`, `bind_references`, `bind_call_edges`, and `extract_inheritance` can record unresolved or best-effort facts rather than pretending compiler-grade binding exists.

## Preserved Invariants

These invariants are frozen for this migration and should be treated as parity contracts during implementation, review, and QA.

1. **Preserve local-first behavior.** Code intelligence, graph data, state, and storage stay local; no external graph database or remote indexing service is introduced for this migration slice.
2. **Preserve evidence-first answers.** The engine exists to produce inspectable structural facts, graph relationships, chunks, and evidence packets. It must not substitute LLM guesses for missing parser/index facts.
3. **Preserve lane/workflow semantics.** Quick, migration, and full-delivery lane behavior remains TypeScript-owned and must not change as part of Phase 1 parser work.
4. **Preserve CLI/operator trust.** Existing documented OpenKit/DH command surfaces must not regress. New Rust CLI commands should be additive and gated by validation.
5. **Preserve the ownership boundary.** Rust owns structural truth; TypeScript owns orchestration truth. TypeScript must not keep a parallel authoritative copy of code-intelligence data.
6. **Preserve normalized parser contracts.** Parser adapters return normalized domain objects from `dh-types`; graph, query, storage, and TS layers should not depend on raw tree-sitter nodes.
7. **Preserve file-atomic indexing assumptions.** Scheduling/invalidation is file-level; semantic meaning is symbol/chunk/edge-level. Slice 2 outputs must be compatible with future file-atomic writes in Slice 3.
8. **Preserve degraded-mode honesty.** Syntax-broken files may produce partial facts plus diagnostics, but fatal parser/grammar failures must mark parse failure and must not write or imply stale facts.
9. **Preserve deterministic structural identity.** Symbol keys, ranges, hashes, chunk boundaries, and fingerprint outputs must be stable enough for repeatable baseline comparisons and future incremental invalidation.
10. **Preserve bridge protocol constraints for future phases.** JSON-RPC bridge work is out of Slice 2, but later bridge code must keep Content-Length framing and stdout/stderr separation intact.
11. **Preserve Phase 1 scope.** Do not implement agent workflow, LLM integration, TS worker lifecycle, JSON-RPC bridge, production packaging, or Go removal inside Slice 2.

## Allowed Behavior Changes / Exceptions

- Adding the Rust workspace and Rust parser implementation under `rust-engine/` is allowed as an additive migration surface.
- Go may remain temporarily for parity reference and benchmark comparison, but it is not retained in the end-state.
- TypeScript/JavaScript extraction is allowed to be syntax-first and heuristic in Phase 1; full TypeScript compiler-grade type resolution is explicitly out of scope.
- Dynamic imports, conditional requires, and unresolved references may be stored as unresolved/low-confidence facts when static resolution is unsafe.
- Recoverable parse errors may still produce partial facts, provided diagnostics are captured and no stale facts are written for fatal parser failures.
- Side-by-side distribution complexity is accepted during Phase 1-3; single-binary packaging is a later optimization, not a Slice 2 goal.
- `dh-engine index --workspace` and database write integration belong to Slice 3, not Slice 2.
- Adding a Rust toolchain/bootstrap contract is allowed as migration infrastructure, provided it is additive, consent-based for system-level changes, and does not make prebuilt runtime installation depend on Rust.

## Strategy Amendment: Rust Toolchain And Installer Bootstrap

This amendment answers the user's new request to automatically prepare Rust-related tools while keeping migration semantics safe.

### Mandatory Tool List In Current Repo State

Development/source-build path for `rust-engine/`:

- **Rust toolchain manager:** `rustup` is the supported way to install and reconcile Rust toolchains across macOS, Linux, and Windows.
- **Rust compiler/toolchain:** the baseline is `rustup stable` with observed `rustc 1.94.1`; implementation should encode the chosen channel in a checked-in toolchain file rather than relying on a developer's ambient default.
- **Cargo:** required for `cargo build --workspace` and `cargo test --workspace`; installed with the Rust toolchain.
- **Rust quality components:** `rustfmt` and `clippy` should be installed by the toolchain contract for consistent development checks, but they are not runtime dependencies.
- **Native C build chain:** required for source builds because current Rust dependencies include bundled SQLite via `rusqlite` and tree-sitter grammar crates that compile native C/C++ code.
  - macOS: Xcode Command Line Tools / `clang` toolchain.
  - Linux: distro-equivalent C compiler, linker, archiver, and libc headers such as Debian/Ubuntu `build-essential`, Fedora/RHEL `gcc gcc-c++ make`, or Arch `base-devel`.
  - Windows: MSVC C++ Build Tools plus Windows SDK for the `*-pc-windows-msvc` Rust toolchain.

Runtime/prebuilt DH install path in the current repo:

- **No Rust toolchain, Cargo, rustfmt, clippy, rust-analyzer, system SQLite, or tree-sitter CLI is mandatory** for users installing a prebuilt `dh` binary.
- Installer prerequisites such as `curl`, `shasum`/`sha256sum`, `gpg`, or PowerShell are installer mechanics, not Rust engine runtime dependencies.

Non-mandatory tools:

- `rust-analyzer` is useful for editor support but should be optional/check-only unless the user explicitly asks for IDE tooling.
- `tree-sitter` CLI is not needed because current TS/JS grammars come from Rust crates and existing TS parsing uses npm WASM packages.
- System `sqlite3` is not needed because `rusqlite` is configured with bundled SQLite.

### Required Cross-OS Contract File

Create **one required checked-in Rust toolchain contract** at repository root:

- `rust-toolchain.toml`

Recommended contract:

```toml
[toolchain]
channel = "1.94.1"
profile = "minimal"
components = ["rustfmt", "clippy"]
```

Rationale:

- `rust-toolchain.toml` is the standard cross-OS contract that `rustup` and `cargo` honor automatically.
- It makes Rust version/components inspectable and avoids embedding toolchain truth separately in shell, PowerShell, Makefile, and CI logic.
- It intentionally does not claim to install privileged OS build tools; installers should check/prompt for those separately.

If implementation discovers that pinning `1.94.1` is not viable in CI, update this strategy before substituting a floating `stable` channel.

### Auto-Install Versus Check/Prompt Policy

Auto-install only after explicit user consent or an explicit non-interactive flag such as `--with-rust-tools`, `--yes`, or `DH_INSTALL_RUST_TOOLS=1`:

- `rustup`-managed Rust toolchain from `rust-toolchain.toml`.
- `rustfmt` and `clippy` components from `rust-toolchain.toml`.

Check and prompt only; do not silently install:

- Installing `rustup` itself, because it downloads and executes third-party installer code and may update shell profile files.
- macOS Xcode Command Line Tools.
- Linux system packages such as `build-essential`, `gcc`, `clang`, `make`, `pkg-config`, `ca-certificates`, or `curl`.
- Windows Visual Studio Build Tools / MSVC / Windows SDK.
- Package managers themselves (`brew`, `apt`, `dnf`, `pacman`, `winget`, `choco`, `scoop`).

Privileged operations must require visible consent and must never run `sudo`, package-manager installs, or `curl | sh` silently from the normal runtime binary installer.

### Install Flow By OS

macOS:

- Normal `dh` binary install remains prebuilt-binary only and should not install Rust.
- Development/source install checks for `rustup`, `cargo`, and Xcode Command Line Tools.
- If `rustup` exists and consent is provided, run the `rust-toolchain.toml`-driven toolchain install/update.
- If Xcode Command Line Tools are missing, print/offer `xcode-select --install`; do not run it silently.
- Homebrew may remain a distribution path for `dh`, but the formula should not add a Rust dependency for prebuilt binaries.

Linux:

- Normal `dh` binary install remains prebuilt-binary only and should not install Rust.
- Development/source install checks for `rustup`, `cargo`, a C compiler/linker/libc headers, and required download/checksum tools.
- If `rustup` exists and consent is provided, run the `rust-toolchain.toml`-driven toolchain install/update.
- If native build packages are missing, print distro-specific commands where detected. Running `apt`, `dnf`, `pacman`, or similar must require an explicit system-package consent flag.

Windows:

- Current runtime release packaging does not yet ship Windows assets. Until `dh-windows-*.exe` artifacts and a PowerShell installer exist, Windows runtime install should fail clearly as unsupported rather than pretending parity.
- Development/source install should be a PowerShell path that checks for `rustup`, `cargo`, and MSVC Build Tools / Windows SDK.
- If `rustup` exists and consent is provided, install/update the `*-pc-windows-msvc` Rust toolchain according to `rust-toolchain.toml`.
- If MSVC Build Tools are missing, prompt with `winget`/Visual Studio Build Tools instructions; only run package-manager installation with explicit consent.

### Installer Surfaces To Update In Implementation

- `rust-toolchain.toml` — new required cross-OS Rust contract.
- `scripts/install.sh`, `scripts/install-from-release.sh`, `scripts/install-github-release.sh`, `scripts/upgrade.sh`, `scripts/upgrade-from-release.sh` — preserve default runtime install behavior; add optional Rust toolchain bootstrap/check mode only when explicitly requested.
- `scripts/test-installers.sh` — extend with no-Rust-default and Rust-bootstrap dry-run/check scenarios.
- `scripts/install-dev-tools.sh` or equivalent POSIX helper — optional but preferred to keep runtime installers small.
- `scripts/install-dev-tools.ps1` — required only if Windows development bootstrap is claimed in this slice.
- `docs/operations/release-and-install.md` and `docs/homebrew.md` — document runtime-vs-development install split and the no-silent-system-install policy.

## Impacted Surfaces

Known current and near-term surfaces:

- `rust-engine/Cargo.toml`
- `rust-engine/crates/dh-parser/Cargo.toml`
- `rust-engine/crates/dh-parser/src/lib.rs`
- `rust-engine/crates/dh-parser/src/registry.rs`
- `rust-engine/crates/dh-parser/src/pool.rs`
- `rust-engine/crates/dh-parser/src/adapters/mod.rs`
- `rust-engine/crates/dh-parser/src/adapters/typescript.rs` or `rust-engine/crates/dh-parser/src/adapters/typescript/mod.rs` — expected Slice 2 adapter target
- `rust-engine/crates/dh-types/src/lib.rs` — only if existing domain types are insufficient for adapter facts; avoid broad schema churn
- `rust-engine/crates/dh-parser/tests/` or fixture locations chosen by implementation — expected Slice 2 validation target
- `rust-toolchain.toml` — expected Slice 2A cross-OS Rust toolchain contract
- `scripts/install.sh`, `scripts/install-from-release.sh`, `scripts/install-github-release.sh`, `scripts/upgrade.sh`, `scripts/upgrade-from-release.sh`, `scripts/test-installers.sh` — expected Slice 2A POSIX install/update/test surfaces
- `scripts/install-dev-tools.sh` and `scripts/install-dev-tools.ps1` — expected Slice 2A helper surfaces if implementation separates toolchain bootstrap from binary install
- `docs/operations/release-and-install.md`, `docs/homebrew.md` — expected Slice 2A documentation surfaces

Do not modify unrelated OpenKit workflow/runtime surfaces for Slice 2A/2B unless a concrete parser or installer-contract blocker is discovered and documented.

## Compatibility Hotspots

1. **Installer privilege boundary.** User asked for automatic Rust-related tools, but silent system-level installation is unsafe. Default runtime binary install must remain Rust-free, and development bootstrap must require explicit consent before running rustup/toolchain actions.
2. **Cross-OS support mismatch.** Existing release/install surfaces are POSIX/macOS/Linux-oriented and release assets do not include Windows. Windows development bootstrap can be planned, but Windows runtime install cannot be claimed until artifacts and a PowerShell installer exist.
3. **Current parser module consistency.** `adapters/mod.rs` declares a TypeScript module that was not found during planning. First parser-upgrade action should verify `cargo build --workspace` from `rust-engine/`; if broken, restore build consistency before adding extractor depth.
4. **tree-sitter grammar/version alignment.** The workspace currently uses `tree-sitter = 0.24`, `tree-sitter-typescript = 0.23`, and `tree-sitter-javascript = 0.23`. Adapter code must match those APIs instead of examples from older docs.
5. **TS/JS parity edge cases.** Dynamic imports, re-exports, barrel files, type-only imports, CommonJS `require`, `module.exports`, `exports.foo`, conditional requires, optional calls, constructor calls, TSX/JSX syntax, interfaces, type aliases, and enums are explicit parity risks.
6. **No compiler-grade binding in Slice 2B.** Do not over-claim resolved references/calls. Prefer unresolved facts or low-confidence best-effort edges over misleading certainty.
7. **Line/column and range conventions.** Parser spans must be stable and consistently mapped so future bridge/query layers can compare locations reliably.
8. **Fingerprint determinism.** `structure_fingerprint` and `public_api_fingerprint` must sort facts deterministically before hashing; nondeterministic hash output will break future incremental invalidation.
9. **Schema alignment.** Adapter facts must fit current `dh-types` and `dh-storage` expectations, especially language IDs, symbol kinds, import kinds, reference kinds, chunk kinds, parse status, and hash fields.
10. **Storage transaction expectations.** Slice 3 will delete/rewrite facts per file. Slice 2B must not require symbol-level DB diff semantics to be correct.
11. **Protocol/log separation for later phases.** Future bridge work must keep stdout as protocol-only and stderr as logs-only; parser diagnostics should be structured data, not ad-hoc stdout output.
12. **Documentation drift around Go.** Existing architecture docs may still reference Go runtime assumptions. Defer broad doc/ADR rewrite until the Rust engine and bridge pass their gates.

## Staged Migration Slices

### Slice 0: Baseline and invariant freeze — reconciled in this package

- **Goal:** Make baseline, invariants, hotspots, and rollback checkpoints inspectable without changing workflow state.
- **Inputs:** `docs/migration/PROGRESS.md`, migration plan, architecture analysis, deep dives.
- **Validation:** Documentation review only; no source implementation.
- **Rollback checkpoint:** Revert this solution package if it misstates migration scope.

### Slice 1: Scaffold + storage — documented complete

- **Goal:** Establish Rust workspace, shared domain types, storage schema/repositories, minimal CLI, and parser/indexer/graph/query stubs.
- **Key surfaces:** `rust-engine/Cargo.toml`, `dh-types`, `dh-storage`, `dh-engine`, `dh-parser`, `dh-indexer`, `dh-graph`, `dh-query`.
- **Preserve:** Additive Rust prototype; no change to TypeScript workflow behavior.
- **Documented validation:** From `rust-engine/`, `cargo build --workspace`; from `rust-engine/`, `cargo test --workspace`; CLI smoke `dh-engine init/status`.
- **Rollback checkpoint:** Existing branch/commit before Slice 2 work; keep Slice 1 as the last known Rust baseline.

### Slice 2A: Rust toolchain and installer bootstrap contract — new migration-upgrade preflight

- **Goal:** Make Rust development prerequisites and installer behavior explicit across macOS, Linux, and Windows without making runtime binary installs depend on Rust.
- **Expected files:** `rust-toolchain.toml`, targeted installer helper updates, installer tests, and install docs listed above.
- **Dependencies:** Slice 1 Rust workspace and current release installer surfaces.
- **Implementation boundaries:**
  - Do not install anything during implementation validation unless a test intentionally uses dry-run/check-only mode or the user explicitly authorizes real installation.
  - Preserve the current prebuilt-binary install behavior for normal `scripts/install*.sh` flows.
  - Keep Rust toolchain installation opt-in/consent-based for development/source install paths.
  - Do not silently install system package managers, Xcode Command Line Tools, Linux package sets, or Visual Studio Build Tools.
  - Do not claim Windows runtime install support until Windows release artifacts and installer support actually exist.
- **Required tests/evidence:**
  - Static inspection showing `rust-toolchain.toml` contains the selected channel and required components.
  - Installer dry-run/check evidence that default runtime install does **not** attempt Rust installation.
  - macOS dry-run/check evidence for `rustup`/Xcode CLT detection and consent-gated Rust toolchain action.
  - Linux dry-run/check evidence for `rustup`/native C toolchain detection and consent-gated Rust toolchain action.
  - Windows PowerShell `-WhatIf`/check-only evidence for `rustup`/MSVC detection if Windows dev bootstrap is implemented in this slice.
  - Existing installer tests still pass for fresh install, upgrade backup, checksum pass/fail, sidecar SHA, install-from-release, and uninstall.
- **Rollback checkpoint:** If toolchain bootstrap risks unsafe privilege escalation or breaks default runtime install, keep only `rust-toolchain.toml` and remove installer auto-install hooks until a safer explicit bootstrap command is approved.

### Slice 2B: Parser TS/JS adapter — resumes after Slice 2A

- **Goal:** Implement TypeScript/JavaScript parsing and normalized fact extraction for TS/TSX/JS/JSX.
- **Expected files:** `rust-engine/crates/dh-parser/src/adapters/typescript.rs` or `typescript/mod.rs`, plus parser fixtures/tests; possibly targeted updates to `dh-parser/src/lib.rs`, `registry.rs`, `pool.rs`, and `dh-types/src/lib.rs` when existing contracts require it.
- **Dependencies:** Slice 1 workspace and domain types; Slice 2A toolchain contract; linked tree-sitter grammars already declared in current Cargo manifests.
- **Implementation boundaries:**
  - Restore/confirm workspace build before adding extractor depth.
  - Keep AST handling inside `dh-parser`.
  - Return normalized `dh-types` facts only.
  - Keep extraction deterministic.
  - Keep unresolved/best-effort semantics explicit.
  - Do not start the indexer DB writer, JSON-RPC bridge, TS worker, LLM integration, or Go retirement.
- **Required tests/evidence:**
  - Unit fixtures for TS, TSX, JS, and JSX parsing.
  - Assertions for symbol/import/export extraction at minimum.
  - Targeted coverage for dynamic import, CommonJS, type-only import, re-export/barrel, class/method, interface/type/enum, direct/method/constructor call, syntax error diagnostics, chunk extraction, and fingerprint determinism where feasible.
  - From `rust-engine/`: `cargo build --workspace`.
  - From `rust-engine/`: `cargo test --workspace`.
- **Rollback checkpoint:** If adapter extraction produces unstable or misleading facts, keep registry/pool and disable/revert the risky extractor portions to explicit unresolved/stub output rather than shipping false parity.

### Slice 3: Indexer pipeline — blocked until Slice 2B is stable

- **Goal:** Scanner, ignore handling, content hash prefilter, dirty set builder, parser-worker dispatch, single DB writer, and `dh-engine index --workspace <path>`.
- **Dependency:** Slice 2B normalized parser facts and fixture tests.
- **Validation:** Index fixture repository, write facts through `dh-storage`, run `cargo build --workspace` and `cargo test --workspace`, then smoke `dh-engine index --workspace <fixture>` once implemented.
- **Rollback checkpoint:** If DB writes or invalidation produce inconsistent facts, revert to parser-only extraction and stop before graph/query work.

### Slice 4: Parity harness + benchmark — required before deeper migration

- **Goal:** Compare Rust extractor output against the existing TS/Go-side baseline on a benchmark corpus.
- **Metrics:** Symbol count/kind/range/export parity, import edge completeness, reference/call precision where available, cold index time, incremental time, query latency, peak RSS, evidence packet quality.
- **Validation:** Repeatable benchmark corpus and parity report.
- **Rollback checkpoint:** If Rust does not reach acceptable TS/JS structural parity, stop Phase 1 as experimental and re-evaluate before bridge/workflow migration.

### Later phases — not in current handoff

- Phase 2: JSON-RPC bridge + basic agent end-to-end.
- Phase 3: deeper graph/query/search/evidence capability.
- Phase 4: full workflow/multi-agent parity.
- Phase 5: production hardening, diagnostics, packaging, distribution, language expansion.

## Dependency Graph And Parallelization

- `parallel_mode`: `none`
- **Why:** Current migration risk spans shared installer/distribution surfaces plus parser/domain-contract drift. Installer scripts and docs must preserve default runtime install behavior before parser work proceeds; `dh-parser`, `dh-types`, fixtures, and Cargo workspace validation are also shared surfaces. Parallel implementation would increase hidden collision risk.
- **Sequential constraints:** `Slice 0 -> Slice 1 -> Slice 2A -> Slice 2B -> Slice 3 -> Slice 4`
- **Integration checkpoint:** Slice 2A is integrated only when runtime installs remain Rust-free by default and development/source bootstrap behavior is consent-gated and dry-run validated. Slice 2B is integrated only when the workspace builds, parser tests pass, TS/JS fixture outputs are inspectable, and unresolved/best-effort extraction limitations are documented.
- **Runtime note:** Migration has no full-delivery task board. If a migration slice board is introduced later, keep explicit `depends_on` edges aligned with the sequence above.

## Validation Reality And Evidence Path

### Real validation paths that exist for this migration

- Rust workspace validation exists under `rust-engine/`.
- Documented commands from migration progress:
  - `cargo build --workspace`
  - `cargo test --workspace`
- Documented smoke surface:
  - `dh-engine init/status`
- Current repository-wide OpenKit docs still say there is no generic target-application build/lint/test command. Do not substitute `npm`, `pnpm`, or arbitrary TS test commands for this Rust migration unless new tooling is added and documented.

### Evidence path for Slice 2

1. Slice 2A toolchain contract evidence: inspect `rust-toolchain.toml`, prove normal binary install does not install Rust, and record dry-run/check-only outputs for consent-gated Rust toolchain bootstrap on supported OS paths.
2. Slice 2A installer regression evidence: run/extend installer tests so fresh install, upgrade backup, checksum pass/fail, sidecar SHA, install-from-release, uninstall, and no-Rust-default behavior remain covered.
3. Slice 2B preflight: record whether `cargo build --workspace` passes from `rust-engine/` before adapter work.
4. Slice 2B adapter facts: record fixture files and expected normalized outputs for symbols, imports, exports, calls, references, chunks, diagnostics, and hashes.
5. Slice 2B automated evidence: run `cargo build --workspace` and `cargo test --workspace` after implementation.
6. Parity evidence: until Slice 4 harness exists, use fixture-level expected facts and manual comparison notes. Do not claim full TS/JS parity from Slice 2B alone.
7. Review evidence: before `migration_code_review`, workflow policy requires `tool.rule-scan` or `tool.codemod-preview` evidence, or an explicit manual override if the tool is unavailable.
8. QA evidence: before `migration_done`, QA should compare preserved invariants, Rust/Cargo outputs, installer-bootstrap evidence, fixture parity notes, and any benchmark/harness artifacts that exist by then.

## Rollback Checkpoints

1. **Baseline checkpoint:** Current Slice 1 Rust workspace with documented build/test/CLI smoke evidence.
2. **Installer-safety checkpoint:** After Slice 2A, normal runtime binary install must remain Rust-free by default. Revert auto-install hooks if they install or prompt for privileged system tools without explicit consent.
3. **Build-consistency checkpoint:** Before adding TypeScriptAdapter depth, confirm current workspace build status. If the missing `typescript` module breaks the build, fix or revert the partial module declaration first.
4. **Grammar dependency checkpoint:** After tree-sitter dependency/API use is confirmed, run Rust build/tests. Revert grammar or adapter API changes if version mismatch blocks the workspace.
5. **Minimal extraction checkpoint:** After parse + symbols/imports/exports work, run parser fixture tests. Revert or narrow extraction if normalized facts are unstable.
6. **Best-effort edge checkpoint:** After calls/references/chunks/fingerprints, run tests and inspect fixture output. Disable misleading resolved edges rather than shipping false graph facts.
7. **Pre-indexer checkpoint:** Do not start Slice 3 until Slice 2B outputs are deterministic and documented. If Slice 2B cannot stabilize, pause migration instead of pushing complexity into the indexer.
8. **Phase 1 gate checkpoint:** If the Rust engine cannot meet acceptable TS/JS structural parity in Slice 4, stop before bridge/workflow migration and reassess.

## Reviewer And QA Focus Points

- Scope compliance first: Slice 2A must remain installer/toolchain-contract only, and Slice 2B must remain parser-only. Neither slice may drift into bridge, workflow, LLM, production packaging rewrite, or Go-removal work.
- Installer scope compliance: Slice 2A may add toolchain contract/bootstrap support only; it must not rewrite distribution, force Rust onto runtime users, or claim unsupported Windows binary install parity.
- Installer safety: no silent privileged package installation, no silent package-manager bootstrap, and no unprompted `curl | sh` style rustup installation.
- Fact correctness over breadth: incomplete honest unresolved facts are preferable to broad but false resolved graph facts.
- Determinism: sorted extraction output and stable fingerprints matter for future incremental invalidation.
- Error recovery: syntax-broken files should preserve safe partial facts and diagnostics without crashing or implying stale data.
- Fixture quality: tests should validate behavior/parity facts, not just that functions compile.
- Documentation honesty: keep missing validation tooling and parity-harness gaps explicit until Slice 4 provides repeatable comparison evidence.

## Handoff Assessment

- **Baseline-to-strategy readiness:** Sufficient. Baseline, target outcome, preserved invariants, allowed exceptions, hotspots, rollback checkpoints, validation reality, and Slice 2 strategy are now inspectable in this package.
- **Strategy-to-upgrade readiness for revised Slice 2:** Sufficient as a technical handoff after the appropriate gate is approved. Execute Slice 2A first to lock the Rust toolchain/install contract safely, then resume Slice 2B with a build-consistency preflight for `rust-engine/`, because current planning observed a declared but missing TypeScript adapter module.
