# Server And SDK Design

## Goal

Milestone 10 creates the local headless server boundary that future TUI/web clients can attach to.

The MVP is local-first: it defaults to localhost, refuses non-localhost binds without a password, exposes basic health/session/run/provider/MCP routes, and ships a small SDK client.

## Scope

In scope:

- `packages/server/src/server.ts` Node HTTP server.
- Routes for health, sessions, run command, providers, MCP status, and session events.
- `packages/sdk/src/client.ts` fetch-based client.
- `dh serve [--host <host>] [--port <port>] [--password <password>] [--json]`.
- Basic auth requirement for non-localhost host binds.
- JSON request/response only.

Out of scope:

- WebSocket streaming.
- Browser UI.
- TLS/cert management.
- Multi-user auth.
- Remote deployment.

## Testing

- Server route tests against an ephemeral localhost port.
- SDK tests against the server.
- CLI parse/start tests with injected start function.
- Parity/root help tests.

Acceptance:

- `npm test -- server sdk serve root parity-report`
- `npm run check`
