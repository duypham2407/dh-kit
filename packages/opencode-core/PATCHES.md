Track dh-specific Go runtime patches here.

## Vendoring status

Steps 1-2 complete. Upstream source from `opencode-ai/opencode` commit `73ee493` is vendored into `packages/opencode-core/`.

### What was vendored

The following upstream `internal/` packages were copied and module-path-rewritten:

- `internal/app/` - application container
- `internal/completions/` - shell completion helpers
- `internal/config/` - configuration (Viper)
- `internal/db/` - SQLite connection, sqlc-generated queries, goose migrations
- `internal/diff/` - diff utilities
- `internal/fileutil/` - file utilities
- `internal/format/` - output formatting and spinner
- `internal/history/` - file history/undo
- `internal/llm/agent/` - core agent loop (streaming, tool dispatch, multi-turn)
- `internal/llm/models/` - model definitions, pricing, capabilities
- `internal/llm/prompt/` - system prompt templates
- `internal/llm/provider/` - LLM provider abstraction (10+ providers)
- `internal/llm/tools/` - built-in tool implementations
- `internal/logging/` - structured logging
- `internal/message/` - message model and service
- `internal/permission/` - permission/approval system
- `internal/pubsub/` - generic typed pub/sub broker
- `internal/session/` - session service
- `internal/version/` - version string

### What was deferred (stubs created instead)

- `internal/lsp/` - full LSP client (stub: no-op client and handlers)
- `internal/lsp/protocol/` - LSP protocol types (stub: minimal types for diagnostics tool)
- `internal/lsp/watcher/` - workspace watcher (stub: blocks on context)
- `internal/tui/` - full Bubbletea TUI (stub: theme interface with sensible defaults)
- `internal/tui/components/dialog/` - TUI dialog components (stub: completion interfaces)

### What was NOT vendored

- `cmd/root.go` - upstream CLI entrypoint (saved as `.ref` for reference)
- `cmd/schema/` - JSON schema generator

### Module path rewrite

All Go import paths rewritten from `github.com/opencode-ai/opencode` to `github.com/duypham93/dh/packages/opencode-core`.

### Dependencies

`go.mod` now includes all upstream dependencies:
- LLM: anthropic-sdk-go, openai-go, genai (Google), aws-sdk-go-v2 (Bedrock), azure-sdk
- MCP: mcp-go
- TUI: bubbletea, bubbles, lipgloss
- Storage: ncruces/go-sqlite3 (WASM), goose (migrations)
- CLI: cobra, viper

Note: `modernc.org/sqlite` remains as a transitive indirect dependency (pulled by goose's test suite) but is not directly imported by any dh or upstream code.

## dh-original code (coexists with vendored upstream)

- `cmd/dh/main.go`: dh binary entrypoint (exercises hook registry; to be wired to upstream app)
- `internal/bridge/sqlite_reader.go`: SQLite-backed bridge for TS-written hook decisions
- `internal/bridge/bridge.go`: bridge interface definitions
- `internal/hooks/hooks_registry.go`: hook registry with bridge-wired defaults
- `internal/hooks/bridge_hooks.go`: model override and pre-tool-exec bridge hooks
- `internal/hooks/bridge_more_hooks.go`: pre-answer, session state, skill activation, MCP routing bridge hooks
- `internal/hooks/pre_tool_exec.go`: pre-tool-exec hook type and default
- `internal/hooks/pre_answer.go`: pre-answer hook type and default
- `internal/hooks/model_override.go`: model override hook type and default
- `internal/hooks/session_state.go`: session state hook type and default
- `internal/hooks/skill_activation.go`: skill activation hook type and default
- `internal/hooks/mcp_routing.go`: MCP routing hook type and default
- `internal/hooks/registry_smoke_test.go`: smoke test proving all 6 hooks register and fire
- `pkg/types/types.go`: shared Go types for hook payloads

## Hook injection status (vendoring step 3 -- COMPLETE)

| dh hook | Target file | Injection point | Status |
|---|---|---|---|
| Model Override | `internal/llm/provider/provider.go` | `NewProvider()` factory | Done |
| Pre-Tool-Exec | `internal/llm/agent/agent.go` | `streamAndHandleEvents()` tool loop | Done |
| Pre-Answer | `internal/llm/agent/agent.go` | `processGeneration()` loop exit | Done |
| Session State | `internal/session/session.go` | `Create()` | Done |
| Skill Activation | `internal/llm/prompt/prompt.go` | `GetAgentPrompt()` | Done |
| MCP Routing | `internal/llm/agent/mcp-tools.go` | `GetMcpTools()` | Done |

All hooks dispatch through `internal/dhhooks/dhhooks.go`, which is registered at startup from `cmd/dh/main.go`.

## Binary entrypoint (vendoring step 4 -- COMPLETE)

`cmd/dh/main.go` now:
- Wires dh hook registry into the `dhhooks` dispatch layer
- Supports `--version`, `--help`, `--hooks` (hook demo), `--run <prompt>` (non-interactive upstream app)
- Can start the full upstream app flow: config load -> db connect -> app.New -> agent.Run

## Known issues

1. Upstream test `TestLsTool_Run` panics when config isn't loaded (upstream bug, not dh-specific)

## SQLite driver unification (Phase 6.5 -- COMPLETE)

**Decision:** Standardized on `github.com/ncruces/go-sqlite3` as the single SQLite driver.

**Rationale:**
- Upstream `db/connect.go` uses `ncruces/go-sqlite3` with driver name `"sqlite3"` and `goose.SetDialect("sqlite3")`
- The bridge `sqlite_reader.go` previously used `modernc.org/sqlite` with driver name `"sqlite"` — this was the mismatch
- ncruces is the upstream-established choice; aligning to it minimizes divergence
- Both are pure-Go (no CGo), so cross-compilation remains clean

**Changes:**
- `internal/bridge/sqlite_reader.go`: switched import from `modernc.org/sqlite` to `ncruces/go-sqlite3/driver` + `embed`; changed `sql.Open("sqlite", ...)` to `sql.Open("sqlite3", ...)`; added WAL pragma on open
- All bridge test files (`*_test.go`): same driver and open-string change
- `bridge.go`: updated build note comment

**DB path model (unchanged):**
- dh enforcement DB: `.dh/sqlite/dh.db` (bridge.DBPathTemplate) — written by TS, read by Go bridge
- upstream app DB: `{config.Data.Directory}/opencode.db` — managed by upstream db.Connect/goose
- These remain separate files serving separate purposes; WAL mode enables safe concurrent access

**Integration tests added:**
- `internal/bridge/integration_test.go`: 4 tests proving TS-written hook decisions are correctly read and enforced by the Go DecisionReader across all 6 hook types

**Envelope fallback hardening:**
- `internal/bridge/sqlite_reader.go` now supports fallback lookup when `envelope_id` is empty:
  - primary: exact `(session_id, envelope_id, hook_name)`
  - fallback: `(session_id, envelope_id=session_id, hook_name)` when caller passes empty envelope
- This makes runtime hook calls that only know `session_id` (for example current prompt/skill/MCP paths) still able to consume TS decisions written at session scope
- Added tests:
  - `internal/bridge/sqlite_reader_fallback_test.go::TestSQLiteDecisionReaderFallbackEmptyEnvelopeToSessionID`
  - `internal/bridge/sqlite_reader_fallback_test.go::TestSQLiteDecisionReaderPrefersExactEnvelopeOverFallback`

**Fallback priority upgrade:**
- Reader now falls back to session-scope even when a non-empty `envelope_id` is provided but not found.
- Query ordering guarantees deterministic priority:
  1. exact envelope match first
  2. session-scope (`envelope_id = session_id`) second
  3. newest timestamp within each tier
- Added test:
  - `internal/bridge/sqlite_reader_fallback_test.go::TestSQLiteDecisionReaderFallsBackWhenEnvelopeNotFound`

**Skills/MCP coverage expansion:**
- Added fallback/priority tests for output payload hooks:
  - `internal/bridge/sqlite_reader_skills_mcps_test.go::TestSQLiteDecisionReaderLatestSkillsFallsBackToSessionScope`
  - `internal/bridge/sqlite_reader_skills_mcps_test.go::TestSQLiteDecisionReaderLatestMcpsPrefersExactEnvelope`
- Confirms that `skill_activation` and `mcp_routing` share the same exact-over-session selection semantics as decision hooks

## dhhooks dispatch tests

Added unit tests for central dispatch layer in `internal/dhhooks/dhhooks_test.go`:
- default behavior when no registry is installed (safe defaults)
- envelope/session forwarding for pre-tool hook
- envelope forwarding for skill activation and MCP routing hooks

This protects the envelope-aware signatures introduced in `internal/dhhooks/dhhooks.go` from silent regressions.

## bridge hook behavior tests

Added unit tests for bridge hook adapters in `internal/hooks/bridge_hooks_test.go`:
- `BridgePreToolExecHook`:
  - blocks on `decision=block`
  - allows with default reason when no decision exists
  - fail-open behavior when reader errors
- `BridgePreAnswerHook`:
  - allows when decision is `allow`
  - fail-open behavior when reader errors
- `BridgeModelOverrideHook`:
  - uses reader-provided override when found
  - falls back to default no-op override when not found

This gives direct hook-layer coverage independent of SQLite integration tests.

Coverage is now expanded across all bridge adapters:
- `BridgeSessionStateHook`: reader-state path + fallback on nil/error
- `BridgeSkillActivationHook`: reader-found path + default fallback path
- `BridgeMcpRoutingHook`: reader-found path + default fallback path
- `BridgeModelOverrideHook`: explicit fallback-on-error coverage

Additional hardening coverage:
- `BridgeSkillActivationHook`: explicit fallback-on-reader-error test
- `BridgeMcpRoutingHook`: explicit fallback-on-reader-error test
- session lifecycle cleanup: `internal/session/session_hook_injection_test.go` now verifies `Delete(...)` clears injected in-memory `DhSessionState`

## Session-state runtime injection (Phase 6.5 -- IN PROGRESS)

**Goal:** Move session-state hook from log-only behavior to real runtime injection without risky upstream schema rewrites.

**Implemented now (safe slice):**
- Added `internal/session/dh_state.go`: in-memory dh session-state store keyed by `session_id`
- Added parsing bridge from hook payload map -> `types.DhSessionState`
- Supports both payload key styles:
  - camelCase: `laneLocked`, `currentStage`, `semanticMode`, `toolEnforcementLevel`, `activeWorkItemIds`
  - snake_case: `lane_locked`, `current_stage`, `semantic_mode`, `tool_enforcement_level`, `active_work_item_ids`
- `internal/session/session.go`:
  - on `Create()`: calls `SetDhSessionStateFromHook(...)` when `OnSessionCreate` returns state
  - on `Delete()`: calls `DeleteDhSessionState(...)` to avoid stale state
- `internal/session/session.go` session creation coverage expanded:
  - `CreateTaskSession()` now also applies session-state hook injection
  - `CreateTitleSession()` now also applies session-state hook injection
  - extraction into shared helper `applySessionStateHook(...)` keeps all create paths consistent
- Added unit tests in `internal/session/dh_state_test.go` for parse/get/delete behavior
- Added service-level integration test in `internal/session/session_hook_injection_test.go`:
  - verifies hook injection is applied on `Create`, `CreateTaskSession`, and `CreateTitleSession`
  - validates resulting in-memory `DhSessionState` contents per created session

**Why in-memory first:**
- avoids immediate sqlc/migration churn in upstream-vendored DB schema
- keeps injection in true runtime path while preserving low-risk rollback
- creates a stable seam for later persistence into DB tables once shape is finalized

**Remaining work for this area:**
- expose/consume injected state deeper in app/runtime context construction
- optionally persist dh session-state to DB once schema contract is finalized

Session-state registry adapter fidelity improved:
- `cmd/dh/main.go` now forwards full `DhSessionState` fields into the runtime hook map output:
  - `lane`
  - `laneLocked`
  - `currentStage`
  - `semanticMode`
  - `toolEnforcementLevel`
  - `activeWorkItemIds`
- This removes earlier data loss where only lane/stage were forwarded.

Adapter mapping test coverage:
- extracted mapper helper `sessionStateToHookMap(...)` in `cmd/dh/main.go`
- added `cmd/dh/main_test.go::TestSessionStateToHookMapIncludesAllFields` to assert all required fields are forwarded and no unintended keys leak

Envelope context enrichment in dh adapter:
- added `envelopeFromIDs(sessionID, envelopeID)` in `cmd/dh/main.go`
- adapter now enriches `types.ExecutionEnvelope` with lane from in-memory session-state store when available (`session.GetDhSessionState`)
- `PreToolExec`, `PreAnswer`, `SkillActivation`, `McpRouting` now all reuse this helper for consistent envelope construction
- `SkillActivation` keeps explicit lane fallback to hook argument when injected state is unavailable

Added tests in `cmd/dh/main_test.go`:
- `TestEnvelopeFromIDsUsesSessionLaneWhenAvailable`
- `TestEnvelopeFromIDsWithoutStateLeavesLaneEmpty`

## MCP routing depth improvement

- `internal/llm/agent/mcp-tools.go` now passes runtime session context into MCP hook dispatch:
  - uses `tools.GetContextValues(ctx)` to extract `sessionID`
  - calls `dhhooks.OnMcpRouting(ctx, sessionID, sessionID, "")` instead of empty IDs
- implemented MCP priority ordering support from hook output:
  - added `orderedMcpServerNames(...)`
  - applies hook `priority` first
  - skips blocked servers
  - falls back to deterministic alphabetical order for remaining servers

Tests:
- `internal/llm/agent/mcp_tools_order_test.go`
  - `TestOrderedMcpServerNamesAppliesPriorityAndBlocklist`
  - `TestOrderedMcpServerNamesFallsBackToAlphabeticalWhenNoPriority`

MCP intent enrichment:
- `internal/llm/agent/mcp-tools.go` now infers routing intent from session-state (`lane`/`currentStage`) via `inferMcpRoutingIntent(sessionID)`
- `OnMcpRouting(...)` now receives inferred intent instead of empty string
- inference currently returns one of: `migration`, `delivery`, `quick`, `general`

Tests:
- `internal/llm/agent/mcp_intent_test.go`
  - empty session -> `general`
  - delivery lane -> `delivery`
  - migration stage signal -> `migration`
  - unknown state -> `general`

## Hook envelope propagation + pre-answer actions (Phase 6.5 -- IN PROGRESS)

**Changes:**
- `internal/dhhooks/dhhooks.go`: expanded hook signatures to carry `envelopeID` through dispatch for:
  - `PreToolExec`
  - `PreAnswer`
  - `SkillActivation`
  - `McpRouting`
- `cmd/dh/main.go`: registry adapter now maps `sessionID/envelopeID` into `types.ExecutionEnvelope`
- `internal/llm/agent/agent.go`:
  - `OnPreToolExec` now passes `sessionID` + `envelopeID` (currently `sessionID` as runtime envelope fallback)
  - `OnPreAnswer` now passes `sessionID` + `envelopeID`
  - implemented action handling for pre-answer decisions:
    - `retry` -> continue generation loop
    - `degrade`/`insufficient` -> return degraded response text
    - otherwise -> return policy error event (hard block)
- `internal/llm/prompt/prompt.go` and `internal/llm/agent/mcp-tools.go` updated for new hook signatures

**Follow-up completed:**
- `internal/llm/agent/agent.go` now passes concrete runtime envelope/message IDs:
  - pre-tool-exec uses `assistantMsg.ID` as `envelopeID`
  - pre-answer uses `agentMessage.ID` as `envelopeID`
- This removes session-only fallback on the main agent path and improves parity with TS decisions written at envelope granularity

**Test coverage update:**
- Refactored pre-answer action branching into helper: `internal/llm/agent/pre_answer_action.go`
- Added unit tests: `internal/llm/agent/pre_answer_action_test.go`
  - `retry` action -> retry decision
  - `degrade/insufficient` action -> degraded response with `FinishReasonEndTurn`
  - any other blocked action -> policy error

**Runtime outcome coverage expansion:**
- Added `applyPreAnswerDecision(...)` in `internal/llm/agent/pre_answer_action.go` to map decisions into runtime event outcomes:
  - retry -> continue loop (no event)
  - degrade -> response event
  - block -> error event
- Added tests in `internal/llm/agent/pre_answer_action_test.go` for all 3 runtime outcomes.
- `internal/llm/agent/agent.go` now routes pre-answer rejection handling through this helper for a single, testable decision path.

## pre-answer context enrichment

Pre-answer hook inputs now carry richer runtime context instead of placeholders:
- Added `internal/llm/agent/pre_answer_context.go`:
  - `inferIntent(userContent)`
  - `extractToolsUsed(agentMessage, toolResults)`
  - `inferEvidenceScore(intent, toolsUsed, toolResults)`
  - `buildPreAnswerContext(...)`
- `internal/llm/agent/agent.go` now calls `dhhooks.OnPreAnswer(...)` with:
  - inferred `intent`
  - deduplicated `toolsUsed`
  - computed `evidenceScore`

Test coverage:
- `internal/llm/agent/pre_answer_context_test.go`
  - intent heuristics
  - tool extraction + dedupe
  - evidence scoring behavior
  - end-to-end context builder check

## pre-answer policy helper extraction

- Added `internal/llm/agent/pre_answer_policy.go` with `evaluatePreAnswerPolicy(...)` to centralize:
  - dh hook invocation
  - envelope forwarding (`agentMessage.ID`)
  - decision -> runtime outcome mapping (via existing action helpers)
- `internal/llm/agent/agent.go` now uses this helper for pre-answer policy gating.

Test coverage:
- `internal/llm/agent/pre_answer_policy_test.go`
  - allow path
  - retry outcome
  - degrade response outcome
  - block -> error outcome
  - context forwarding assertions (`sessionID`, `envelopeID`, `intent`, `toolsUsed`, `evidenceScore`)

Bridge-backed integration coverage:
- added `internal/llm/agent/pre_answer_bridge_integration_test.go`
- test harness composes real layers:
  - SQLite `hook_invocation_logs` rows
  - `bridge.NewSQLiteDecisionReader(...)`
  - `hooks.NewRegistryWithDecisionReader(...)`
  - `dhhooks` registry adapter
  - `evaluatePreAnswerPolicy(...)`
- validates DB-backed outcomes for envelope-specific decisions:
  - `allow`
  - `retry` (via `block` + retry reason)
  - `degrade` (via `block` + degrade reason)
  - `block/error`

## pre-tool policy helper + bridge integration coverage

- Added `internal/llm/agent/pre_tool_policy.go` with `evaluatePreToolPolicy(...)` to centralize pre-tool hook invocation and arg decoding.
- `internal/llm/agent/agent.go` now routes pre-tool checks through this helper.

Added DB-backed integration tests in `internal/llm/agent/pre_tool_bridge_integration_test.go`:
- `allow` decision by exact envelope
- `block` decision by exact envelope
- fallback-to-session-scope block when envelope-specific row is missing

This mirrors the pre-answer integration pattern and validates envelope/fallback semantics on live pre-tool policy paths.

Helper-level pre-tool policy tests:
- added `internal/llm/agent/pre_tool_policy_test.go`
  - verifies session/envelope/tool/args forwarding into `dhhooks.OnPreToolExec`
  - verifies malformed tool-call JSON is handled gracefully (nil args, no hard failure)

## skill activation + mcp routing bridge integration coverage

Added DB-backed integration tests in `internal/hooks/skill_mcp_bridge_integration_test.go`:
- `SkillActivation`:
  - exact-envelope skills override
  - session-scope fallback when envelope row missing
  - default-hook fallback when no DB rows exist
- `McpRouting`:
  - exact-envelope MCP list override
  - session-scope fallback when envelope row missing
  - default-hook fallback (including `intent=browser` behavior) when no DB rows exist

These tests validate bridge behavior at hook-adapter level using real SQLite decision rows and complement reader-level unit tests.

**Why this matters:**
- reduces ambiguity between session-scoped and envelope-scoped decisions
- closes a key gap where pre-answer was previously log-only on rejection
- establishes deterministic policy behavior (retry/degrade/block) in runtime path

## SQLite payload key compatibility hardening

- `internal/bridge/sqlite_reader.go` now decodes both camelCase and snake_case payload keys for cross-runtime compatibility:
  - `session_state`: `laneLocked/lane_locked`, `currentStage/current_stage`, `semanticMode/semantic_mode`, `toolEnforcementLevel/tool_enforcement_level`, `activeWorkItemIds/active_work_item_ids`
  - `model_override`: `providerId/provider_id`, `modelId/model_id`, `variantId/variant_id`
  - `skill_activation`: `skills` or `active_skills`
  - `mcp_routing`: `mcps` or `active_mcps`
- Added helper readers in `sqlite_reader.go`: `outputString`, `outputBool`, `outputAnyArray`.

Test coverage added:
- `internal/bridge/sqlite_reader_payload_test.go`
  - `TestSQLiteDecisionReaderLatestSessionStateDecodesSnakeCaseOutputJSON`
  - `TestSQLiteDecisionReaderLatestResolvedModelDecodesSnakeCaseOutputJSON`
- `internal/bridge/sqlite_reader_skills_mcps_test.go`
  - `TestSQLiteDecisionReaderLatestSkillsDecodesActiveSkillsKey`
  - `TestSQLiteDecisionReaderLatestMcpsDecodesActiveMcpsKey`

Validation run:
- `go test ./internal/bridge ./internal/hooks ./internal/llm/agent ./internal/session ./internal/dhhooks ./cmd/dh`
- `make build`

## cmd/dh run-path smoke coverage

- Refactored `cmd/dh/main.go` to isolate CLI control flow into `execute(args []string) error` while preserving existing runtime behavior.
- Added injectable `runNonInteractiveFn` seam and explicit `errUsage` handling for deterministic tests.
- Added `defer dhhooks.SetRegistry(nil)` inside `execute(...)` so each invocation cleans up global hook state.

Smoke coverage for non-interactive run entry path:
- `cmd/dh/main_test.go::TestExecuteRunPathUsesBridgeDecisions`
  - sets up `.dh/sqlite/dh.db` with TS-style `pre_tool_exec` block decision
  - sets `DH_PROJECT_ROOT` to temp repo
  - invokes `execute([]string{"--run", ...})`
  - verifies bridge-backed decision is observed through `dhhooks.OnPreToolExec(...)` in run path and enforces block reason
- `cmd/dh/main_test.go::TestExecuteRunPathUsesBridgePreAnswerDecision`
  - sets up `.dh/sqlite/dh.db` with TS-style `pre_answer` block decision (`degrade:...` action)
  - invokes `execute([]string{"--run", ...})`
  - verifies bridge-backed pre-answer decision is observed through `dhhooks.OnPreAnswer(...)` in run path with expected action
- `cmd/dh/main_test.go::TestExecuteRunWithoutPromptReturnsUsage`
  - validates `--run` usage error path without calling `os.Exit`
- `cmd/dh/main_test.go::TestExecuteRunPathExposesAllBridgeHookDecisions`
  - provisions TS-style decision rows for all 6 hooks in `.dh/sqlite/dh.db`
  - invokes `execute([]string{"--run", ...})`
  - verifies run-entry hook registry exposes bridge decisions for:
    - `model_override`
    - `pre_tool_exec`
    - `pre_answer`
    - `session_state`
    - `skill_activation`
    - `mcp_routing`

Validation run:
- `go test ./cmd/dh ./internal/bridge ./internal/hooks ./internal/llm/agent ./internal/session ./internal/dhhooks`
- `make build`

## run-smoke command for deterministic hook verification

- Added `--run-smoke` command in `cmd/dh/main.go`:
  - executes all 6 hook surfaces without requiring live provider API calls
  - prints concrete smoke output for model/session/skill/mcp/pre-tool/pre-answer paths
  - validates that model override points to a supported model ID when provided
- Added test coverage in `cmd/dh/main_test.go`:
  - `TestExecuteRunSmokeUsesBridgeDecisions`
  - provisions TS-style rows in `.dh/sqlite/dh.db`
  - asserts smoke output includes bridge-driven decisions for all expected hook surfaces

## upstream test-suite stability fix

- Fixed panic in `internal/llm/tools/ls.go` when config is not loaded:
  - added `resolveWorkingDirectory()` fallback (`config.Get().WorkingDir` -> `os.Getwd()` -> ".")
  - `ls` tool no longer calls `config.WorkingDirectory()` blindly
- This unblocks full-suite test runs in clean environments.

Validation run:
- `go test ./...`
- `make build`
- `make release-all`

Cross-workspace validation snapshot:
- root `npm run check` pass
- root `npm test` pass
- root `make build` pass
- root `make release-all` pass

## release artifact packaging

- Added `scripts/package-release.sh`:
  - collects cross-compiled binaries from `packages/opencode-core/dist/releases`
  - writes packaged artifacts into `dist/releases`
  - generates `SHA256SUMS`
  - generates `manifest.json` (generatedAt + filename + sha256 + sizeBytes)
- Updated root `Makefile`:
  - added `package-release` target
  - `release-all` now runs package step after cross-compiles
- Hardened install/upgrade scripts:
  - `scripts/install.sh` now optionally verifies expected SHA256
  - `scripts/upgrade.sh` usage updated to include optional checksum argument

Validation run:
- `make release-all`
- Verified outputs:
  - `dist/releases/SHA256SUMS`
  - `dist/releases/manifest.json`

## cross-workspace hardening follow-up (TS/runtime)

- Fixed TypeScript compile break in `packages/runtime/src/session/session-resume.test.ts`:
  - explicitly typed session fixture payload as `PersistedSessionRecord`
  - resolved `workflow.stageStatus` mismatch (`string` vs `StageStatus`) during `SessionStore.write(...)`
- Resume/session hardening tests now compile and run as part of workspace test pipeline.

Validation run:
- root `npm run check`
- root `npm test`

## release distribution hardening continuation (Phase 15/16 follow-up)

- Added release-resolution and checksum helpers for artifact-first install/upgrade flows:
  - `scripts/resolve-release-binary.sh`
  - `scripts/checksum-from-sha256s.sh`
  - `scripts/install-from-release.sh`
  - `scripts/upgrade-from-release.sh`
- Extended install/upgrade scripts to accept either binary path or release directory and verify checksums consistently:
  - `scripts/install.sh`
  - `scripts/upgrade.sh`
- Added staging smoke runbook and script for deterministic runtime validation plus optional provider-backed run path:
  - `scripts/staging-e2e-smoke.sh`
  - `docs/operations/staging-e2e-smoke.md`
- Added release/install runbook updates and README links:
  - `docs/operations/release-and-install.md`
  - `README.md`
- Verified helper scripts execute as binaries (`chmod +x` on new release helpers).

Validation run:
- `scripts/staging-e2e-smoke.sh` (deterministic smoke path; provider-backed path skipped when `OPENAI_API_KEY` is unset)
- `scripts/install-from-release.sh dist/releases <tmpdir>`
- `scripts/upgrade-from-release.sh dist/releases <tmpdir>`
- `<tmpdir>/dh --version` after install and upgrade (`dh dev`)

## provider-backed staging smoke + non-tty run hardening

- Verified provider-backed smoke path with a locally configured OpenAI key:
  - `OPENAI_API_KEY=... scripts/staging-e2e-smoke.sh`
  - deterministic smoke + provider-backed `dh --run "Return exactly: DH_STAGING_SMOKE_OK"` completed successfully
- Observed non-TTY warning from spinner (`/dev/tty`), then hardened run path:
  - `cmd/dh/main.go` now auto-enables quiet mode for `--run` when stderr is not a character device
  - added explicit override env `DH_RUN_QUIET=1|true`
- Added tests for quiet-mode policy in `cmd/dh/main_test.go`:
  - env override path
  - non-TTY auto-quiet path
  - TTY non-quiet default path
- Updated staging smoke runbook with non-TTY behavior note and expected provider-backed output token.
- Added release artifact integrity verifier and wired it into staging smoke preflight:
  - `scripts/verify-release-artifacts.sh`
  - `scripts/staging-e2e-smoke.sh` now verifies `SHA256SUMS` + `manifest.json` before running binaries
  - docs updated in `docs/operations/release-and-install.md`, `docs/operations/staging-e2e-smoke.md`, and `README.md`

Validation run:
- root `npm run check`
- root `npm test`
- `go test ./...` (in `packages/opencode-core`)
- root `make build`
- root `make release-all`
- `OPENAI_API_KEY=... scripts/staging-e2e-smoke.sh` -> includes provider-backed `dh --run` output `DH_STAGING_SMOKE_OK`
- `scripts/verify-release-artifacts.sh dist/releases`

## orchestration, retrieval, and CLI hardening continuation

- Phase 12 depth upgrades (TS/runtime path):
  - `packages/runtime/src/workflow/work-item-planner.ts` now builds dependency-aware execution layers, keeps cyclic items blocked, and exposes deterministic execution order
  - delivery/migration workflows now execute by work-item execution order and aggregate review/verification gate outcomes across all work items:
    - `packages/opencode-app/src/workflows/delivery.ts`
    - `packages/opencode-app/src/workflows/migration.ts`
  - migration handoff artifacts expanded with preserve-behavior depth in `packages/runtime/src/workflow/handoff-manager.ts`
- Phase 14 baseline implementation expanded:
  - added deterministic browser verification module in `packages/opencode-app/src/browser/verification.ts`
  - tester fallback now uses browser verification module and records evidence/limitations with MCP-aware routing
- Phase 7/16 indexing diagnostics and call-site coverage:
  - added call-site extraction implementation + tests:
    - `packages/intelligence/src/graph/extract-call-sites.ts`
    - `packages/intelligence/src/graph/extract-call-sites.test.ts`
  - index workflow now surfaces call-site count and refresh/unchanged diagnostics:
    - `packages/runtime/src/jobs/index-job-runner.ts`
    - `packages/runtime/src/jobs/index-job-runner.test.ts`
- Phase 9 retrieval tuning:
  - `packages/retrieval/src/query/run-retrieval.ts` avoids re-chunk when persisted chunk cache is already present
  - added retrieval workflow coverage: `packages/retrieval/src/query/run-retrieval.test.ts`
- Phase 2 CLI runtime integration and presenters:
  - introduced runtime client bridge `apps/cli/src/runtime-client.ts`
  - lane workflow commands now return structured report and render via presenters:
    - `apps/cli/src/presenters/lane-workflow.ts`
  - knowledge commands now return structured report and render via presenters:
    - `apps/cli/src/presenters/knowledge-command.ts`
  - `quick|delivery|migrate|ask|explain|trace` support `--json`
  - `index` now prints diagnostics summary lines from index workflow result
- Phase 13 diagnostics depth:
  - doctor now reports provider-model coverage diagnostics (`providersWithoutModels`, totals)
  - debug dump now includes chunk/embedding counts and resolved path metadata

Validation run:
- root `npm run check`
- root `npm test`
- `go test ./...` (in `packages/opencode-core`)
- root `make build`
- root `make release-all`
- `go test ./...` (in `packages/opencode-core`)
- root `make build`
- root `make release-all`

## browser verification routing baseline (Phase 14, TS-side)

- Extended tester input contract in `packages/opencode-app/src/team/tester.ts`:
  - accepts `objective`, routed MCP list, and browser evidence policy hints
  - fallback path now detects browser-focused objectives/MCP routes and emits browser verification evidence markers
- Updated delivery/migration workflows to pass objective + MCP context into tester:
  - `packages/opencode-app/src/workflows/delivery.ts`
  - `packages/opencode-app/src/workflows/migration.ts`
- Workflow summary lines now surface browser verification evidence note when present.
- Added test coverage:
  - `packages/opencode-app/src/workflows/workflows.test.ts::routes browser verification through tester MCP policy`

Validation run:
- root `npm run check`
- root `npm test`

## Post-Roadmap Hardening (2026-04-05)

### DhSessionState DB Persistence

Added persistent storage for DhSessionState, previously in-memory only.

Files added:
- `internal/db/migrations/20260405000000_add_dh_session_state.sql` — goose migration creating `dh_session_state` table with FK to sessions, cascade delete
- `internal/session/dh_state_store.go` — `DhStateStore` with Save/Load/Delete/LoadAll/TableExists
- `internal/session/dh_state_store_test.go` — 7 tests covering round-trip, upsert, delete, LoadAll, TableExists, nil DB, FK cascade

### CI Workflows

Added 3 new GitHub Actions workflows:
1. `.github/workflows/release-and-smoke.yml` — tagged release build, verify, smoke, publish
2. `.github/workflows/nightly-smoke.yml` — daily cron smoke + doctor snapshot + auto-issue
3. `.github/workflows/embedding-quality.yml` — weekly provider-backed retrieval quality calibration

### Artifact Signing and Installer Hardening

- `scripts/sign-release.sh` — GPG signing for binaries and SHA256SUMS
- `scripts/verify-release-artifacts.sh` — extended with GPG verification
- `scripts/install.sh` — atomic swap, backup, GPG verification
- `scripts/upgrade.sh` — post-install verification + rollback
- `scripts/test-installers.sh` — 8 test scenarios (all pass)

### Retrieval Quality Calibration

- `packages/retrieval/src/semantic/retrieval-quality.test.ts` — golden dataset (6 code domains), structural + provider-backed quality tests

### Doctor Monitoring

- `DoctorSnapshot` type in doctor.ts, machine-readable JSON output
- `scripts/check-doctor-snapshot.mjs` — CI regression checker
- Nightly smoke captures doctor snapshot as artifact

Validation run:
- `npm run check` pass, `npm test` 137 passed / 4 skipped
- `go test ./...` all pass
- `make release-all` pass, `scripts/verify-release-artifacts.sh` pass
- `scripts/staging-e2e-smoke.sh` deterministic smoke pass
- `scripts/test-installers.sh` 8/8 pass
