# Scope Package: OpenCode SDK Runtime Bridge

Date: 2026-04-10
Owner: DH runtime/application team
Execution driver: `docs/architecture/opencode-sdk-runtime-bridge-checklist.md`
Target package: `packages/opencode-sdk/`

---

## Problem Statement

`packages/opencode-sdk/` is currently a minimal placeholder (one generic protocol type, bare `package.json`) while actual TS-to-Go bridge behavior lives scattered across other DH packages. This creates three concrete problems:

1. **No canonical contract surface** — TS callers duplicate bridge types locally, leading to drift between what TS writes and what Go reads.
2. **Doc drift** — Architecture docs still describe `opencode-sdk` as a "forked TypeScript SDK" and reference Node/single-binary packaging as current-state facts, contradicting the ADR decision that this package is dh-owned original code.
3. **No migration path** — Without SDK-level abstractions, adopting future transport modes (IPC, revised protocol) would require touching every caller individually.

The user value is runtime correctness and maintainability: when the TS orchestration layer writes decisions that the Go runtime reads, the contract must be explicit, typed, and centrally owned.

---

## Current State vs Target State

| Dimension | Current state | Target state |
|---|---|---|
| Contract surface | Single generic `OpenCodeProtocolMessage` type (`kind: string, payload: Record<string, unknown>`) | Versioned, strongly-typed exports covering all bridge modes |
| Bridge modes covered | None formally; behavior lives in runtime/shared/core packages | SQLite decision-log, filesystem/session mirror, delegated CLI path, IPC-prep stubs |
| Runtime client helpers | None in SDK; callers manage serialization, key normalization, error handling directly | SDK-owned helpers for read/write, normalization, envelope context, typed errors |
| Consumer adoption | Zero SDK imports by production code | At least one critical decision path consumes SDK types and helpers end-to-end |
| Duplicate bridge types | Scattered across TS packages | Reduced; remaining duplicates documented with removal criteria |
| Architecture docs | Mix "forked SDK" and "dh-owned bridge" language; Node/single-binary messaging unclear on current vs target | Consistently say "dh-owned internal bridge SDK"; packaging language separates current behavior from target |
| Package metadata | Bare `package.json` (name + private + type) | Exports map, version field, updated README/PATCHES reflecting implemented surface |

---

## In Scope

All items below correspond to the six phases in the execution checklist.

1. **Baseline alignment (Phase A)** — Inventory existing TS-side bridge writers/readers, Go-side contract expectations, and doc drift locations. Produce a current-vs-target delta note.
2. **Contract design (Phase B)** — Define canonical module structure (`types/`, `protocol/`, `client/`, `compat/`), decision contract types for all six hook surfaces, envelope/session identity contracts, transport-mode abstraction enum, key-shape normalization policy, error/result envelope shape, and contract versioning approach.
3. **Protocol and types implementation (Phase C)** — Implement approved contracts in `packages/opencode-sdk/src/`, replace placeholder type, update package exports/metadata/README/PATCHES.
4. **Runtime client helpers (Phase D)** — Implement helpers for SQLite decision-log mode (primary), filesystem/session mirrors, delegated CLI-path contracts, and IPC placeholder interfaces. Add usage examples and race/order safety notes.
5. **Incremental migration (Phase E)** — Migrate existing TS callers in three risk tiers: type-only consumers (Tier 1), serialization/parsing callers (Tier 2), decision write/read paths (Tier 3). Record parity checks after each slice. Maintain compatibility shims where needed.
6. **Documentation realignment (Phase F)** — Correct all architecture docs that say "forked SDK". Separate current-state from target-state in Node/single-binary messaging. Add bridge extension guide and migration status snapshot.

---

## Out of Scope

- Re-forking or vendoring any third-party TypeScript SDK.
- Modifying the Go bridge implementation inside `packages/opencode-core/`.
- Redesigning runtime lane/workflow policy.
- Implementing IPC runtime transport beyond contract stubs.
- Full single-binary build pipeline changes (packaging is a separate concern).
- Changes to upstream update plan or Go-side hook wiring.

---

## Business Rules

1. `packages/opencode-sdk/` is dh-owned original code. No upstream fork lineage applies. All docs must reflect this.
2. Phases are sequential with explicit exit checks. Do not start Phase N+1 until Phase N exit checks pass, except where the checklist notes parallel opportunities.
3. Migration must be incremental (three risk tiers). No big-bang rewrite. Each slice must include behavior-parity evidence before proceeding.
4. Key-shape normalization (camelCase/snake_case) must be handled by the SDK, not by individual callers.
5. IPC is a non-goal for the first completion milestone. Contract stubs are required; runtime implementation is not.
6. Every completed checklist item must include evidence (file paths, validation command, or manual verification note) and a dated progress log entry.
7. Compatibility shims are allowed where immediate full cutover is unsafe, but each shim must have an owner and documented removal criteria.

---

## Acceptance Criteria Matrix

Each criterion maps to a Definition of Done item from the checklist. All must be true for completion.

| # | Criterion | Checklist DoD reference | Observable check |
|---|---|---|---|
| AC-1 | `packages/opencode-sdk/` exports a versioned TS contract surface for runtime bridge communication | DoD item 1 | Package has `exports` map in `package.json`; consumers can import typed contracts without local duplication |
| AC-2 | Bridge protocol types cover all four current runtime modes: SQLite decision rows, filesystem/session mirrors, delegated CLI path, IPC-prep stubs | DoD item 2 | Type definitions exist for each mode with a discriminated transport-mode union |
| AC-3 | Runtime client helper layer exists and is consumed by at least one existing production path | DoD item 3 | At least one TS call site imports and uses SDK helpers for a decision read/write flow |
| AC-4 | Existing direct/duplicated bridge types in TS packages are reduced or replaced by SDK types | DoD item 4 | Diff shows removed local bridge types; remaining duplicates listed with removal criteria |
| AC-5 | Migration notes and compatibility guardrails documented for not-yet-migrated paths | DoD item 5 | Migration status snapshot section exists in checklist progress log |
| AC-6 | Architecture docs updated to reflect dh-owned bridge SDK (not upstream fork) | DoD item 6 | No architecture doc under `docs/` contains "forked TypeScript SDK" referring to `opencode-sdk` without correction |
| AC-7 | Validation evidence captured for each completed phase | DoD item 7 | Each completed checklist item has evidence pointer in progress log |
| AC-8 | Blockers and known gaps recorded explicitly with owner and next action | DoD item 8 | Any blocked item uses the checklist's blocker format; no silent gaps |

---

## Key Risks and Assumptions

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Doc drift continues** — new docs or edits reintroduce "forked SDK" language | Contradicts ADR, confuses future sessions | Phase F exit check; grep-based verification |
| **Contract drift vs Go** — TS types diverge from Go reader expectations | Silent runtime failures on decision reads | Phase B must inventory Go-side expectations; parity checks in Phase E |
| **Key-shape mismatch** — camelCase/snake_case normalization misses edge cases | Payload fields silently ignored by Go runtime | Explicit normalization policy in Phase B; integration-level validation |
| **Migration regression** — replacing direct callers breaks enforcement behavior | Decision pipeline failure | Tier-based migration with evidence after each slice |
| **Packaging messaging confusion** — Node/single-binary wording read as current state | Misleading contributor expectations | Phase F separates current behavior from target in every affected doc |
| **IPC overreach** — attempting IPC runtime before contracts are stable | Delays the achievable baseline | IPC explicitly marked non-goal for first milestone |

### Assumptions

1. The current SQLite decision-log path (TS writes, Go reads) is the primary bridge mode that must work correctly first.
2. Go-side bridge contract expectations are discoverable from `packages/opencode-core/` source and existing integration tests.
3. The repo has TypeScript build/typecheck tooling available (`tsconfig.json`, `vitest.config.ts` at root); validation can use `tsc --noEmit` at minimum.
4. No other team is concurrently modifying `packages/opencode-sdk/` or the bridge contract surface.
5. `FORK_ORIGIN.md` and `PATCHES.md` already correctly classify the package as dh-owned; these files need content updates, not classification changes.

---

## Execution Sequencing Expectations

```
Phase A (Baseline alignment)
  |
  v
Phase B (Contract design)       <- soft parallel: A doc inventory + B brainstorming
  |
  v
Phase C (Types implementation)
  |
  v
Phase D (Client helpers)
  |
  v
Phase E (Incremental migration)
  |                              <- soft parallel: F draft prep during E
  v
Phase F (Doc realignment)
```

**Hard sequencing rules (from checklist):**
- B depends on A baseline inventory
- C depends on B approved contract shape
- D depends on C exported types
- E depends on D helper readiness
- F depends on E outcomes (completed or explicitly deferred)

**Parallel opportunities:**
- Phase A doc-drift inventory can run alongside contract brainstorming
- Phase F draft updates can be prepared early but finalized only after Phase E

**Slice discipline:**
- Phase E migration proceeds Tier 1 -> Tier 2 -> Tier 3 with evidence gates between tiers
- Do not start Tier 3 (decision paths) until contract and helper interfaces are stable

---

## Handoff Notes for Solution Lead

1. The execution checklist at `docs/architecture/opencode-sdk-runtime-bridge-checklist.md` is the primary task tracker. Solution design should map implementation tasks to checklist items, not create a parallel tracking structure.
2. Phase A requires reading Go-side source in `packages/opencode-core/` to inventory bridge expectations. Plan for exploration time.
3. The contract design (Phase B) is the highest-risk design decision. It defines the type surface that all subsequent phases depend on. Allocate review time before approving for implementation.
4. Existing integration tests in `packages/opencode-core/internal/bridge/integration_test.go` are the closest thing to a behavioral specification for the TS-write/Go-read contract. Use them as a reference.
5. The doc drift inventory should produce an actionable list (file + line + required change) that Phase F can execute mechanically.
6. Validation strategy should combine `tsc --noEmit` for type safety, existing vitest infrastructure if tests are added, and manual verification notes where automated tooling is unavailable.
