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

- Source has NOT yet been vendored into `packages/opencode-core/`
- Current code in this package is dh-original scaffold (bridge, hooks, cmd/dh)
- Vendoring plan: see `docs/architecture/implementation-roadmap.md` Phase -1

### Known reconciliation items for vendoring

1. Upstream uses `ncruces/go-sqlite3` (WASM); current dh bridge uses `modernc.org/sqlite` -- needs reconciliation
2. Upstream Go 1.24; dh environment has Go 1.26 -- forward compatible, minor API delta possible
3. Upstream module path `github.com/opencode-ai/opencode` must be rewritten to dh module path
4. Upstream `internal/tui/` may be partially dropped or heavily modified for dh's CLI-first approach
5. Upstream has no hook/middleware system -- all 6 hooks must be injected as new code
