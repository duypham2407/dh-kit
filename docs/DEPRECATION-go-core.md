# Go Core Deprecation Notice

## Effective: Immediately (as of Rust Runtime v0.1.0)

### What's Deprecated
- `packages/opencode-core/` — Go-based hook enforcement and session bridge
- Go binary distribution for hook/session management

### Replacement
- `dh-engine` Rust binary now owns:
  - Session lifecycle (create/resume/transition/complete)
  - Hook enforcement (6 policy hooks)
  - Audit logging (SQLite-backed invocation logs)
  - Worker supervision (3-monitor pattern)

### Migration Path
- TS Worker continues to handle workflow logic, agent orchestration, LLM interaction
- TS Worker receives session context via SessionStateInjection hook
- All tool execution gated by PreToolExec hook
- All answer quality gated by PreAnswer hook

### Removal Timeline
- Phase 1 (Current): Go core hooks bypassed, Rust hooks active
- Phase 2 (Next release): Go core binary no longer distributed
- Phase 3 (Following release): Go core code removed from repository
