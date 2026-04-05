# ADR: Fork Provenance Strategy

## Status

Accepted

## Date

2026-04-05

## Context

`dh` requires Level 3 (deep) control over the AI runtime. The original integration ADR (`docs/architecture/opencode-integration-decision.md`) blessed the fork approach but did not specify exact upstream sources. Subsequent investigation revealed two separate upstream candidates from different lineages:

1. **Go runtime candidate**: `opencode-ai/opencode` (archived)
   - commit `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
   - Full Go CLI AI coding assistant with 10+ LLM providers, MCP support, TUI, SQLite persistence, rich tool set
   - Clean architecture: `agent` (loop), `provider` (LLM dispatch), `tools` (execution), `session`/`message` (persistence), `tui` (presentation)
   - Archived; README says project moved to `crush`

2. **JS SDK candidate**: `anomalyco/opencode`
   - commit `8b8d4fa066a1de331f6e478ae4055636a9271707`
   - TS/Bun-centric runtime with SDK at `packages/sdk/js/`
   - Different lineage from the Go candidate

These two candidates do not share the same upstream lineage. Forcing both into a single "fork of OpenCode" narrative would create a misleading provenance record.

## Decision

### opencode-core: Fork adapted from Go lineage

`packages/opencode-core/` will be treated as a fork adapted from `opencode-ai/opencode`. The upstream has a production-quality Go runtime with:

- Agent loop with streaming, multi-turn, tool use, cancellation, error recovery
- Provider abstraction for 10+ LLM providers (Anthropic, OpenAI, Gemini, Bedrock, Azure, GROQ, OpenRouter, xAI, VertexAI, Copilot, Local)
- Rich built-in tool set (bash, edit, write, patch, glob, grep, view, fetch, sourcegraph, LSP diagnostics, sub-agent)
- MCP client support (stdio + SSE)
- SQLite persistence (no CGO, WASM-based)
- Both interactive TUI and non-interactive CLI modes
- Permission system, cost tracking, conversation summarization

The 6 dh hook points will be injected into this runtime at these identified upstream paths:

| Hook | Upstream injection site |
|---|---|
| Model Override | `internal/llm/provider/provider.go` - `NewProvider()` factory, before provider instantiation |
| Pre-Tool-Exec | `internal/llm/agent/agent.go` - `streamAndHandleEvents()`, before `tool.Run()` call |
| Pre-Answer | `internal/llm/agent/agent.go` - `processGeneration()`, before final `AgentEvent` return |
| Session State | `internal/session/session.go` - `Create()` and the session bootstrap path |
| Skill Activation | `internal/llm/prompt/` - system prompt injection path, before agent begins processing |
| MCP Routing | `internal/llm/agent/mcp-tools.go` - `GetMcpTools()`, during MCP tool enumeration |

Despite the upstream being archived, the codebase is production-grade and provides a far stronger foundation than building a Go runtime from scratch.

### opencode-sdk: dh-owned internal SDK/bridge

`packages/opencode-sdk/` will **not** be treated as a fork of `anomalyco/opencode`. Instead it will be a `dh`-owned internal TypeScript SDK/bridge package.

Rationale:
- The JS SDK candidate comes from a different upstream lineage than the Go runtime
- The Go upstream (`opencode-ai/opencode`) does not have a corresponding JS SDK we could pair with it
- `dh`'s TS layer (config, workflow, enforcement, retrieval, intelligence) is already substantially original code
- The SDK package's primary role is to define protocol contracts between the TS orchestration layer and the Go runtime, not to replicate an upstream SDK

The SDK will continue to maintain its `FORK_ORIGIN.md` for provenance transparency, noting that it evaluated the `anomalyco/opencode` SDK but chose not to vendor from it.

## Consequences

### Positive

1. Provenance is clean and honest -- each package declares exactly where its code comes from
2. `opencode-core` gets a strong production-grade foundation instead of building from scratch
3. `opencode-sdk` is free to evolve as `dh`'s internal bridge contract without upstream lineage constraints
4. The 6 hook injection sites are clearly identified in the upstream

### Negative

1. `opencode-core` inherits maintenance burden from an archived upstream (no security patches coming)
2. `opencode-sdk` cannot claim upstream pedigree -- it's fully `dh`-owned
3. Go upstream uses `ncruces/go-sqlite3` (WASM-based), not `modernc.org/sqlite` which the current bridge uses; this will need reconciliation during vendoring

### Migration actions

1. Update `FORK_ORIGIN.md` in both packages to reflect this decision
2. Update `PATCHES.md` in both packages with refined upstream mapping
3. Update `opencode-integration-decision.md` to reference this ADR
4. Begin vendoring Go upstream source into `packages/opencode-core/` in a controlled manner

## References

- `docs/architecture/opencode-integration-decision.md` - original fork ADR
- `packages/opencode-core/FORK_ORIGIN.md` - Go core provenance
- `packages/opencode-sdk/FORK_ORIGIN.md` - SDK provenance
- Upstream Go repo: `https://github.com/opencode-ai/opencode` (archived)
- Upstream JS repo: `https://github.com/anomalyco/opencode` (evaluated, not adopted for SDK)
