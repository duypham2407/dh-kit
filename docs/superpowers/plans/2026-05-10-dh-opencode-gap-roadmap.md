# DH OpenCode Gap Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring DH from a Rust-accelerated local-first knowledge/workflow CLI toward practical OpenCode parity while preserving DH's Rust runtime, indexing, retrieval, and workflow advantages.

**Architecture:** Treat OpenCode parity as a layered roadmap, not a single rewrite. Build a Rust-hosted runtime contract first, expose it through TypeScript compatibility adapters only where needed, then add product surfaces in priority order: run loop, sessions, providers, MCP, tools, LSP, plugins, UI/server. Each subsystem gets its own implementation plan before code changes.

**Tech Stack:** Rust workspace under `rust-engine/`, TypeScript CLI under `apps/cli/`, TypeScript runtime/workflow packages under `packages/`, SQLite/file-backed persistence under `packages/storage/`, AI SDK provider stack under `packages/providers/`, Vitest, TypeScript, Cargo.

---

## Baseline

This plan is based on:

- DH: `506b0af` (`v0.3.1-rc.7`)
- OpenCode local checkout: `903d81819` on `dev`
- DH user-facing status: `ask`, `explain`, `trace`, `index`, `doctor`, `quick`, `delivery`, `migrate`, `config`, `semantic-cleanup`, `operator-safe-maintenance`
- OpenCode user-facing status: `run`, TUI, `serve`, `web`, `attach`, `session`, `export`, `import`, `providers`, `models`, `mcp`, `agent`, `plugin`, `stats`, `db`, `github`, `pr`, `acp`, desktop/web/console packages

The OpenCode checkout is dirty in `.opencode/` and `packages/console/app/.opencode/agent/css.md`; use source files and docs, not the dirty config deletions, as the comparison baseline.

## Product Decision

Recommended approach: **Rust-first parity spine, then product surfaces**.

Options considered:

- **Option A: Clone OpenCode surface first.** Fastest way to show familiar commands, but high risk because DH's runtime truth remains split and many commands become thin, brittle wrappers.
- **Option B: Rust-first parity spine.** Slower first milestone, but creates a stable contract for session, permission, tools, MCP, and providers. This is the recommended path.
- **Option C: DH-only differentiated product.** Best if parity is not the goal; skip TUI/web/desktop and focus only on retrieval/workflow. This does not answer the stated gap against OpenCode.

Use Option B. DH's advantage is not copying OpenCode file-for-file; it is making the runtime and code intelligence faster and more explicit while exposing enough compatible surface that OpenCode users can adopt DH without relearning the tool.

## Priority Model

Priority labels:

- **P0:** Blocks practical daily use or future parity work.
- **P1:** Needed for OpenCode-like user experience.
- **P2:** Needed for ecosystem parity and advanced workflows.
- **P3:** Useful, but only after core surfaces are stable.

## Gap Matrix

| Gap | OpenCode surface | DH current state | Priority | Target outcome |
| --- | --- | --- | --- | --- |
| Runtime authority | Server/session/tool runtime in `packages/opencode/src/*` | Rust authority covers first-wave knowledge commands; TS still hosts lane workflows | P0 | Rust owns lifecycle, session, hook, audit, capability negotiation for all user-facing command paths |
| Interactive run loop | `opencode run`, TUI, attach, raw JSON events | No equivalent `dh run`; commands are discrete | P0 | `dh run` supports prompt, continuation, model/agent selection, JSON event stream, abort, permission prompts |
| Session management | `session list/delete`, continue, fork, export/import, share, stats | Rust/TS session primitives exist but product UX is incomplete | P0 | Stable session lifecycle across CLI, knowledge, workflow, and future TUI/server |
| Provider lifecycle | `providers list/login/logout`, `models`, models.dev refresh, credentials | AI SDK provider stack exists; auth UX and credential lifecycle are incomplete | P0 | Config-driven providers, credential store, model list/refresh, provider verification |
| Tool runtime | read/write/edit/bash/glob/grep/apply_patch/task/todo/webfetch/websearch/lsp | DH has enforcement, retrieval, bridge tools, but not OpenCode-equivalent runtime tool catalog | P1 | Core tool catalog with permission decisions, audit, streaming output, result schemas |
| MCP lifecycle | `mcp add/list/auth/logout/debug`, OAuth callback | MCP routing/auth status exists; lifecycle UX incomplete | P1 | First-class MCP management and runtime routing through Rust/TS bridge |
| Agent/subagent model | build/plan/general agents, `agent create/list`, task subagent | DH has workflow team roles and lanes | P1 | Agent registry maps DH roles and user-defined agents into runtime agent selection |
| LSP integration | LSP client, diagnostics, hover, definition, references, workspace symbols, call hierarchy | DH has structural Rust graph/retrieval but no LSP service parity | P2 | LSP service augments Rust graph; diagnostics and symbol operations exposed as tools |
| Plugin ecosystem | server hooks, TUI hooks, command/tool/chat/session hooks | DH has extension-state fingerprint/drift surfaces | P2 | Server plugin API with deterministic hook order and bounded compatibility |
| Headless server/web | `serve`, `web`, SDK client/server architecture | No DH server/web client | P2 | Local server exposes session, command, event, provider, MCP APIs; web UI can attach |
| TUI | OpenTUI-based interactive client | No TUI | P2 | TUI MVP attaches to `dh run`/server and supports sessions, prompts, permissions, model/agent switch |
| GitHub/PR automation | GitHub agent, `pr` import/checkout | Not present as first-class surface | P3 | Optional GitHub integration after session/import/export are stable |
| Desktop/console/cloud | desktop package, console, Zen/provider cloud | Not part of DH local-first core | P3 | Explicitly deferred until local/server/TUI surfaces prove stable |

## Non-Goals For The First Three Milestones

- Full desktop app.
- Cloud account console or billing.
- Remote share service hosted by DH.
- OpenCode TUI plugin compatibility.
- Complete LSP auto-install coverage for every language OpenCode supports.
- Replacing DH's Rust graph/retrieval with OpenCode's LSP-first model.

These are product choices, not permanent exclusions.

## Milestone 0: Parity Inventory And Contract Map

**Goal:** Create a machine-checkable map of OpenCode features to DH features before implementing new behavior.

**Files:**

- Create: `docs/scope/2026-05-10-opencode-gap-parity-contract.md`
- Create: `docs/solution/2026-05-10-opencode-gap-parity-contract.md`
- Create: `packages/shared/src/types/parity.ts`
- Create: `packages/runtime/src/diagnostics/parity-report.ts`
- Create: `packages/runtime/src/diagnostics/parity-report.test.ts`
- Modify: `apps/cli/src/commands/doctor.ts`
- Modify: `packages/runtime/src/diagnostics/doctor.ts`

**Tasks:**

- [ ] Define parity categories: `runtime`, `cli`, `session`, `provider`, `mcp`, `tool`, `agent`, `lsp`, `plugin`, `server`, `tui`, `github`, `packaging`.
- [ ] Define statuses: `supported`, `partial`, `planned`, `deferred`, `out_of_scope`.
- [ ] Add a `dh doctor --json` parity section that reports status, missing command surfaces, missing runtime capabilities, and recommended next milestone.
- [ ] Add test fixtures proving the parity report does not claim unsupported surfaces.
- [ ] Add docs that distinguish DH differentiation from OpenCode parity.

**Acceptance Gates:**

- `npm run check`
- `npm test -- parity-report`
- `npm test -- doctor`
- `cargo test --manifest-path rust-engine/Cargo.toml`

**Definition of Done:**

`dh doctor --json` exposes a truthful parity snapshot. The plan can be tracked without relying on memory or ad hoc comparison.

## Milestone 1: Rust Runtime Authority For All Command Paths

**Goal:** Make Rust the runtime lifecycle authority, not only the first-wave knowledge command host.

**Files:**

- Modify: `rust-engine/crates/dh-engine/src/main.rs`
- Modify: `rust-engine/crates/dh-engine/src/host_commands.rs`
- Modify: `rust-engine/crates/dh-engine/src/bridge.rs`
- Modify: `rust-engine/crates/dh-engine/src/session_manager.rs`
- Modify: `rust-engine/crates/dh-engine/src/hooks.rs`
- Modify: `rust-engine/crates/dh-engine/src/worker_supervisor.rs`
- Modify: `rust-engine/crates/dh-engine/src/worker_protocol.rs`
- Modify: `apps/cli/src/runtime-client.ts`
- Modify: `apps/cli/src/commands/root.ts`
- Modify: `packages/opencode-app/src/workflows/run-lane-command.ts`
- Modify: `packages/opencode-app/src/worker/host-bridge-client.ts`
- Modify: `packages/runtime/src/session/session-manager.ts`
- Modify: `packages/runtime/src/workflow/stage-runner.ts`
- Modify: `packages/storage/src/sqlite/repositories/sessions-repo.ts`
- Add tests near each modified module.

**Tasks:**

- [ ] Extend bridge capabilities to advertise runtime authority per command family: `knowledge`, `lane`, `run`, `session`, `provider`, `mcp`, `tool`.
- [ ] Route `quick`, `delivery`, and `migrate` through Rust lifecycle supervision while preserving TypeScript role/workflow behavior behind the worker boundary.
- [ ] Move session creation/resume/complete decisions into Rust for knowledge and lane commands.
- [ ] Make hook dispatch run for lane commands with explicit hook names and audit records.
- [ ] Add a bridge result envelope that always includes `runtimeAuthority`, `sessionId`, `finalStatus`, and `degradedReason`.
- [ ] Keep TypeScript fallback available behind an explicit compatibility flag only.
- [ ] Update CLI text output so user sees degraded runtime state only when it matters.

**Acceptance Gates:**

- `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine`
- `npm test -- host-bridge-client`
- `npm test -- run-lane-command`
- `npm test -- root`
- Manual: `dh quick "inspect runtime contract" --json`
- Manual: `dh delivery "draft a no-op plan" --json`
- Manual: `dh migrate "inspect package manager" --json`

**Definition of Done:**

Rust owns lifecycle, session identity, hook dispatch, and final status for knowledge and lane workflows. TypeScript no longer silently creates independent lifecycle truth.

## Milestone 2: `dh run` Direct Interactive Loop

**Goal:** Add an OpenCode-like direct run loop before building TUI/server.

**Files:**

- Create: `apps/cli/src/commands/run.ts`
- Create: `apps/cli/src/commands/run.test.ts`
- Create: `apps/cli/src/presenters/run-event.ts`
- Create: `apps/cli/src/presenters/run-event.test.ts`
- Create: `packages/opencode-app/src/workflows/run-direct-command.ts`
- Create: `packages/opencode-app/src/workflows/run-direct-command.test.ts`
- Create: `packages/runtime/src/session/session-event-stream.ts`
- Create: `packages/runtime/src/session/session-event-stream.test.ts`
- Modify: `apps/cli/src/commands/root.ts`
- Modify: `apps/cli/src/runtime-client.ts`
- Modify: `packages/opencode-app/src/worker/worker-command-router.ts`
- Modify: `rust-engine/crates/dh-engine/src/main.rs`
- Modify: `rust-engine/crates/dh-engine/src/host_commands.rs`
- Modify: `rust-engine/crates/dh-engine/src/bridge.rs`

**Command Contract:**

`dh run [message]` supports a single prompt string assembled from remaining CLI arguments:

- `--json`
- `--continue`
- `--session <id>`
- `--fork`
- `--model <provider/model>`
- `--agent <agent-id>`
- `--variant <variant-id>`
- `--file <path>` repeated
- `--title <text>`
- `--auto-approve`

**Tasks:**

- [ ] Parse `dh run` options in CLI with strict error messages for invalid combinations.
- [ ] Add `runDirectCommand` workflow that creates or resumes a session through Rust runtime.
- [ ] Stream normalized events: `session.created`, `message.started`, `text.delta`, `tool.started`, `tool.delta`, `tool.finished`, `permission.requested`, `message.finished`, `session.finished`, `runtime.degraded`.
- [ ] Add plain text renderer for terminal use.
- [ ] Add JSON event renderer for automation.
- [ ] Add abort handling for Ctrl-C with Rust final status `cancelled`.
- [ ] Add file attachment ingestion for text files first; binary/image support is Milestone 7.
- [ ] Preserve existing `ask`, `explain`, `trace` behavior.

**Acceptance Gates:**

- `npm test -- run`
- `npm test -- run-direct-command`
- `npm test -- session-event-stream`
- `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine host_commands`
- Manual: `dh run "summarize this repo" --json`
- Manual: `dh run --continue "continue the previous answer"`
- Manual: `dh run --file README.md "explain this file"`

**Definition of Done:**

DH has a daily-use interactive command path that can later back TUI and server. Users can start, resume, fork, and automate sessions from the CLI.

## Milestone 3: Session Product Parity

**Goal:** Expose session lifecycle as a stable product surface.

**Files:**

- Create: `apps/cli/src/commands/session.ts`
- Create: `apps/cli/src/commands/session.test.ts`
- Create: `apps/cli/src/commands/export.ts`
- Create: `apps/cli/src/commands/import.ts`
- Create: `apps/cli/src/commands/stats.ts`
- Create: `packages/runtime/src/session/session-export.ts`
- Create: `packages/runtime/src/session/session-import.ts`
- Create: `packages/runtime/src/session/session-fork.ts`
- Create: `packages/runtime/src/session/session-delete.ts`
- Modify: `packages/runtime/src/session/session-summary.ts`
- Modify: `packages/runtime/src/session/session-revert.ts`
- Modify: `packages/storage/src/sqlite/repositories/sessions-repo.ts`
- Modify: `packages/storage/src/sqlite/repositories/session-summary-repo.ts`
- Modify: `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
- Modify: `apps/cli/src/commands/root.ts`
- Modify: `rust-engine/crates/dh-engine/src/session_manager.rs`
- Modify: `rust-engine/crates/dh-engine/src/main.rs`

**Command Contract:**

- `dh session list [--json] [--limit <n>]`
- `dh session delete <id> [--yes]`
- `dh session show <id> [--json]`
- `dh session fork <id> [--title <text>] [--json]`
- `dh export [session-id] [--sanitize]`
- `dh import <file>`
- `dh stats [--days <n>] [--models <n>] [--tools <n>] [--json]`

**Tasks:**

- [ ] Define a versioned session export schema in `packages/shared/src/types/session.ts`.
- [ ] Add export sanitization for file paths, file contents, command strings, environment-shaped secrets, and provider tokens.
- [ ] Add import validation that refuses malformed or future-version exports with a clear message.
- [ ] Add session list sorted by updated time.
- [ ] Add fork that copies transcript and summary but resets active runtime state.
- [ ] Add delete with confirmation guard and `--yes`.
- [ ] Add stats aggregation from stored messages, events, tool usage, model usage, token/cost fields when available.
- [ ] Add Rust session commands only where Rust owns the database operation; keep TypeScript formatting in CLI.

**Acceptance Gates:**

- `npm test -- session`
- `npm test -- session-export`
- `npm test -- session-import`
- `npm test -- stats`
- `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine session_manager`
- Manual: export a session, import into a temp repo, then continue it with `dh run --session <id>`.

**Definition of Done:**

Sessions become durable, inspectable, portable, resumable, and safe to delete.

## Milestone 4: Provider And Model Lifecycle

**Goal:** Make providers first-class and config-driven in the same practical category as OpenCode.

**Files:**

- Create: `apps/cli/src/commands/providers.ts`
- Create: `apps/cli/src/commands/models.ts`
- Create: `packages/providers/src/auth/provider-auth-store.ts`
- Create: `packages/providers/src/auth/provider-auth-service.ts`
- Create: `packages/providers/src/auth/provider-auth-service.test.ts`
- Create: `packages/providers/src/config/provider-config-loader.ts`
- Create: `packages/providers/src/config/provider-config-loader.test.ts`
- Modify: `packages/providers/src/provider/provider.ts`
- Modify: `packages/providers/src/provider/legacy-adapter.ts`
- Modify: `packages/providers/src/chat/create-chat-provider.ts`
- Modify: `packages/providers/src/models-dev.ts`
- Modify: `packages/shared/src/types/config-schema.ts`
- Modify: `packages/opencode-app/src/config/config-service.ts`
- Modify: `apps/cli/src/commands/config.ts`
- Modify: `apps/cli/src/commands/root.ts`

**Command Contract:**

- `dh providers list [--json]`
- `dh providers login [provider] [--api-key-env <name>] [--api-key <value>]`
- `dh providers logout <provider>`
- `dh providers verify <provider> [--model <model>] [--json]`
- `dh models [provider] [--refresh] [--verbose] [--json]`

**Tasks:**

- [ ] Define provider credential precedence: process env, local DH credential store, `opencode.json` provider options, models.dev defaults.
- [ ] Store credentials without printing raw secrets in CLI, doctor, errors, or debug dumps.
- [ ] Support AI SDK provider packages currently in `package.json`: OpenAI, Anthropic, OpenAI-compatible, Google, Google Vertex, Amazon Bedrock, Azure, Groq, Mistral, xAI, DeepInfra, OpenRouter.
- [ ] Add `models --refresh` that updates models.dev cache and reports snapshot age.
- [ ] Add provider verification using a tiny non-streaming request when credentials exist.
- [ ] Add config loader support for repo-local `opencode.json` and DH-specific overrides without silently ignoring parse failures.
- [ ] Remove remaining hardcoded provider assumptions from config selection paths.

**Acceptance Gates:**

- `npm test -- provider-auth-service`
- `npm test -- provider-config-loader`
- `npm test -- create-chat-provider`
- `npm test -- config-service`
- Manual with fake key: `dh providers list --json` must not print secret values.
- Manual with real configured provider: `dh providers verify <provider> --model <model> --json`.

**Definition of Done:**

Users can configure, verify, list, and use providers without editing source code.

## Milestone 5: MCP Lifecycle And Runtime Routing

**Goal:** Move MCP from internal routing primitives to user-visible lifecycle parity.

**Files:**

- Create: `apps/cli/src/commands/mcp.ts`
- Create: `apps/cli/src/commands/mcp.test.ts`
- Create: `packages/opencode-app/src/mcp/mcp-config-service.ts`
- Create: `packages/opencode-app/src/mcp/mcp-runtime-service.ts`
- Create: `packages/opencode-app/src/mcp/mcp-oauth-service.ts`
- Create: `packages/opencode-app/src/mcp/mcp-debug.ts`
- Modify: `packages/opencode-app/src/registry/mcp-registry.ts`
- Modify: `packages/opencode-app/src/registry/mcp-routing-policy.ts`
- Modify: `packages/opencode-app/src/auth/mcp-auth-status.ts`
- Modify: `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
- Modify: `packages/runtime/src/workflow/workflow-audit-service.ts`
- Modify: `packages/storage/src/sqlite/repositories/mcp-route-audit-repo.ts`
- Modify: `apps/cli/src/commands/root.ts`
- Modify: `rust-engine/crates/dh-engine/src/bridge.rs`

**Command Contract:**

- `dh mcp list [--json]`
- `dh mcp add --name <name> --command <cmd> [--arg <arg>] [--env <KEY=VALUE>]`
- `dh mcp auth [name]`
- `dh mcp auth list [--json]`
- `dh mcp logout <name>`
- `dh mcp debug <name> [--json]`

**Tasks:**

- [ ] Define MCP config source precedence and file location.
- [ ] Add local command-based MCP entries first.
- [ ] Add OAuth-capable MCP status model without requiring OAuth for non-OAuth servers.
- [ ] Add debug command that reports launch command redacted, auth state, tool/resource count, and last failure.
- [ ] Add audit records for MCP route selection, fallback, degraded use, and refusal.
- [ ] Expose MCP resources to `dh run` file attachment and prompt reference flow.

**Acceptance Gates:**

- `npm test -- mcp`
- `npm test -- mcp-routing`
- `npm test -- mcp-auth-status`
- Manual: add a local MCP with fake command and verify debug reports launch failure without crashing.
- Manual: existing default MCP registry still routes by intent.

**Definition of Done:**

MCP is configurable, inspectable, authenticated where required, and safely routed.

## Milestone 6: Tool Runtime And Permission Model

**Goal:** Provide an OpenCode-like core tool catalog while preserving DH's operator-safety rules.

**Files:**

- Create: `packages/opencode-app/src/tools/tool-registry.ts`
- Create: `packages/opencode-app/src/tools/tool-runner.ts`
- Create: `packages/opencode-app/src/tools/schemas.ts`
- Create: `packages/opencode-app/src/tools/read-tool.ts`
- Create: `packages/opencode-app/src/tools/write-tool.ts`
- Create: `packages/opencode-app/src/tools/edit-tool.ts`
- Create: `packages/opencode-app/src/tools/shell-tool.ts`
- Create: `packages/opencode-app/src/tools/search-tool.ts`
- Create: `packages/opencode-app/src/tools/todo-tool.ts`
- Create: `packages/opencode-app/src/tools/task-tool.ts`
- Modify: `packages/opencode-app/src/executor/enforce-tool-usage.ts`
- Modify: `packages/runtime/src/hooks/bash-guard.ts`
- Modify: `packages/runtime/src/hooks/runtime-enforcer.ts`
- Modify: `packages/storage/src/sqlite/repositories/tool-usage-audit-repo.ts`
- Modify: `packages/opencode-app/src/worker/worker-command-router.ts`
- Modify: `rust-engine/crates/dh-engine/src/hooks.rs`
- Modify: `rust-engine/crates/dh-engine/src/bridge.rs`

**Core Tool Catalog:**

- `read`
- `write`
- `edit`
- `shell`
- `glob`
- `grep`
- `apply_patch`
- `todo`
- `task`
- `semantic_search`
- `graph_find_symbol`
- `graph_find_references`
- `graph_call_hierarchy`

**Tasks:**

- [ ] Define tool schemas in one package and reject invalid tool input before execution.
- [ ] Route every tool through permission evaluation and audit.
- [ ] Add shell permission levels: `deny`, `ask`, `allow`, `auto_approve_with_policy`.
- [ ] Keep DH command substitution rules for dangerous shell usage.
- [ ] Add streaming output support for long-running shell and task tools.
- [ ] Add tool result truncation with explicit `truncated` metadata.
- [ ] Add task/subagent tool as a controlled runtime feature after `dh run` event streaming is stable.

**Acceptance Gates:**

- `npm test -- tool-registry`
- `npm test -- tool-runner`
- `npm test -- bash-guard`
- `npm test -- enforce-tool-usage`
- `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine hooks`
- Manual: `dh run --auto-approve "inspect README and list three commands"` does not bypass deny rules.

**Definition of Done:**

DH can execute model-requested tools with observable, policy-bound behavior.

## Milestone 7: Agent/Subagent Runtime

**Goal:** Reconcile DH lane roles with OpenCode's selectable agents and subagents.

**Files:**

- Create: `apps/cli/src/commands/agent.ts`
- Create: `packages/opencode-app/src/agent/agent-config-service.ts`
- Create: `packages/opencode-app/src/agent/agent-runtime.ts`
- Create: `packages/opencode-app/src/agent/subagent-runtime.ts`
- Modify: `packages/opencode-app/src/team/analyst.ts`
- Modify: `packages/opencode-app/src/team/architect.ts`
- Modify: `packages/opencode-app/src/team/implementer.ts`
- Modify: `packages/opencode-app/src/team/reviewer.ts`
- Modify: `packages/opencode-app/src/team/tester.ts`
- Modify: `packages/opencode-app/src/team/quick-agent.ts`
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `packages/opencode-app/src/planner/choose-agent-model.ts`
- Modify: `packages/opencode-app/src/planner/build-execution-envelope.ts`

**Command Contract:**

- `dh agent list [--json]`
- `dh agent create --id <id> --mode <primary|subagent> --prompt <text> [--model <provider/model>] [--permission <name>]`
- `dh run --agent <id> "message"`

**Tasks:**

- [ ] Define built-in agents: `build`, `plan`, `general`, `quick`, `analyst`, `architect`, `implementer`, `reviewer`, `tester`.
- [ ] Map DH workflow roles to agent descriptors without changing existing lane behavior.
- [ ] Add user-defined agent config files under a stable DH config path.
- [ ] Add subagent execution through the task tool with isolated prompt and bounded result.
- [ ] Enforce per-agent permissions and model selection.
- [ ] Add agent list/create CLI.

**Acceptance Gates:**

- `npm test -- agent`
- `npm test -- choose-agent-model`
- `npm test -- build-execution-envelope`
- Manual: `dh agent list --json`
- Manual: `dh run --agent plan "inspect runtime files"` must not execute write tools.

**Definition of Done:**

DH has selectable agents and subagents without losing its workflow-lane semantics.

## Milestone 8: LSP Integration As Graph Augmentation

**Goal:** Add live LSP intelligence without downgrading DH's Rust graph index.

**Files:**

- Create: `packages/opencode-app/src/lsp/lsp-client.ts`
- Create: `packages/opencode-app/src/lsp/lsp-service.ts`
- Create: `packages/opencode-app/src/lsp/lsp-server-catalog.ts`
- Create: `packages/opencode-app/src/tools/lsp-tool.ts`
- Create: `apps/cli/src/commands/lsp.ts`
- Modify: `packages/shared/src/types/config-schema.ts`
- Modify: `packages/opencode-app/src/tools/tool-registry.ts`
- Modify: `packages/retrieval/src/query/run-retrieval.ts`
- Modify: `rust-engine/crates/dh-query/src/lib.rs`

**Tasks:**

- [ ] Add explicit config for LSP enablement: `off`, `manual`, `auto`.
- [ ] Support TypeScript/JavaScript LSP first.
- [ ] Add diagnostics collection for touched files.
- [ ] Add tool operations: definition, references, hover, document symbols, workspace symbols.
- [ ] Merge LSP evidence with DH evidence packets as live evidence, not canonical index truth.
- [ ] Add diagnostics to `dh run` context only when relevant.

**Acceptance Gates:**

- `npm test -- lsp`
- `npm test -- lsp-tool`
- `npm test -- run-retrieval`
- Manual on a TypeScript repo: `dh lsp diagnostics --file apps/cli/src/commands/root.ts --json`

**Definition of Done:**

LSP improves live precision while Rust graph remains the persistent code intelligence source.

## Milestone 9: Plugin System MVP

**Goal:** Add deterministic server-side plugins before TUI plugins.

**Files:**

- Create: `packages/opencode-app/src/plugin/plugin-loader.ts`
- Create: `packages/opencode-app/src/plugin/plugin-hooks.ts`
- Create: `packages/opencode-app/src/plugin/plugin-config.ts`
- Create: `packages/opencode-app/src/plugin/plugin-api.ts`
- Create: `apps/cli/src/commands/plugin.ts`
- Modify: `packages/runtime/src/extensions/extension-runtime-state-store.ts`
- Modify: `packages/runtime/src/extensions/extension-fingerprint.ts`
- Modify: `packages/runtime/src/extensions/extension-drift-report.ts`
- Modify: `packages/opencode-app/src/worker/worker-command-router.ts`

**Initial Hooks:**

- `event`
- `chat.message`
- `permission.ask`
- `tool.execute.before`
- `tool.execute.after`
- `command.execute.before`
- `experimental.chat.system.transform`
- `experimental.chat.messages.transform`

**Tasks:**

- [ ] Load file-based plugins from repo config only.
- [ ] Refuse remote/npm plugin install in MVP.
- [ ] Execute hooks sequentially in config order.
- [ ] Add plugin timeout and error isolation.
- [ ] Persist plugin fingerprints and drift state using existing extension runtime store.
- [ ] Expose plugin errors in doctor and debug dump.

**Acceptance Gates:**

- `npm test -- plugin`
- `npm test -- extension`
- Manual: create a local plugin that denies shell permission and verify `dh run` respects it.

**Definition of Done:**

DH supports local server plugins with auditable hook behavior.

## Milestone 10: Headless Server And SDK Client

**Goal:** Create the server boundary that TUI/web/desktop can attach to.

**Files:**

- Create: `packages/server/src/server.ts`
- Create: `packages/server/src/routes/session.ts`
- Create: `packages/server/src/routes/command.ts`
- Create: `packages/server/src/routes/provider.ts`
- Create: `packages/server/src/routes/mcp.ts`
- Create: `packages/server/src/routes/events.ts`
- Create: `packages/sdk/src/client.ts`
- Create: `apps/cli/src/commands/serve.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Command Contract:**

- `dh serve [--host <host>] [--port <port>] [--password <password>] [--json]`
- `dh run --attach <url> "message"`

**Tasks:**

- [ ] Use local-only host default.
- [ ] Add basic auth for non-localhost bind.
- [ ] Expose session CRUD, run command, stream events, providers, models, MCP status.
- [ ] Add SDK client that can attach to server.
- [ ] Add server lifecycle into Rust process supervision where possible.
- [ ] Add CORS only for local web UI origin.

**Acceptance Gates:**

- `npm test -- server`
- `npm test -- sdk`
- Manual: `dh serve --port 4096 --json`
- Manual: `dh run --attach http://localhost:4096 "summarize README"`

**Definition of Done:**

DH has a stable client/server architecture for future TUI and web surfaces.

## Milestone 11: TUI MVP

**Goal:** Build the first interactive terminal surface after server/run/session are stable.

**Files:**

- Create: `apps/tui/src/main.tsx`
- Create: `apps/tui/src/app.tsx`
- Create: `apps/tui/src/session-view.tsx`
- Create: `apps/tui/src/prompt.tsx`
- Create: `apps/tui/src/dialogs/model-dialog.tsx`
- Create: `apps/tui/src/dialogs/agent-dialog.tsx`
- Create: `apps/tui/src/dialogs/session-dialog.tsx`
- Create: `apps/tui/src/dialogs/permission-dialog.tsx`
- Create: `apps/cli/src/commands/tui.ts`
- Modify: `package.json`

**Tasks:**

- [ ] Pick TUI library after a spike comparing OpenTUI reuse against a smaller terminal UI library.
- [ ] Start with attached mode against `dh serve`.
- [ ] Show session list, current transcript, prompt input, streaming text, tool events, permission prompts.
- [ ] Add model/agent switch dialogs.
- [ ] Add session resume/fork/delete shortcuts.
- [ ] Add read-only fallback when server capability is missing.

**Acceptance Gates:**

- `npm test -- tui` where unit tests cover state reducers and event rendering.
- Manual: `dh tui` starts server or attaches to existing server.
- Manual: run prompt, interrupt prompt, approve/deny a tool call, resume a session.

**Definition of Done:**

DH becomes usable as an interactive coding assistant, not only a command runner.

## Milestone 12: Web UI And Desktop Decision

**Goal:** Decide whether DH needs web/desktop parity after CLI/server/TUI validation.

**Files:**

- Create: `docs/adr/2026-05-10-web-desktop-parity-decision.md`
- Create only if approved: `apps/web/`
- Create only if approved: `apps/desktop/`

**Tasks:**

- [ ] Evaluate actual usage after Milestone 11.
- [ ] Compare maintenance cost of web/desktop against DH local-first product direction.
- [ ] If web is approved, build only against `dh serve` SDK.
- [ ] If desktop is approved, wrap web UI and local server lifecycle.
- [ ] Keep cloud console excluded unless a separate business requirement is approved.

**Acceptance Gates:**

- ADR is written and accepted before code.
- Web/desktop implementation has its own plan document.

**Definition of Done:**

DH avoids accidental product sprawl while keeping a clear path to richer clients.

## Cross-Cutting Requirements

### Security

- Never print raw provider keys, MCP tokens, environment secrets, or auth headers.
- Every shell/tool execution must pass through permission evaluation.
- Any server bind outside localhost requires explicit password configuration.
- Plugin hooks must have timeout and error isolation.

### Observability

- Runtime final status must distinguish success, degraded success, user cancellation, request failure, startup failure, cleanup incomplete.
- Every tool call must have an audit record.
- Provider and MCP errors must include actionable category without leaking secrets.
- `doctor --json` must remain the operator truth surface.

### Compatibility

- Existing commands keep current behavior unless a migration note is added.
- `ask`, `explain`, `trace` keep bounded evidence honesty.
- TS compatibility paths must be explicit, not silent.
- OpenCode compatibility is a goal for command semantics, not a mandate to clone internal architecture.

### Testing

Required gate for all milestones:

```bash
npm run check
npm test
cargo test --manifest-path rust-engine/Cargo.toml
```

Milestones that touch release packaging also run:

```bash
scripts/verify-release-artifacts.sh
scripts/test-installers.sh
```

## Implementation Order

1. Milestone 0: parity contract and doctor reporting.
2. Milestone 1: Rust runtime authority.
3. Milestone 2: `dh run`.
4. Milestone 3: session product parity.
5. Milestone 4: provider/model lifecycle.
6. Milestone 5: MCP lifecycle.
7. Milestone 6: tool runtime and permissions.
8. Milestone 7: agents/subagents.
9. Milestone 8: LSP graph augmentation.
10. Milestone 9: plugin MVP.
11. Milestone 10: server and SDK.
12. Milestone 11: TUI MVP.
13. Milestone 12: web/desktop decision.

Do not start TUI, web, desktop, GitHub automation, or plugin ecosystem work before Milestones 1-4 are stable. Those surfaces multiply defects if runtime/session/provider truth is still split.

## Per-Milestone Plan Files To Create

Before implementation, split this roadmap into these focused plans:

- `docs/superpowers/plans/2026-05-10-parity-contract.md`
- `docs/superpowers/plans/2026-05-10-rust-runtime-authority.md`
- `docs/superpowers/plans/2026-05-10-dh-run-loop.md`
- `docs/superpowers/plans/2026-05-10-session-product-parity.md`
- `docs/superpowers/plans/2026-05-10-provider-model-lifecycle.md`
- `docs/superpowers/plans/2026-05-10-mcp-lifecycle.md`
- `docs/superpowers/plans/2026-05-10-tool-runtime-permissions.md`
- `docs/superpowers/plans/2026-05-10-agent-subagent-runtime.md`
- `docs/superpowers/plans/2026-05-10-lsp-graph-augmentation.md`
- `docs/superpowers/plans/2026-05-10-plugin-mvp.md`
- `docs/superpowers/plans/2026-05-10-server-sdk.md`
- `docs/superpowers/plans/2026-05-10-tui-mvp.md`

Each focused plan must include exact test-first tasks and should be implemented independently.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Runtime truth remains split between Rust and TS | Sessions and audit become unreliable | Milestone 1 before product-surface expansion |
| Provider auth leaks secrets in logs | High security risk | Redaction tests in provider, doctor, export, debug dump |
| TUI starts before event model is stable | UI churn and duplicated state | Build `dh run` JSON stream first |
| MCP OAuth expands scope too early | Slow delivery | Command-based MCP first, OAuth status second, OAuth flow third |
| LSP conflicts with Rust graph evidence | Confusing answers | Treat LSP as live evidence, Rust graph as canonical index |
| Plugin API freezes too early | Backward compatibility burden | Mark plugin MVP as local server-plugin-only until enough usage exists |
| OpenCode parity overrides DH differentiation | Loss of Rust/retrieval advantage | Keep parity matrix explicit and preserve DH evidence boundaries |

## Release Strategy

- Release after Milestone 2 as `0.4.0-alpha`: first usable `dh run`.
- Release after Milestone 4 as `0.4.0-beta`: run + sessions + providers.
- Release after Milestone 6 as `0.4.0-rc`: tools + MCP.
- Release after Milestone 8 as `0.5.0-alpha`: agents + LSP.
- Release after Milestone 11 as `0.6.0-alpha`: TUI.

Every release note must state:

- New parity surfaces.
- Known unsupported OpenCode surfaces.
- Rust-hosted versus TypeScript compatibility boundaries.
- Required migration actions for config, sessions, providers, and MCP.

## Immediate Next Step

Create and execute the first focused plan:

`docs/superpowers/plans/2026-05-10-parity-contract.md`

That plan should implement the parity report and `doctor --json` truth surface. It is the smallest safe first step because it improves operator visibility without changing runtime behavior.
