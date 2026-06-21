# Design: Rust Runtime Full Wiring — Session + 6 Hooks + Granular Stage Machine

- **Date:** 2026-06-21
- **Status:** Draft for approval
- **Author:** brainstorming session (đại ca + đệ tử)
- **Supersedes/extends:** `docs/PLAN-rust-runtime-wiring.md` (Tasks T2–T5 of that plan; T1 + T6 already shipped)

## 1. Problem statement

The Rust core (`rust-engine/`) is **functionally complete and stub-free** as a code-intelligence
engine: parse / index / store / query / build_evidence / bridge / supervision all run on real
implementations with ~185 tests and zero `todo!()`/`unimplemented!()` in production source.

Measured against the **original design intent**, however, one promised capability is only partially
delivered. `docs/PLAN-rust-runtime-wiring.md:5` and `docs/DEPRECATION-go-core.md` declare that the
Rust `dh-engine` host is the **single source of truth** for *session lifecycle, hook enforcement, and
audit logging on the real request path*. In code today:

- **Wired (active):** process lifecycle, worker supervision, bridge router, code-intelligence/query/
  index, lane hosting; session create/complete **only** via the standalone `dh session` CLI subcommand;
  `PreToolExec` + `PreAnswer` hooks **only** on the bridge `session.runCommand` loop.
- **Dormant (defined, unit-tested, `#[allow(dead_code)]`, zero production callers):**
  - Workflow stage-machine advancement — `transition_stage`, `pass_gate`, `waive_gate`, `fail_session`,
    `create_envelope`, `is_valid_transition` (`rust-engine/crates/dh-engine/src/session_manager.rs`).
  - Multi-hook pipeline dispatch — `dispatch_pipeline` and the 4 injection/routing hooks
    `SessionStateInjection`, `ModelOverride`, `SkillActivation`, `McpRouting`
    (`rust-engine/crates/dh-engine/src/hooks.rs`).
  - Knowledge commands (`ask`/`explain`/`trace`) never auto-create a session; the bridge uses a
    throwaway `"bridge-session"` literal (`bridge.rs:757`).

The runtime-authority contract names this gradient honestly:
`rust-engine/crates/dh-engine/src/host_lifecycle.rs` declares `session: partial`,
`provider/mcp/tool: planned`. The mirror in `packages/opencode-app/src/worker/host-bridge-client.ts:190`
agrees.

**Goal of this work:** lift `session` from `partial` → `supported` by wiring the dormant
session/hook/stage code into the real knowledge + lane request paths, with the **single source of
truth** property genuinely held: the TS worker must *ask the Rust host* to advance workflow stages
rather than self-deciding them.

### Explicitly out of scope (stays `planned`, by design)

- `provider` / `mcp` / `tool` runtime-authority families. Activating those requires a model-routing
  registry and an MCP registry that do not yet exist on the Rust side; that is a later wave. We do not
  overclaim them. The 4 injection hooks run, but `ModelOverride`/`McpRouting` keep their current
  passthrough/best-effort bodies — wiring them to real registries is future work.
- Benchmark Peak-RSS instrumentation and incremental-reindex mutation realism (separate, already
  honestly fenced gaps).

## 2. Chosen approach: Granular stage advance via worker→host reverse-RPC

Three approaches were considered for how the workflow stage-machine steps:

1. **Coarse** — host walks the whole stage chain deterministically on the single terminal result. Simple,
   no protocol change, but the host never sees real per-stage progress — the stage history is fiction.
2. **Granular (chosen)** — the TS worker calls a new reverse-RPC `session.stageAdvance` each time it
   crosses a stage; the host applies `pass_gate` + `transition_stage` with real validation. This is the
   only option where the host genuinely owns stage truth (worker cannot self-advance). Costs a protocol
   addition on both Rust and TS sides.
3. **Hybrid** — coarse for knowledge, granular for lanes.

**Decision: Granular**, because it is the only one that makes the "single source of truth" claim true
rather than cosmetic. Knowledge commands have a trivial single-stage chain so they pay almost nothing;
lane commands get real gated progression.

## 3. Architecture

### 3.1 Component map (files touched)

| File | Change | Kind |
|---|---|---|
| `rust-engine/crates/dh-engine/src/host_commands.rs` | Insert session create/resume + 4 injection hooks pre-supervisor; route `session.stageAdvance`; `PreToolExec` on reverse-RPC; `PreAnswer` pre-return; `fail_session` on error; populate `session_id` | Wire dormant code |
| `rust-engine/crates/dh-engine/src/session_manager.rs` | Remove `#[allow(dead_code)]` from `transition_stage`/`pass_gate`/`waive_gate`/`fail_session`/`create_envelope`/`is_valid_transition` | Activate |
| `rust-engine/crates/dh-engine/src/hooks.rs` | Remove `#[allow(dead_code)]` from `dispatch_pipeline` and `HookContext.stage`; use it | Activate |
| `rust-engine/crates/dh-engine/src/worker_protocol.rs` | Add `SESSION_STAGE_ADVANCE_METHOD` + `WORKER_TO_HOST_LIFECYCLE_METHODS` + `is_worker_to_host_lifecycle_method`; add `worker_to_host_lifecycle_methods` to contract | New protocol surface |
| `rust-engine/crates/dh-engine/src/bridge.rs` | Replace `"bridge-session"` literal with a real `SessionManager` session; run the 4 injection hooks (currently only 2 of 6 fire) | Wire |
| `rust-engine/crates/dh-engine/src/host_lifecycle.rs` | Bump `session: partial → supported` in `runtime_authority_contract()`; update frozen test | Contract |
| `packages/opencode-app/src/worker/host-bridge-client.ts` | `session: partial → supported` in `runtimeAuthority.families` | Contract mirror |
| `packages/opencode-app/src/workflows/delivery.ts`, `migration.ts` (+ quick lane path) | Emit `session.stageAdvance` reverse-RPC at each stage boundary | Wire TS side |
| `docs/` (system-overview, runtime-state-schema, model-routing notes) | Reconcile `run=supported`, `session=supported`; keep provider/mcp/tool `planned` | Housekeeping |

### 3.2 Data flow — knowledge path (`run_hosted_knowledge_command_with_config`)

```
dh ask "how auth works" --lane quick
  → SessionManager::new(db)
  → create_session(id, workspace, request.lane)      // or resume_session if resume_session_id
  → activate_session(id)
  → create_envelope(id, "dh-engine", role)
  → dispatch_pipeline([SessionStateInjection, ModelOverride,
                       SkillActivation, McpRouting], ctx, input, id, envelope_id)
       → insert_hook_log per hook (best-effort)
       → if Block → RequestFailed (host keeps exit-code authority)
       → merge Modify outputs into session.runCommand params
  → supervisor.launch()
  → send_session_run_command(...)
       ↓ worker reverse-RPC query.* → dispatch(PreToolExec) → route_worker_query
       ↓ worker reverse-RPC session.stageAdvance → pass_gate + transition_stage (validated)
  ← worker terminal result
  → dispatch(PreAnswer, terminal_result)
  → on success: pass_gate + transition_stage to final + complete_session
    on failure: fail_session(id, reason)
  → report.session_id = Some(real id)   // no longer None
```

### 3.3 Data flow — lane path (`run_hosted_lane_command`)

Same shape, `request.lane ∈ {Delivery, Migration}`, longer stage chain (`DELIVERY_STAGES` /
`MIGRATION_STAGES`). The TS lane workflow drives real stage boundaries through `session.stageAdvance`;
the host gates each one. Quick lane uses `QUICK_STAGES`.

### 3.4 The new reverse-RPC method — contract-safe placement

`session.stageAdvance` is a **lifecycle** call, not a bounded query. It must NOT be added to
`WORKER_TO_HOST_QUERY_METHODS` (frozen at `[&str; 6]` with a contract test at
`worker_protocol.rs:386` asserting exactly the 6 query methods and rejecting `tool.execute`). Instead:

```rust
// worker_protocol.rs
pub const SESSION_STAGE_ADVANCE_METHOD: &str = "session.stageAdvance";
pub const WORKER_TO_HOST_LIFECYCLE_METHODS: [&str; 1] = [SESSION_STAGE_ADVANCE_METHOD];
pub fn is_worker_to_host_lifecycle_method(m: &str) -> bool {
    WORKER_TO_HOST_LIFECYCLE_METHODS.contains(&m)
}
```

`route_worker_to_host_message` (`host_commands.rs:648`) branches on category:

- `is_worker_to_host_query_method(method)` → `router.route_worker_query(...)` (unchanged)
- `is_worker_to_host_lifecycle_method(method)` → handle `session.stageAdvance`:
  - params: `{ sessionId, nextStage }`
  - host calls `SessionManager::pass_gate(sessionId)` then `transition_stage(sessionId, nextStage)`
  - success → `{ accepted: true, stage, gateStatus }`
  - invalid transition / gate fail → JSON-RPC error (worker stops or waits); host stays authoritative
- otherwise → `method_not_supported`

`worker_protocol_contract()` gains `worker_to_host_lifecycle_methods: Vec<&'static str>`. **This is a
deliberate contract change**: the frozen test at `worker_protocol.rs:269` is updated to assert the new
field (not silently bypassed). The 6-query-method freeze and the `tool.execute` rejection remain intact.

### 3.5 Hook taxonomy (the "6 hooks", clarified)

- **Pre-supervisor injection (4)** — `SessionStateInjection`, `ModelOverride`, `SkillActivation`,
  `McpRouting` — run once via `dispatch_pipeline` before the worker launches; `Modify` outputs are
  merged into the `session.runCommand`/`session.runLane` params so the worker receives host-resolved
  context.
- **Gate hooks (2)** — `PreToolExec` (on each worker reverse-RPC, before routing) and `PreAnswer`
  (on the terminal result, before return). These already exist on the bridge loop; this work extends
  them onto the `host_commands` hosted paths.

## 4. Error handling & authority invariants

- **Lifecycle authority is never surrendered to TS.** Per `packages/shared/src/types/runtime-authority.ts`
  and `host_lifecycle.rs::lifecycle_contract()`, the host owns final status / exit code. A hook `Block`
  or a `stageAdvance` rejection maps to `FinalStatus::RequestFailed` + `degraded_reason`, but the
  host — not the worker — performs that classification. Existing replay/recovery tests must stay green.
- **Audit logging is best-effort**, matching the established pattern at `bridge.rs:784`
  (`let _ = log_repo.insert_hook_log(&log);`). A failed audit insert never crashes a command.
- **Resume miss is non-fatal.** If `resume_session_id` is supplied but not found, create a fresh session
  rather than `bail!` — preserves UX. (Differs from the plan's `.context("session not found")`; chosen
  for resilience.)
- **Stage validation stays strict.** `transition_stage` keeps its existing guards: session must be
  `Active`, transition must be the next link in the lane chain, current gate must be `Passed`/`Waived`.
  A worker that requests an out-of-order stage gets an error, not a silent accept.
- **Worker without stageAdvance still works.** If the TS worker emits no `session.stageAdvance` calls
  (older bundle), the host falls back to a coarse start→complete walk on the terminal result, so the
  knowledge path never hard-depends on TS changes landing first.

## 5. Testing strategy

Per `docs/PLAN-rust-runtime-wiring.md:280-301`, extended for granular:

**Rust (`cargo test -p dh-engine`):**
- `host_commands`: knowledge command auto-creates a session (report `session_id` is `Some`); `hook_invocation_logs` populated after a run; `fail_session` on worker failure.
- `host_commands`: a fixture worker that emits `session.stageAdvance` drives a real `transition_stage`; an out-of-order `nextStage` is rejected with a JSON-RPC error and the session does not advance.
- `worker_protocol`: updated frozen contract test asserts `worker_to_host_lifecycle_methods == ["session.stageAdvance"]` while the 6 query methods and `tool.execute` rejection stay frozen.
- `bridge`: `session.runCommand` now backed by a real `SessionManager` session; `PreToolExec` block → access-denied response (existing behavior preserved).
- `host_lifecycle`: frozen authority test updated to `session: supported`; `provider/mcp/tool` remain `planned`.
- Regression: all existing replay/recovery/lifecycle tests stay green (no authority leakage).

**TypeScript (`npm run check` + `npm test`):**
- `delivery.ts` / `migration.ts` emit `session.stageAdvance` at stage boundaries; unit test asserts the reverse-RPC is sent with `{ sessionId, nextStage }`.
- `host-bridge-client.ts` capability snapshot reports `session: supported`.

**Acceptance criteria:**
- [ ] `dh ask "explain auth"` auto-creates a session visible in `dh session status`.
- [ ] `hook_invocation_logs` has an entry per dispatched hook after a knowledge run.
- [ ] A lane run records a real multi-row stage history (not a single fabricated row).
- [ ] Out-of-order `session.stageAdvance` is rejected; host stays authoritative.
- [ ] `runtime_authority_contract()` reports `session: supported`; `provider/mcp/tool` still `planned`.
- [ ] `cargo test --workspace` and `npm run check` + `npm test` pass with no regressions.
- [ ] Docs reconciled: `run=supported`, `session=supported`, provider/mcp/tool `planned`.

## 6. Risks & mitigations

- **Frozen-contract churn.** Changing `worker_protocol_contract()` and the authority contract touches
  deliberately-frozen tests. Mitigation: update them as explicit, reviewed contract changes; never
  `#[ignore]` or delete a freeze to make CI pass.
- **Two-sided protocol change.** Granular needs Rust + TS landing coherently. Mitigation: the coarse
  fallback (§4) means the Rust side is safe to land first; TS `stageAdvance` emission can follow without
  breaking knowledge commands.
- **Scope creep into provider/mcp/tool.** Mitigation: those families stay `planned`; this spec wires
  only `session`. The injection hooks run but `ModelOverride`/`McpRouting` keep current bodies.

## 7. Work breakdown (for the implementation plan)

1. `worker_protocol.rs`: add lifecycle-method constants + contract field + update frozen test.
2. `session_manager.rs` + `hooks.rs`: remove `#[allow(dead_code)]`; make the dormant APIs callable.
3. `host_commands.rs`: wire session create/resume + 4 injection hooks + `PreToolExec`/`PreAnswer` +
   `session.stageAdvance` routing + coarse fallback + `fail_session` + populate `session_id`.
4. `bridge.rs`: replace `"bridge-session"` literal with a real session; run all 4 injection hooks.
5. `host_lifecycle.rs` + `host-bridge-client.ts`: bump `session → supported`; update frozen tests.
6. TS `delivery.ts`/`migration.ts`: emit `session.stageAdvance` at stage boundaries.
7. Docs reconciliation.

Dependency order: 1 → 2 → 3 → 4 → 5 → 6 → 7 (TS step 6 can land after the Rust steps thanks to the
coarse fallback).
