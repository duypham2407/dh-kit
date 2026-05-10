# MCP Lifecycle Option A Design

## Goal

Milestone 5 Option A makes MCP servers first-class local configuration in DH without implementing the full stdio runtime runner or OAuth callback flow yet.

Users should be able to add, list, inspect, and clear local MCP auth state from the CLI. Existing MCP routing, auth-status, and audit primitives remain the runtime truth for workflows until the later full MCP runtime milestone.

## Scope

In scope:

- `dh mcp list [--json]`
- `dh mcp add --name <name> --command <cmd> [--arg <arg>] [--env <KEY=VALUE>]`
- `dh mcp auth list [--json]`
- `dh mcp logout <name>`
- `dh mcp debug <name> [--json]`
- Local config under `.dh/mcp/servers.json`.
- Public reports that redact env values, token-shaped values, auth headers, passwords, and secret keys.
- Merge default registry metadata with local command-based MCP entries for list/debug.
- Auth status model only: `available`, `needs_auth`, `degraded`, `unavailable`.
- Debug reports that show launch command shape, redacted env names/status, auth state, tool/resource counts when known, and last failure if present.
- Parity report update that removes the `mcp` command surface from the missing command list while keeping runtime MCP server lifecycle and OAuth callback as missing capabilities.

Out of scope:

- Spawning MCP servers.
- JSON-RPC initialize/tools/list/resources/list/tools/call.
- OAuth browser callback, device-code flow, token refresh, token revoke.
- Exposing MCP resources to `dh run`.
- Model-driven MCP tool execution.

## Architecture

Add a small MCP lifecycle layer under `packages/opencode-app/src/mcp`. The layer owns local file persistence, redaction, public report shaping, and debug report generation. CLI code under `apps/cli/src/commands/mcp.ts` only parses arguments and renders reports.

The local store is intentionally project-local and ignored by git:

```text
.dh/mcp/servers.json
```

The file can contain command env values and future auth state, so writes use mode `0600` where supported. All public DTOs use redacted values or status-only fields.

## Data Model

`McpServerRecord`:

- `name`
- `command`
- `args`
- `env`
- `enabled`
- `createdAt`
- `updatedAt`
- optional `lastFailure`
- optional `capabilities`

`McpAuthRecord`:

- `name`
- `status`
- optional `serverIdentity`
- optional `observedAt`
- optional `lastFailure`

Public list entries include command, args, env key names with redacted values, enabled state, auth status, source (`default` or `local`), and capability counts. Raw env values never leave the service layer.

## Error Handling

- Missing `--name` or `--command` fails deterministically.
- Invalid `--env` values must use `KEY=VALUE`.
- `logout` on a server with no local auth state returns exit code `1` with a deterministic message.
- `debug` for unknown server returns exit code `1`.
- Malformed local MCP store throws a clear parse error.

## Testing

Use TDD:

- Store tests for add/list/logout/debug and redaction.
- CLI tests for parsing/rendering/errors.
- Root help tests for command registration.
- Parity tests proving `mcp` command surface is no longer missing while OAuth/runtime lifecycle remains missing.

Acceptance commands:

- `npm test -- mcp`
- `npm test -- root`
- `npm test -- parity-report`
- `npm run check`

