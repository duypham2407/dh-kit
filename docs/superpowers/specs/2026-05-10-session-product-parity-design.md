# Session Product Parity Design

## Goal

Milestone 3 exposes DH sessions as a stable local product surface comparable to the practical OpenCode session commands, while preserving DH's Rust-hosted runtime spine and existing SQLite session store.

The user should be able to inspect, export, import, fork, delete, and summarize sessions without needing to know whether the session originated from `dh run`, a lane workflow, or an older DH workflow path.

## Scope

In scope:

- `dh session list [--json] [--limit <n>]`
- `dh session show <id> [--json]`
- `dh session delete <id> [--yes]`
- `dh session fork <id> [--title <text>] [--json]`
- `dh export [session-id] [--sanitize]`
- `dh import <file>`
- `dh stats [--days <n>] [--models <n>] [--tools <n>] [--json]`
- Versioned local export schema for DH session data.
- Import validation that refuses malformed and future-version exports.
- Sanitization for secrets, file contents, file paths, shell commands, and provider/model metadata where needed.
- Stats from data DH actually stores today.

Out of scope:

- OpenCode share URLs or remote share service.
- Cloud/server/web/TUI attach flows.
- Claiming token or cost accuracy before DH stores those fields consistently.
- Moving TypeScript SQLite operations into Rust before Rust and TypeScript share one database authority for these tables.

## Approach

Use **TypeScript local-session parity first**.

Options considered:

- **Clone OpenCode command internals.** This would expose familiar UX quickly, but OpenCode's message/session internals do not match DH's current SQLite tables and Rust-hosted lifecycle. It would create a second source of truth.
- **Make Rust own all session product commands now.** This matches the long-term runtime direction, but Rust currently uses separate session-manager concerns from the TypeScript `.dh/sqlite/dh.db` schema. Doing this now risks split writes.
- **Recommended: TypeScript product surface over DH SQLite.** The CLI formats output and calls runtime/session services that read and write the existing DH SQLite tables. Rust continues to own run/lane lifecycle where already integrated, while Milestone 3 avoids introducing another session database boundary.

This milestone can later be ported behind a Rust command adapter once Rust owns the same session tables.

## Data Model

Add shared types under `packages/shared/src/types/session.ts`:

- `SessionExportSchemaVersion = 1`
- `SessionExportDocument`
- `SessionExportSource`
- `SessionExportPayload`
- `SessionStatsReport`
- lightweight list/show DTOs for CLI output

The export document is JSON:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-05-10T00:00:00.000Z",
  "source": {
    "product": "dh",
    "version": "0.3.1-rc.7",
    "repoRoot": "/repo"
  },
  "sanitized": false,
  "payload": {
    "session": {},
    "runtimeEvents": [],
    "summaries": [],
    "checkpoints": [],
    "reverts": []
  }
}
```

The payload uses DH's existing record shapes:

- `SessionState`
- `SessionRuntimeEventRecord`
- `SessionSummaryRecord`
- `SessionCheckpointRecord`
- `SessionRevertRecord`

The importer accepts only `schemaVersion: 1`. Any future version fails with a clear error such as `Unsupported session export schema version 2. This DH build supports version 1.`

## Storage Boundaries

Extend existing repositories instead of bypassing them:

- `SessionsRepo`
  - `list({ limit? })`
  - `deleteById(sessionId)`
- `SessionRuntimeEventsRepo`
  - `deleteBySession(sessionId)`
  - `saveRecord(record)` for import/fork preservation
- `SessionSummaryRepo`
  - `listBySession(sessionId)`
  - `deleteBySession(sessionId)`
  - `saveRecord(record)`
- `SessionCheckpointsRepo`
  - `deleteBySession(sessionId)`
  - `saveRecord(record)`
- `SessionRevertRepo`
  - `listBySession(sessionId)`
  - `deleteBySession(sessionId)`
  - `saveRecord(record)`

Deletion should explicitly remove dependent rows before deleting the session. DH's SQLite bootstrap does not currently enable `ON DELETE CASCADE`, so relying on foreign-key cascade would be incorrect.

## Command Semantics

### `dh session list`

Lists sessions sorted by `updatedAt DESC, createdAt DESC`.

Plain output is a compact table with:

- session id
- lane
- status
- current stage
- updated time

JSON output returns an object:

```json
{
  "sessions": []
}
```

`--limit <n>` defaults to `20`, must be a positive integer, and caps output only after sorting.

### `dh session show <id>`

Shows the session, latest summary, and counts for runtime events, checkpoints, and reverts.

Plain output is inspectable and compact. JSON output returns:

```json
{
  "session": {},
  "latestSummary": null,
  "counts": {
    "runtimeEvents": 0,
    "summaries": 0,
    "checkpoints": 0,
    "reverts": 0
  }
}
```

Missing session returns exit code `1`.

### `dh session delete <id> [--yes]`

Deletes a session and dependent local records only when `--yes` is present. Without `--yes`, the command returns exit code `1` with an explicit confirmation message.

The command is intentionally non-interactive for this milestone so tests and automation are deterministic.

### `dh session fork <id> [--title <text>] [--json]`

Creates a new session id from an existing session.

Fork behavior:

- Source session metadata is copied.
- `sessionId`, `createdAt`, and `updatedAt` are regenerated.
- `status` resets to `in_progress`.
- `activeWorkItemIds` resets to `[]`.
- latest summary/checkpoint/revert pointers are cleared unless the copied records get new ids in the same operation.
- Runtime events, summaries, checkpoints, and reverts are copied with new ids and remapped to the new session id.
- A new `session.created` runtime event records `{ commandFamily: "session", forkedFromSessionId, title }`.

The first implementation should copy enough transcript/runtime evidence for `dh session show`, `dh export`, and future resume flows to work. It should not claim full OpenCode conversation-branch semantics.

### `dh export [session-id] [--sanitize]`

Exports the requested session. If no id is provided, exports the latest session across all lanes.

Plain output is JSON written to stdout. The command returns exit code `1` if there is no matching session.

Sanitization recursively redacts:

- environment-shaped secret keys and values, including `api_key`, `token`, `authorization`, `secret`, and `password`
- absolute repo-root paths and home-directory paths
- file attachment contents
- shell command strings
- provider/model values if they appear beside credential-like data

Use stable redaction markers:

- `[REDACTED_SECRET]`
- `[REDACTED_PATH]`
- `[REDACTED_FILE_CONTENT]`
- `[REDACTED_COMMAND]`

Sanitization must preserve document shape so imports can still validate the export.

### `dh import <file>`

Reads a local JSON export file and imports it into the current repo's `.dh/sqlite/dh.db`.

Import behavior:

- Validates JSON structure and schema version.
- Requires `payload.session.sessionId`.
- Saves the session with `repoRoot` rewritten to the current repo.
- Upserts imported record ids where repositories support deterministic ids.
- Returns imported session id and record counts.

If the target repo already has the same session id, import overwrites the session and appends/upserts child records according to repository behavior. This keeps the first implementation deterministic and easy to re-run in tests.

### `dh stats`

Aggregates local stored session data.

Fields:

- total sessions
- sessions by lane
- sessions by status
- runtime events by type
- top models by `message.started` payload `model`
- top tools by `tool.started` payload `toolName` or `name`
- token and cost fields only if future event payloads contain numeric usage/cost data

`--days <n>` filters by session `updatedAt >= now - n days`. It must be a positive integer.

`--models <n>` and `--tools <n>` default to `5` and must be positive integers.

Plain output names unavailable token/cost data as `unavailable`, not `0`, unless zero is actually observed from stored usage.

## Error Handling

Use direct, deterministic CLI errors:

- Unknown subcommand: `Unknown session command: <name>`
- Missing id: `dh session show requires <id>.`
- Missing `--yes`: `Refusing to delete session '<id>' without --yes.`
- Missing export file: `dh import requires <file>.`
- Invalid JSON: `Could not parse session export JSON: <message>`
- Future version: `Unsupported session export schema version <n>. This DH build supports version 1.`

Runtime services throw `Error` with these messages; CLI commands catch and print them to stderr with exit code `1`.

## Testing Strategy

Use TDD and local temp repositories.

Focused tests:

- `apps/cli/src/commands/session.test.ts`
  - list/show/delete/fork argument parsing and output
  - confirmation guard for delete
  - JSON output contracts
- `apps/cli/src/commands/export.test.ts`
  - default latest session export
  - explicit session export
  - sanitize output
- `apps/cli/src/commands/import.test.ts`
  - valid import
  - malformed JSON
  - future schema version rejection
- `apps/cli/src/commands/stats.test.ts`
  - session counts
  - model/tool aggregation
  - days filter
- runtime tests for export/import/fork/delete services
- repository tests for list/delete/saveRecord helpers
- root help test for the new command surfaces

Acceptance commands:

```bash
npm test -- session
npm test -- session-export
npm test -- session-import
npm test -- session-delete
npm test -- session-fork
npm test -- stats
npm test -- root
npm run check
cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine session_manager
```

The Cargo check is a regression guard for existing Rust session manager behavior. This milestone does not require new Rust session command ownership.

## Success Criteria

- Sessions are visible through `dh session list/show`.
- Sessions can be deleted safely with an explicit guard.
- Sessions can be forked locally with source metadata.
- A session can be exported, imported into a temp repo, shown, and exported again.
- Sanitized export preserves shape while redacting sensitive data.
- Stats reports only what DH can truthfully derive from stored data.
- The root help surface no longer omits session/export/import/stats parity commands.
