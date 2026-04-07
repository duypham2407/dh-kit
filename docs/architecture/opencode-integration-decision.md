# DH OpenCode Integration Decision

Last reviewed against code: 2026-04-05

## Status

Accepted

## Date

2026-04-04

## Decision

`dh` will fork the entire OpenCode runtime — both the Go core and the TypeScript SDK/client layer — into its own repository. `dh` will diverge completely from upstream OpenCode and own its runtime from this point forward. `dh` will be distributed as a pre-built binary for macOS and Linux.

Current implementation note:

- Quyết định ở tài liệu này vẫn là ADR hợp lệ và là target direction của project.
- Fork provenance strategy đã được chốt ở `docs/adr/2026-04-05-fork-provenance-strategy.md`:
  - `packages/opencode-core/` = fork adapted from `opencode-ai/opencode` (Go runtime, commit `73ee493`)
  - `packages/opencode-sdk/` = dh-owned internal SDK/bridge (NOT a fork of any upstream)
- Upstream Go source đã được vendored vào `packages/opencode-core/` và build được qua `make build`.
- 6 hook injection sites đã được wire vào runtime paths (provider, pre-tool-exec, pre-answer, session create, skill activation, MCP routing).
- Bridge TS->Go đã có SQLite DecisionReader thật với integration tests (TS-write/Go-read) trong `packages/opencode-core/internal/bridge/integration_test.go`.
- Hướng thực thi runtime hiện tại theo `docs/architecture/opencode-upstream-update-plan.md`: dua baseline upstream ve day du truoc, sau do moi ap patch DH theo tung nhom. Dieu nay khong thay doi ADR fork, chi thay doi cach cap nhat codebase.

## Context

`dh` needs Level 3 (deep) control over the AI runtime to enforce workflow discipline, tool gating, model routing, skill activation, and session lane locking. The three integration options considered were:

1. **Option A (Fork)**: Vendor/fork the full OpenCode source into `dh` and patch it directly.
2. **Option B (Bundle)**: Bundle a pinned OpenCode binary and build an adapter layer with extension hooks.
3. **Option C (External)**: Keep OpenCode external and instrument via extension APIs.

Options B and C cannot satisfy the full Level 3 requirements because:

- OpenCode does not expose hook points for pre-tool-execution interception, pre-answer gating, per-agent model selection override, skill injection, or MCP routing override.
- Option B's IPC/config-injection approach provides at best Level 2.5 control — insufficient for `very-hard` tool enforcement.
- Option C delegates all runtime decisions to OpenCode, making enforcement purely advisory.

## Decision Details

### Fork Scope

Fork both layers of OpenCode:

| Layer | Language | Purpose in dh |
|---|---|---|
| `opencode-core` | Go | Process orchestration, tool execution runtime, LLM streaming, session management |
| `opencode-sdk` | TypeScript | Client SDK, type definitions, protocol contracts |

Both layers will live under `packages/` in the `dh` monorepo.

### Version Pin

Fork the latest stable OpenCode release at the time of initial fork. Record the exact commit hash in `packages/opencode-core/FORK_ORIGIN.md` and `packages/opencode-sdk/FORK_ORIGIN.md`.

### Update Strategy: Full Divergence

`dh` will **not** track upstream OpenCode after the initial fork. Rationale:

1. `dh` needs to modify core runtime paths (model dispatch, tool execution, answer pipeline) that upstream will never design for external hook injection.
2. Periodic rebasing would force constant conflict resolution at the most critical hook points.
3. `dh`'s runtime behavior (lane-locked sessions, very-hard enforcement, multi-agent topology) diverges fundamentally from OpenCode's general-purpose design.
4. Maintaining fork parity with upstream provides no value if `dh` is already patching the same code paths that upstream changes most frequently.

If upstream introduces a genuinely valuable capability that `dh` lacks, the team may selectively port individual commits. But the default posture is independent evolution.

### Hook Points (All Must-Have From Day 1)

`dh` will implement 6 runtime hook points by patching the forked OpenCode core:

#### 1. Model Selection Override

**Where**: Go core model dispatch path, before LLM API call is made.

**What it does**: Instead of using OpenCode's default model routing, `dh` intercepts the dispatch and resolves the model from `dh`'s agent-model-assignment state. Each agent identity (Quick Agent, Analyst, Architect, Implementer, Reviewer, Tester) gets its own resolved `provider/model/variant` triple.

**Interface**:

```go
type ModelOverrideHook func(agentID string, role string, lane string) (provider string, model string, variant string, err error)
```

#### 2. Pre-Tool-Execution Hook

**Where**: Go core tool execution path, after tool is selected but before execution begins.

**What it does**: Intercepts every tool call to:
- Enforce required tools by intent (block finalization if required tools haven't been called)
- Log tool usage to audit store
- Block unauthorized tool calls per lane/role policy
- Prioritize code intelligence tools over basic `grep/find/cat`

**Interface**:

```go
type PreToolExecHook func(envelope ExecutionEnvelope, toolName string, toolArgs map[string]any) (allow bool, reason string, err error)
```

#### 3. Pre-Answer Hook (Answer Gating)

**Where**: Go core answer pipeline, after LLM generates response but before it's finalized to user.

**What it does**: Validates that the answer meets `dh`'s evidence requirements:
- Required tools for the classified intent have been called
- Evidence score meets the threshold
- Confidence level is sufficient for the response type
- If validation fails: retry with expanded retrieval, or degrade response to "insufficient evidence"

**Interface**:

```go
type PreAnswerHook func(envelope ExecutionEnvelope, intent string, toolsUsed []string, evidenceScore float64) (allow bool, action string, err error)
```

#### 4. Skill Activation Hook

**Where**: Go core agent initialization path, before agent begins processing.

**What it does**: Injects active skills into the agent's context based on `dh`'s skill activation policy:
- Always-on skills (e.g., `using-skills`)
- Lane-driven skills (e.g., `verification-before-completion` in delivery/migration)
- Role-driven skills (e.g., `code-review` for Reviewer, `writing-solution` for Architect)
- Intent-driven skills (e.g., `codebase-exploration` for code understanding queries)

**Interface**:

```go
type SkillActivationHook func(envelope ExecutionEnvelope) (activeSkills []string, err error)
```

#### 5. MCP Routing Hook

**Where**: Go core MCP connection/dispatch path.

**What it does**: Overrides which MCP servers are available and prioritized for the current task:
- Code understanding tasks route to `augment_context_engine` first
- Library/framework tasks route to `context7` first
- Browser tasks route to `chrome-devtools` / `playwright`
- Research tasks route to `websearch` / `grep_app`

**Interface**:

```go
type McpRoutingHook func(envelope ExecutionEnvelope, intent string) (mcpPriority []string, mcpBlocked []string, err error)
```

#### 6. Session/State Injection

**Where**: Go core session initialization and context building paths.

**What it does**: Injects `dh`'s runtime state into the OpenCode session context:
- Current lane and lane lock status
- Current workflow stage
- Active work item IDs
- Execution envelope data
- Semantic mode configuration
- Tool enforcement level

**Interface**:

```go
type SessionStateHook func(sessionID string) (dhState DhSessionState, err error)
```

### Distribution: Pre-Built Binary

`dh` will be distributed as a single pre-built binary for each target platform:

| Platform | Architecture |
|---|---|
| macOS | arm64 (Apple Silicon), amd64 (Intel) |
| Linux | amd64, arm64 |

Build pipeline:
1. Go core compiles to a single binary (with TS SDK compiled and embedded as needed)
2. Cross-compilation via Go's native cross-compile support
3. Release artifacts distributed via GitHub Releases
4. Future: Homebrew tap for macOS, apt/rpm for Linux

Users do **not** need Node.js, Go, or any other runtime installed. The binary is self-contained.

### Package Layout Changes

The fork introduces two new packages:

```text
packages/
  opencode-core/           <- Forked Go runtime
    cmd/
    internal/
    pkg/
    go.mod
    go.sum
    FORK_ORIGIN.md
    PATCHES.md
    Makefile
  opencode-sdk/            <- Forked TypeScript SDK
    src/
    package.json
    tsconfig.json
    FORK_ORIGIN.md
    PATCHES.md
```

Existing TS packages (`shared`, `opencode-app`, `intelligence`, `retrieval`, `storage`, `runtime`, `providers`) continue to exist and provide `dh`'s higher-level logic. The Go core calls into `dh`'s enforcement hooks, which are compiled into the binary.

### Build Pipeline

```text
1. Compile packages/opencode-core (Go) with dh hooks linked in
2. Compile packages/opencode-sdk (TypeScript) -> bundled JS
3. Compile packages/* (dh TypeScript logic) -> bundled JS
4. Embed TS bundles into Go binary (or run as sidecar process)
5. Cross-compile for target platforms
6. Output: single binary per platform
```

The exact embedding strategy (Go embed, sidecar, or Bun/Deno single-binary) will be determined during implementation of the build pipeline.

## Consequences

### Positive

1. Full Level 3 control — every runtime decision can be intercepted and overridden.
2. Deterministic behavior — no dependency on external OpenCode version or behavior changes.
3. Single binary distribution — simple install, no runtime dependencies.
4. `dh` can evolve its runtime independently without upstream constraints.
5. All 6 hook points can be implemented as compile-time linked functions, not runtime hacks.

### Negative

1. Full maintenance burden — `dh` owns all runtime code including OpenCode's original functionality.
2. Requires Go toolchain for development (not just TypeScript).
3. Binary size will be larger than a thin TS wrapper.
4. Security patches from upstream OpenCode must be manually evaluated and ported if relevant.
5. Build pipeline is more complex (Go + TypeScript cross-compilation).

### Risks

1. **Fork maintenance cost**: Mitigated by full divergence — no merge conflicts, just independent evolution.
2. **Go expertise requirement**: Mitigated by keeping most `dh`-specific logic in TypeScript; Go patches are focused on hook point injection.
3. **Build complexity**: Mitigated by using Go's mature cross-compilation and keeping the build pipeline explicit in Makefile.

## Alternatives Rejected

- **Option B (Bundle + hooks)**: Insufficient control — cannot intercept model dispatch or tool execution at the code level.
- **Option C (External + APIs)**: Level 1-2 only — enforcement is advisory, not blocking.
- **Selective cherry-pick from upstream**: Rejected in favor of full divergence to avoid perpetual conflict at hook points.
- **Periodic rebase from upstream**: Rejected — the hook points are in the most actively changed code paths, making rebasing impractical.

## References

- `docs/architecture/system-overview.md` — system layer boundaries
- `docs/architecture/workflow-orchestration.md` — lane model and enforcement requirements
- `docs/architecture/agent-contracts.md` — execution envelope and role dispatch
- `docs/architecture/skills-and-mcp-integration.md` — skill and MCP activation policy
- `docs/architecture/model-routing-and-agent-config.md` — agent model assignment
- `docs/architecture/runtime-state-schema.md` — session state and audit schemas
