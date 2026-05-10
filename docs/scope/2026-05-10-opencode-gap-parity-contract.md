# OpenCode Gap Parity Contract Scope

Date: 2026-05-10

## Goal

Expose a truthful, machine-readable OpenCode parity contract through `dh doctor --json`.

## In Scope

- Static parity categories and statuses.
- Conservative OpenCode-to-DH feature matrix.
- Missing OpenCode command surfaces in `diagnostics.parity.summary.missingCommandSurfaces`.
- Missing runtime capabilities in `diagnostics.parity.summary.missingRuntimeCapabilities`.
- Plain-text doctor summary showing the next milestone.
- Tests proving DH does not claim missing OpenCode surfaces as supported.

## Out Of Scope

- Implementing `dh run`.
- Implementing session commands.
- Implementing provider login/logout.
- Implementing MCP lifecycle commands.
- Implementing TUI, web, server, desktop, or GitHub automation.

## Acceptance

- `npm test -- parity-report`
- `npm test -- doctor`
- `npm run check`
- `dh doctor --json` includes `diagnostics.parity` and `snapshot.parity`.
