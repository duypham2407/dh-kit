## Fork Provenance

Decision: `docs/adr/2026-04-05-fork-provenance-strategy.md`

### Classification

Fork adapted from Go lineage candidate.

### Upstream source

- Repository: `https://github.com/opencode-ai/opencode`
- Branch: `main`
- Pinned commit: `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
- Commit URL: `https://github.com/opencode-ai/opencode/commit/73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
- Archive status: Archived (read-only since Sep 2025, ~11.8k stars, ~1.2k forks)
- Module name: `github.com/opencode-ai/opencode`
- Go version: 1.24.0

### Upstream structure observed

- `go.mod` - module root
- `main.go` - CLI entrypoint
- `cmd/` - cobra command tree
- `internal/app/` - application container, wires sessions/messages/agent
- `internal/llm/agent/` - core agent loop (streaming, tool dispatch, multi-turn)
- `internal/llm/provider/` - LLM provider abstraction (10+ providers)
- `internal/llm/models/` - model registry, pricing, capabilities
- `internal/llm/prompt/` - system prompt templates per agent type
- `internal/llm/tools/` - built-in tool implementations (bash, edit, write, grep, glob, etc.)
- `internal/session/` - session CRUD, pub/sub events, SQLite-backed
- `internal/message/` - message model, content parts, tool calls/results
- `internal/config/` - configuration (Viper)
- `internal/db/` - SQLite connection, migrations (goose), query layer
- `internal/permission/` - permission/approval system for dangerous operations
- `internal/pubsub/` - generic typed pub/sub broker
- `internal/tui/` - Bubbletea TUI
- `internal/lsp/` - LSP client integration
- `internal/history/` - file history / undo support
- `internal/diff/` - diff utilities
- `internal/logging/` - structured logging

### Key dependencies from upstream

| Category | Package | Purpose |
|---|---|---|
| LLM: Anthropic | `anthropics/anthropic-sdk-go v1.4.0` | Native Claude client |
| LLM: OpenAI | `openai/openai-go v0.1.0-beta.2` | OpenAI/GROQ/OpenRouter/xAI/Local |
| LLM: Google | `google.golang.org/genai v1.3.0` | Gemini / VertexAI |
| LLM: AWS | `aws/aws-sdk-go-v2` | Bedrock |
| LLM: Azure | `Azure/azure-sdk-for-go` | Azure OpenAI |
| MCP | `mark3labs/mcp-go v0.17.0` | MCP client (stdio + SSE) |
| TUI | `charmbracelet/bubbletea v1.3.5` | Terminal UI |
| Storage | `ncruces/go-sqlite3 v0.25.0` | SQLite (WASM, no CGO) |
| Migrations | `pressly/goose/v3 v3.24.2` | DB schema migrations |
| CLI | `spf13/cobra v1.9.1` | Command parsing |
| Config | `spf13/viper v1.20.0` | Config management |

### Hook injection sites identified

| dh hook | Upstream file | Injection point |
|---|---|---|
| Model Override | `internal/llm/provider/provider.go` | `NewProvider()` factory |
| Pre-Tool-Exec | `internal/llm/agent/agent.go` | `streamAndHandleEvents()`, before `tool.Run()` |
| Pre-Answer | `internal/llm/agent/agent.go` | `processGeneration()`, before final AgentEvent |
| Session State | `internal/session/session.go` | `Create()` and session bootstrap |
| Skill Activation | `internal/llm/prompt/` | System prompt injection path |
| MCP Routing | `internal/llm/agent/mcp-tools.go` | `GetMcpTools()` enumeration |

### Vendoring status

Source from upstream commit `73ee493` has been vendored and is operational. As of 2026-04-07:

- All upstream `internal/` packages are vendored with module path rewrite to `github.com/duypham93/dh/packages/opencode-core`
- Full upstream TUI (48 files) imported from upstream, replacing earlier stubs
- Full upstream LSP client (16 files) imported from upstream, replacing earlier stubs
- SQLite driver unified on `ncruces/go-sqlite3` (upstream choice)
- 6 DH hook injection points wired into upstream runtime paths
- Build and all tests pass on Go 1.26

### Vendored upstream packages (module-path rewrite only, no behavioral changes)

- `internal/completions/`
- `internal/db/`
- `internal/diff/`
- `internal/fileutil/`
- `internal/format/`
- `internal/history/`
- `internal/llm/models/`
- `internal/llm/tools/` and `internal/llm/tools/shell/`
- `internal/logging/`
- `internal/lsp/` (full client, protocol, util, watcher)
- `internal/message/`
- `internal/permission/`
- `internal/pubsub/`
- `internal/tui/` (full componentized TUI: theme, components, layout, pages, styles, image, util)
- `internal/version/`

### Upstream packages with DH patches (behavioral changes beyond module path)

- `internal/app/app.go` - calls `session.NewServiceWithDB()` for persistent DhSessionState
- `internal/config/config.go` - `ensureDefaultAgents()` returns error; error messages reference `dh doctor`
- `internal/llm/agent/agent.go` - hook injection for model override
- `internal/llm/agent/mcp-tools.go` - `dhhooks.OnMcpRouting` + priority/blocked ordering + intent inference
- `internal/llm/prompt/prompt.go` - `dhhooks.OnSkillActivation` injection
- `internal/llm/provider/provider.go` - `dhhooks.OnModelOverride` in `NewProvider()`
- `internal/session/session.go` - `applySessionStateHook()` in all Create paths + `DeleteDhSessionState` in Delete

### DH-original packages (no upstream counterpart)

- `cmd/dh/` - binary entrypoint, hook wiring, CLI delegation, self-update
- `pkg/types/` - `ExecutionEnvelope`, `DhSessionState`, `HookInvocationLog`
- `internal/bridge/` - TS-Go enforcement bridge (SQLite DecisionReader)
- `internal/clibundle/` - embedded TS CLI bundle (go:embed + Node.js exec)
- `internal/dhhooks/` - central hook dispatch registry
- `internal/hooks/` - typed hook registry with bridge-wired defaults
- DH-original files within `internal/session/`: `dh_state.go`, `dh_state_store.go`
- DH-original files within `internal/llm/agent/`: `pre_tool_policy.go`, `pre_answer_*.go`, `mcp_intent_test.go`, `mcp_tools_order_test.go`

### Known reconciliation items (resolved)

1. ~~Upstream uses `ncruces/go-sqlite3`; dh bridge used `modernc.org/sqlite`~~ -> unified on ncruces
2. ~~Upstream Go 1.24; dh Go 1.26~~ -> forward compatible, no issues
3. ~~Module path rewrite~~ -> done
4. ~~TUI may be dropped~~ -> full TUI imported from upstream
5. ~~No hook system~~ -> 6 hooks injected
