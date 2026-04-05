# opencode-core

Current Go runtime scaffold for `dh`.

What exists today:

- buildable Go binary entrypoint at `cmd/dh`
- registry for all 6 dh hook surfaces
- SQLite-backed `DecisionReader` bridge into TS-written hook logs
- smoke-tested bridge registration for model override, pre-tool-exec, pre-answer, skill activation, MCP routing, and session state

What does not exist yet:

- vendored upstream OpenCode Go runtime
- production embedding/runtime integration with the real upstream execution paths
- upstream source import from the currently pinned discovery candidate in `FORK_ORIGIN.md`

Current research note:

- the current Go-runtime candidate is `opencode-ai/opencode` at `73ee493265acf15fcd8caab2bc8cd3bd375b63cb`
- that upstream is archived, so it is only a provenance candidate until a final fork decision is made

This package should be read as a runtime bridge scaffold that has moved past a pure placeholder, but is not yet the final forked runtime target described in `docs/architecture/`.
