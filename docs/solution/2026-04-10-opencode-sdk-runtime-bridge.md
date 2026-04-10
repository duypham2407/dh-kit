# Solution Package: OpenCode SDK Runtime Bridge

**Date:** 2026-04-10
**Upstream scope:** `docs/scope/2026-04-10-opencode-sdk-runtime-bridge.md`
**Execution tracker:** `docs/architecture/opencode-sdk-runtime-bridge-checklist.md`
**Target package:** `packages/opencode-sdk/`

---

## Recommended Path

Promote `packages/opencode-sdk/` from a single-type placeholder into a typed bridge SDK by:

1. Extracting contract types from the Go-side expectations already codified in `packages/opencode-core/internal/bridge/` and `pkg/types/`.
2. Building a thin client-helper layer that owns serialization, key normalization, and error shaping.
3. Migrating existing TS callers tier-by-tier, starting with type-only consumers and ending with decision write paths.
4. Correcting doc drift mechanically from an inventory list.

This approach is enough because the Go bridge contract is already well-defined and tested (`integration_test.go` has 394 lines covering all six hook surfaces). The SDK's job is to make the TS side match that contract explicitly rather than implicitly.

---

## Dependencies

- **No new npm packages required.** The SDK uses only Node.js built-in types and existing `packages/shared` / `packages/storage` infrastructure.
- **No new environment variables required.**
- **Build/type tooling already available:** `tsc --noEmit` (root `npm run check`), `vitest run` (root `npm run test`).

---

## Impacted Surfaces

### Primary (will be created/modified)

| File / Directory | Change |
|---|---|
| `packages/opencode-sdk/src/types/protocol.ts` | Replace placeholder with concrete bridge protocol types |
| `packages/opencode-sdk/src/types/` (new files) | Hook decision, envelope, session, model, transport-mode types |
| `packages/opencode-sdk/src/protocol/` (new) | Envelope/message contracts, key-normalization policy |
| `packages/opencode-sdk/src/client/` (new) | Runtime client helpers for decision read/write, session, model |
| `packages/opencode-sdk/src/compat/` (new) | Key-shape normalizers, compatibility shims for migration |
| `packages/opencode-sdk/src/index.ts` (new) | Barrel export |
| `packages/opencode-sdk/package.json` | Add `version`, `exports` map, `types` field |
| `packages/opencode-sdk/tsconfig.json` | No change expected (already extends root) |
| `packages/opencode-sdk/README.md` | Rewrite: dh-owned bridge SDK, implemented surface |
| `packages/opencode-sdk/PATCHES.md` | Update with new files and rationale |

### Secondary (migration consumers)

| File | Migration tier | Change |
|---|---|---|
| `packages/shared/src/types/audit.ts` | Tier 1 | `HookInvocationLog` type re-exported from SDK or replaced |
| `packages/shared/src/types/execution-envelope.ts` | Tier 1 | Bridge-relevant fields aligned with SDK envelope types |
| `packages/shared/src/types/session.ts` | Tier 1 | `SessionState` bridge-relevant fields aligned |
| `packages/shared/src/types/lane.ts` | Tier 1 | Type re-exports or SDK references |
| `packages/shared/src/types/model.ts` | Tier 1 | `ResolvedModelSelection` aligned |
| `packages/storage/src/sqlite/repositories/hook-invocation-logs-repo.ts` | Tier 2 | Use SDK serialization/normalization helpers |
| `packages/opencode-app/src/executor/hook-enforcer.ts` | Tier 3 | Use SDK client helpers for decision write flow |
| `packages/runtime/src/workflow/workflow-audit-service.ts` | Tier 3 | Use SDK client helpers for audit decision writes |
| `packages/runtime/src/diagnostics/debug-dump.ts` | Tier 2 | Import SDK types for diagnostics |
| `packages/runtime/src/diagnostics/doctor.ts` | Tier 2 | No type change needed; already uses raw SQL |

### Documentation (Phase F corrections)

Files containing "forked TypeScript SDK" or equivalent language requiring correction:

| File | Lines | Required change |
|---|---|---|
| `docs/architecture/opencode-integration-decision.md` | 200 | `Forked TypeScript SDK` -> `dh-owned internal bridge SDK` |
| `docs/architecture/system-overview.md` | 148, 195 | Same correction |
| `docs/architecture/source-tree-blueprint.md` | 147, 193 | Same correction |
| `docs/architecture/implementation-sequence.md` | 67 | `Fork OpenCode TypeScript SDK` -> `Establish dh-owned bridge SDK` |
| `docs/architecture/personal-cli-architecture.md` | 7, 140 | Reword to remove fork-SDK implication |
| `docs/architecture/workflow-orchestration.md` | 469 | Clarify SDK ownership |
| `packages/opencode-sdk/README.md` | 7 | `future forked SDK` -> `dh-owned internal bridge SDK` |

---

## Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Contract drift vs Go** | High | SDK types are derived directly from Go `bridge.go` structs and `sqlite_reader.go` dual-key patterns; integration tests in Go validate parity |
| **Key-shape mismatch** | High | SDK normalizer must handle both camelCase and snake_case; Go side already accepts both via `outputString(output, "camelKey", "snake_key")` |
| **Migration regression** | Medium | Tier-based migration with typecheck + test pass after each tier; compatibility shims bridge the gap |
| **Doc drift reintroduction** | Low | Phase F exit check: grep for "forked.*SDK" across `docs/` and `packages/opencode-sdk/` |

---

## Solution Slices

### Slice 1: Baseline Inventory (Phase A)

**Goal:** Establish the factual delta between current scattered bridge types and the Go-side contract expectations. This is research/documentation output, not code.

**Files:**
- `docs/architecture/opencode-sdk-runtime-bridge-checklist.md` (append to Progress Log)

**Actions:**
1. Snapshot current `packages/opencode-sdk/` state (already documented above).
2. Inventory Go-side contract surface from:
   - `packages/opencode-core/internal/bridge/bridge.go` — `HookDecisionRow`, `DecisionReader` interface (6 methods)
   - `packages/opencode-core/internal/bridge/sqlite_reader.go` — dual-key patterns, `rawHookLogRow` shape, `outputString`/`outputBool`/`outputAnyArray` helpers
   - `packages/opencode-core/pkg/types/types.go` — `ExecutionEnvelope`, `DhSessionState`
   - `packages/opencode-core/internal/dhhooks/dhhooks.go` — 6 hook signatures: `ModelOverride`, `PreToolExec`, `PreAnswer`, `SessionState`, `SkillActivation`, `McpRouting`
3. Inventory TS-side bridge types already in use:
   - `packages/shared/src/types/audit.ts` — `HookInvocationLog` (6 hook names, 3 decisions)
   - `packages/shared/src/types/execution-envelope.ts` — `ExecutionEnvelopeState`
   - `packages/shared/src/types/session.ts` — `SessionState`
   - `packages/shared/src/types/lane.ts` — `WorkflowLane`, `SemanticMode`, `ToolEnforcementLevel`
   - `packages/shared/src/types/model.ts` — `ResolvedModelSelection`
4. Record the doc-drift inventory (7 files, specific lines listed in Impacted Surfaces above).
5. Produce current-vs-target delta note appended to checklist Progress Log.

**Validation:** Inventory note exists in checklist. Reviewable before Phase B starts.

**Exit check:** Baseline note reviewed; doc-drift list complete.

---

### Slice 2: Contract Design (Phase B)

**Goal:** Define the canonical module structure and type contracts for the SDK, grounded in the Go-side expectations inventoried in Slice 1.

**Files:**
- Contract design note appended to checklist Progress Log or as a dedicated section

**Key design decisions:**

#### Module structure
```
packages/opencode-sdk/src/
  types/
    hook-decision.ts       # HookDecisionRow mirror, decision union, hook-name union
    envelope.ts            # ExecutionEnvelope bridge type (Go-compatible)
    session.ts             # DhSessionState bridge type (Go-compatible)
    model.ts               # ResolvedModel bridge type
    transport-mode.ts      # TransportMode enum: sqlite | filesystem | cli | ipc
    protocol.ts            # (replaces placeholder) OpenCodeBridgeMessage discriminated union
  protocol/
    envelope-contract.ts   # Envelope identity, session fallback semantics
    key-normalization.ts   # camelCase <-> snake_case policy
    versioning.ts          # Protocol version constant
    error-envelope.ts      # BridgeError / BridgeResult<T> shape
  client/
    decision-writer.ts     # Write decision payloads to SQLite via storage layer
    session-client.ts      # Session state bridge helpers
    model-client.ts        # Model override bridge helpers
    skill-client.ts        # Skill activation bridge helpers
    mcp-client.ts          # MCP routing bridge helpers
  compat/
    key-normalizer.ts      # Bidirectional camelCase/snake_case normalizer
    legacy-shims.ts        # Re-exports for callers not yet migrated
  index.ts                 # Barrel export
```

#### Hook decision types (derived from Go `bridge.go`)
- `HookName`: `"model_override" | "pre_tool_exec" | "pre_answer" | "session_state" | "skill_activation" | "mcp_routing"` — matches Go `dhhooks.go` registry fields and existing TS `HookInvocationLog["hookName"]`
- `HookDecision`: `"allow" | "block" | "modify"` — matches Go `Evaluate()` logic
- `HookDecisionRecord`: mirrors Go `HookDecisionRow` with both camelCase (TS) and snake_case (SQLite column) awareness

#### Transport mode
- Discriminated union: `TransportMode = "sqlite" | "filesystem" | "cli" | "ipc"`
- Only `sqlite` has runtime implementation in this milestone
- `ipc` is contract-stub only (explicit non-goal per scope)

#### Key normalization policy
- SDK owns a `normalizePayloadKeys(payload, target: "camelCase" | "snake_case")` function
- Default: TS callers write camelCase; SDK normalizes to snake_case for SQLite persistence
- Go reader already handles both via `outputString(output, "camelKey", "snake_key")`; SDK normalization is a safety belt, not a hard requirement

#### Error/result envelope
- `BridgeResult<T> = { ok: true; value: T } | { ok: false; error: BridgeError }`
- `BridgeError = { code: string; message: string; hookName?: HookName }`

#### Contract versioning
- `BRIDGE_PROTOCOL_VERSION = 1` constant
- Compatibility note: version increment only when Go-side reader changes are also required

**Validation:** Contract design note reviewed before implementation starts.

**Exit check:** All six hook surfaces represented; transport-mode enum defined; key-normalization policy documented.

---

### Slice 3: Types and Protocol Implementation (Phase C)

**Goal:** Implement the approved contract surface in `packages/opencode-sdk/src/`. Replace placeholder. Update package metadata.

**Files to create:**
- `packages/opencode-sdk/src/types/hook-decision.ts`
- `packages/opencode-sdk/src/types/envelope.ts`
- `packages/opencode-sdk/src/types/session.ts`
- `packages/opencode-sdk/src/types/model.ts`
- `packages/opencode-sdk/src/types/transport-mode.ts`
- `packages/opencode-sdk/src/protocol/envelope-contract.ts`
- `packages/opencode-sdk/src/protocol/key-normalization.ts`
- `packages/opencode-sdk/src/protocol/versioning.ts`
- `packages/opencode-sdk/src/protocol/error-envelope.ts`
- `packages/opencode-sdk/src/compat/key-normalizer.ts`
- `packages/opencode-sdk/src/index.ts`

**Files to modify:**
- `packages/opencode-sdk/src/types/protocol.ts` — replace `OpenCodeProtocolMessage` with concrete discriminated union
- `packages/opencode-sdk/package.json` — add `version: "0.1.0"`, `exports` map pointing to `src/index.ts`
- `packages/opencode-sdk/README.md` — rewrite to describe dh-owned bridge SDK and implemented surface
- `packages/opencode-sdk/PATCHES.md` — add entries for all new files with rationale

**Type alignment contract (Go parity):**

The following TS types must produce `output_json` payloads that Go `sqlite_reader.go` can parse:

| Go reader method | Expected JSON keys (both forms) | SDK TS type source |
|---|---|---|
| `LatestSessionState` | `lane`, `laneLocked`/`lane_locked`, `currentStage`/`current_stage`, `semanticMode`/`semantic_mode`, `toolEnforcementLevel`/`tool_enforcement_level`, `activeWorkItemIds`/`active_work_item_ids` | `types/session.ts` |
| `LatestResolvedModel` | `providerId`/`provider_id`, `modelId`/`model_id`, `variantId`/`variant_id` | `types/model.ts` |
| `LatestSkills` | `skills`/`active_skills` | `types/hook-decision.ts` skill payload |
| `LatestMcps` | `mcps`/`active_mcps` | `types/hook-decision.ts` mcp payload |
| `LatestDecision` | `id`, `session_id`, `envelope_id`, `hook_name`, `decision`, `reason` | `types/hook-decision.ts` |

**Validation:**
- `npm run check` passes (`tsc --noEmit`)
- SDK types can be imported from another package without error (manual verification or test)
- `npm run test` continues to pass (no regression)

**Exit check:** SDK typecheck passes; at least one package can import SDK types without local duplication.

---

### Slice 4: Runtime Client Helpers (Phase D)

**Goal:** Implement helper functions so callers stop directly managing bridge serialization and key normalization.

**Files to create:**
- `packages/opencode-sdk/src/client/decision-writer.ts`
- `packages/opencode-sdk/src/client/session-client.ts`
- `packages/opencode-sdk/src/client/model-client.ts`
- `packages/opencode-sdk/src/client/skill-client.ts`
- `packages/opencode-sdk/src/client/mcp-client.ts`
- `packages/opencode-sdk/src/compat/legacy-shims.ts`

**Design constraints:**
- Client helpers depend on `packages/storage/src/sqlite/` for actual DB access. The SDK does **not** re-implement SQLite access; it wraps `HookInvocationLogsRepo` with typed contracts and normalization.
- Decision writer helper: accepts typed `HookDecisionInput` (envelope, hook name, decision, output payload), normalizes keys, delegates to `HookInvocationLogsRepo.save()`.
- Session client: writes session-state decisions with typed `DhSessionStateBridge` payload.
- Model client: writes model-override decisions with typed `ResolvedModelBridge` payload.
- Skill/MCP clients: write activation/routing decisions with typed array payloads.
- All client helpers return `BridgeResult<T>` with structured errors.
- Race/order safety note: document that Go reads "latest by timestamp" so TS must write decisions before the Go hook fires. The current architecture guarantees this because TS writes in the same process before yielding to Go.

**IPC stubs:**
- `packages/opencode-sdk/src/client/ipc-stub.ts` — interface-only with `TODO: not implemented for v1` markers
- No runtime dependency on IPC transport

**Validation:**
- `npm run check` passes
- `npm run test` passes
- At least one existing TS path uses SDK client helpers (integrated in Slice 5 Tier 3, but helper unit tests can run here)

**Exit check:** Helper API compiles; normalization logic tested; no caller reimplements what SDK now owns.

---

### Slice 5: Incremental Migration (Phase E)

**Goal:** Move existing TS callers to SDK types and helpers in three risk tiers with evidence after each.

#### Tier 1: Type-only consumers (lowest risk)

**Files to modify:**
- `packages/shared/src/types/audit.ts` — `HookInvocationLog` either re-exported from SDK or replaced with SDK import + compatibility alias
- `packages/shared/src/types/execution-envelope.ts` — bridge-relevant fields reference SDK envelope types
- `packages/shared/src/types/session.ts` — bridge-relevant fields reference SDK session types
- `packages/shared/src/types/lane.ts` — verify alignment, add re-export if needed
- `packages/shared/src/types/model.ts` — `ResolvedModelSelection` aligned with SDK

**Strategy:** Prefer re-exports from `packages/shared` that point to SDK types, preserving the existing import paths for all current consumers. This minimizes churn.

**Validation after Tier 1:**
- `npm run check` passes
- `npm run test` passes
- No type errors in downstream packages

**Parity check:** All consumers that previously imported `HookInvocationLog` from shared still compile and behave identically.

#### Tier 2: Serialization/parsing callers

**Files to modify:**
- `packages/storage/src/sqlite/repositories/hook-invocation-logs-repo.ts` — use SDK key-normalization helpers for `toHookLog()` conversion; import SDK types for `RawHookLog` mapping
- `packages/runtime/src/diagnostics/debug-dump.ts` — import types from SDK path
- `packages/runtime/src/diagnostics/doctor.ts` — no change needed (uses raw SQL checks, not typed bridge)

**Strategy:** The `HookInvocationLogsRepo` is the central TS bridge writer. Its `save()` and `toHookLog()` methods should use SDK normalization. The repo class itself stays in `packages/storage` (SDK does not own persistence implementation).

**Validation after Tier 2:**
- `npm run check` passes
- `npm run test` passes
- Existing `repos.test.ts` hook-invocation-log tests still pass

**Parity check:** Hook log round-trip (write TS, verify structure) unchanged.

#### Tier 3: Decision write/read paths (highest impact)

**Files to modify:**
- `packages/opencode-app/src/executor/hook-enforcer.ts` — use SDK `DecisionWriter` helper instead of directly constructing `HookInvocationLog` and calling `HookInvocationLogsRepo.save()`
- `packages/runtime/src/workflow/workflow-audit-service.ts` — use SDK helpers for `recordHookDecision()`

**Strategy:** These are the most critical paths. `HookEnforcer.preToolExec()` and `HookEnforcer.preAnswer()` construct decision logs inline today. After migration, they call SDK client helpers which own the serialization, normalization, and log construction.

**Validation after Tier 3:**
- `npm run check` passes
- `npm run test` passes (especially `hook-enforcer.test.ts`)
- Go-side `integration_test.go` still passes (if Go test tooling is available in the session)
- Manual verification: a decision written via SDK helpers produces the same SQLite row shape that Go `sqlite_reader.go` expects

**Compatibility shims:**
- `packages/opencode-sdk/src/compat/legacy-shims.ts` provides re-exports of previous type locations for any callers not yet migrated
- Each shim has a removal criteria comment: "Remove when all callers import from `@dh/opencode-sdk` directly"

**Exit check:** At least one critical decision path (e.g., `HookEnforcer.preToolExec`) consumes SDK helpers end-to-end. Duplicate bridge types reduced.

---

### Slice 6: Documentation Realignment (Phase F)

**Goal:** Correct all "forked SDK" references and separate current-state from target-state in packaging messaging.

**Files to modify (from drift inventory):**
- `docs/architecture/opencode-integration-decision.md` line 200
- `docs/architecture/system-overview.md` lines 148, 195
- `docs/architecture/source-tree-blueprint.md` lines 147, 193
- `docs/architecture/implementation-sequence.md` line 67
- `docs/architecture/personal-cli-architecture.md` lines 7, 140
- `docs/architecture/workflow-orchestration.md` line 469
- `packages/opencode-sdk/README.md` line 7

**Additional documentation actions:**
- Add "How to extend bridge contracts safely" note in SDK README or a separate `docs/architecture/bridge-extension-guide.md`
- Add migration status snapshot section to the execution checklist
- Capture final verification evidence in checklist Progress Log

**Validation:**
- `grep -r "forked.*SDK\|Forked.*SDK" docs/ packages/opencode-sdk/` returns zero matches for `opencode-sdk` context
- `npm run check` passes (no code changes in this slice, but verify no doc references broke anything)

**Exit check:** No architecture doc contradicts dh-owned classification. Checklist resumable by a new session.

---

## Dependency Graph

```
Slice 1 (Baseline)
  |
  v
Slice 2 (Contract Design)     <- can overlap: Slice 1 doc inventory + Slice 2 brainstorming
  |
  v
Slice 3 (Types Implementation)
  |
  v
Slice 4 (Client Helpers)
  |
  v
Slice 5 (Migration)
  |  Tier 1 -> Tier 2 -> Tier 3  (sequential within slice)
  |                                <- can overlap: Slice 6 draft prep during Slice 5
  v
Slice 6 (Doc Realignment)
```

**Hard sequencing:**
- Slice 2 depends on Slice 1 baseline inventory
- Slice 3 depends on Slice 2 approved contract shape
- Slice 4 depends on Slice 3 exported types
- Slice 5 depends on Slice 4 helper readiness
- Slice 6 depends on Slice 5 outcomes (completed or deferred)

**Safe parallel opportunities:**
- Slice 1 doc-drift inventory can run alongside Slice 2 contract brainstorming
- Slice 6 draft corrections can be prepared during Slice 5 but finalized only after migration outcomes

**Critical path:** Slice 1 -> Slice 2 -> Slice 3 -> Slice 4 -> Slice 5 Tier 3 -> Slice 6

---

## Validation Matrix

| Acceptance Criterion | Slice | Validation Command / Method |
|---|---|---|
| AC-1: Versioned TS contract surface with `exports` map | Slice 3 | `npm run check`; inspect `package.json` exports field |
| AC-2: Protocol types cover all four transport modes | Slice 3 | Verify `transport-mode.ts` discriminated union; `tsc --noEmit` |
| AC-3: Client helper consumed by production path | Slice 5 (Tier 3) | `npm run test` (hook-enforcer tests); manual trace |
| AC-4: Duplicate bridge types reduced | Slice 5 (all tiers) | Diff of removed local types; remaining listed in compat shims |
| AC-5: Migration notes documented | Slice 5 + 6 | Checklist migration status snapshot section exists |
| AC-6: Docs say "dh-owned bridge SDK" | Slice 6 | `grep "forked.*SDK" docs/ packages/opencode-sdk/` returns 0 matches |
| AC-7: Validation evidence per phase | All slices | Each completed checklist item has evidence pointer |
| AC-8: Blockers recorded | All slices | Any blocked item uses checklist blocker format |

---

## Rollback and Compatibility Considerations

1. **Compatibility shims:** `packages/opencode-sdk/src/compat/legacy-shims.ts` re-exports existing type paths so callers that aren't migrated yet continue to compile. Each shim has explicit removal criteria.

2. **Re-export strategy:** `packages/shared/src/types/audit.ts` can re-export `HookInvocationLog` from SDK, preserving the existing import path for all current consumers. This means Tier 1 migration has zero breaking changes to downstream files.

3. **Rollback path:** If SDK types cause issues, revert the SDK package changes and remove re-exports. The shared/storage packages retain their original type definitions until Tier 1 migration explicitly replaces them.

4. **Go-side compatibility:** The Go bridge reader already tolerates both camelCase and snake_case keys. SDK normalization is additive safety, not a behavioral change. Go integration tests validate this.

5. **No new runtime dependencies:** SDK wraps existing `packages/storage` SQLite infrastructure. No new DB driver, no new network calls, no new binary dependencies.

---

## Notes for Downstream Roles

### FullstackAgent
- Map implementation tasks to the execution checklist items, not to a parallel tracker.
- Phase A is research output; do not skip it by guessing the Go-side contract shape.
- Phase B contract design is the highest-risk design decision. Get it reviewed before implementing Phase C.
- Use existing Go integration tests (`packages/opencode-core/internal/bridge/integration_test.go`) as the behavioral specification for parity checks.

### Code Reviewer
- Verify that SDK types are structurally derived from Go-side `bridge.go` and `pkg/types/types.go`, not invented independently.
- Verify key-normalization helpers handle the exact dual-key patterns in `sqlite_reader.go` (e.g., `outputString(output, "providerId", "provider_id")`).
- Verify no Tier 3 migration changes the observable SQLite row shape.
- Verify doc corrections are mechanical (find-replace) without unintended content changes.

### QAAgent
- Validate `npm run check` and `npm run test` after each tier.
- Validate Go integration tests pass if Go tooling is available.
- Validate grep-based doc-drift verification produces zero matches.
- Verify at least one end-to-end path (e.g., `HookEnforcer.preToolExec` -> SDK -> SQLite -> Go read) still works correctly.
