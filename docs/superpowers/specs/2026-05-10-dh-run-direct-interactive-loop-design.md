# `dh run` Direct Interactive Loop Design

## Goal

Add a first usable `dh run` command that behaves like an OpenCode-style direct assistant entry point while preserving the Milestone 1 runtime split: Rust owns lifecycle authority and TypeScript owns prompt assembly, provider calls, event body generation, and CLI rendering.

This milestone builds the event-driven command path that later TUI and server surfaces can attach to. It does not build the TUI, server, full tool catalog, or full multi-turn terminal REPL.

## Product Scope

`dh run [message]` starts or resumes a run session from one prompt assembled from remaining CLI arguments. It supports:

- `--json`
- `--continue`
- `--session <id>`
- `--fork`
- `--model <provider/model>`
- `--agent <agent-id>`
- `--variant <variant-id>`
- `--file <path>` repeated
- `--title <text>`
- `--auto-approve`

The MVP is a single prompt execution with normalized event output. Plain text mode prints the assistant answer and relevant lifecycle notes. JSON mode writes newline-delimited JSON events so scripts can consume the same event stream that future TUI and server code will use.

## Non-Goals

- No TUI or attach UI.
- No headless HTTP/WebSocket server.
- No long-running terminal REPL loop.
- No image or binary attachment parsing.
- No OpenCode-equivalent write/edit/bash/apply_patch tool catalog.
- No full permission prompt UI. `permission.requested` can appear only as a normalized blocked event for unavailable or denied capabilities in this milestone.
- No provider login/logout lifecycle. Existing provider config and fallback behavior remain the source of model availability.

## Architecture

Rust gets a new command family entry for `run` and a host command that sends `session.runDirect` to the TypeScript worker. Rust wraps the result in the same authoritative envelope style created in Milestone 1: `command`, `commandFamily`, `runtimeAuthority`, `sessionId`, `finalStatus`, `degradedReason`, `rustLifecycle`, and `workerResult`.

TypeScript adds `runDirectCommand()` as the worker-owned body of the run. It creates or resumes a session, assembles prompt context from message text and allowed text file attachments, calls the configured chat provider or deterministic offline fallback, and emits normalized events through `SessionEventStream`.

The CLI `dh run` command is a thin parser and renderer. It routes to Rust-hosted execution through `runtime-client` by default. A direct TypeScript compatibility path is not exposed for `dh run`; the first supported run surface is Rust-hosted.

## Components

### CLI Command

`apps/cli/src/commands/run.ts` parses arguments, validates invalid combinations, calls `createRuntimeClient().runDirect()`, and renders either text or JSON event output.

Validation rules:

- Empty message is invalid unless `--continue` or `--session <id>` is present.
- `--continue` and `--session <id>` cannot both be set.
- `--fork` requires `--session <id>`.
- `--model` must be `provider/model`.
- `--variant` requires either `--model` or `--agent`.
- `--file` paths must exist, be files, stay inside the repository root, and decode as UTF-8 text.
- `--auto-approve` is accepted but does not bypass unavailable tool or permission boundaries.

### Runtime Client

`apps/cli/src/runtime-client.ts` gains `runDirect(input)`. The default implementation calls a Rust-hosted adapter. The adapter invokes `cargo run -q -p dh-engine -- run ... --json` in local development, matching the lane adapter pattern.

### TypeScript Worker Workflow

`packages/opencode-app/src/workflows/run-direct-command.ts` owns the body execution:

- Resolve run target session: new, latest via `--continue`, specific via `--session`, or fork from a specific session.
- Build prompt messages from system context, optional title, file attachments, prior summary when resuming, and user message.
- Select provider/model from explicit options or existing defaults.
- Prefer `ChatProvider.chatStream()` when available; otherwise call `chat()` once and emit one `text.delta`.
- Persist run events through `SessionRuntimeEventsRepo`.
- Return a final `RunDirectReport` with events, session id, model, assistant text, final status, and degraded reason.

### Session Event Stream

`packages/runtime/src/session/session-event-stream.ts` defines:

- `RunEvent` union for normalized output.
- `SessionEventStream` helper that appends in-memory events and persists each event to `SessionRuntimeEventsRepo`.
- Sequence and timestamp handling so text and JSON presenters can trust ordering.

Required event names:

- `session.created`
- `message.started`
- `text.delta`
- `tool.started`
- `tool.delta`
- `tool.finished`
- `permission.requested`
- `message.finished`
- `session.finished`
- `runtime.degraded`

Tool events are part of the event vocabulary now, but the MVP emits them only for explicitly blocked/unavailable tool requests or future-compatible fixtures. The implementation must not pretend full tool execution exists.

### Rust Host

`rust-engine/crates/dh-engine/src/host_commands.rs` gains a run request path that sends `session.runDirect` to the worker and wraps its response. `worker_protocol.rs` advertises the method and runtime authority state for the `run` family. `main.rs` parses `run` and forwards the options.

Rust remains responsible for startup, worker readiness, request classification, cancellation, cleanup, final status, and top-level exit code.

## Data Flow

1. User runs `dh run --json --file README.md "summarize this repo"`.
2. CLI parser validates flags and calls `runtimeClient.runDirect()`.
3. Runtime client invokes Rust-hosted `dh-engine run ... --json`.
4. Rust starts the TypeScript worker and sends `session.runDirect`.
5. Worker creates or resolves session, builds attachments and prompt context, and emits events through `SessionEventStream`.
6. Worker returns `RunDirectReport` to Rust.
7. Rust wraps the worker report in a runtime authority envelope.
8. CLI renders either plain text or NDJSON events.

## Error Handling

CLI parse errors return exit code 1 with a specific stderr message and no partial run.

Attachment errors return exit code 1 before provider execution. Missing files, directories, paths outside the repository, and non-UTF-8 files each have distinct messages.

Provider failures emit `runtime.degraded` and `session.finished` with `finalStatus: "request_failed"` unless a deterministic offline fallback is explicitly used. Offline fallback emits `runtime.degraded` with a reason that provider setup was unavailable.

Ctrl-C cancellation must propagate to Rust. Rust returns final status `cancelled` and cleanup metadata in the authoritative envelope.

JSON renderer must never output human prose mixed into stdout. Diagnostics go to stderr or into `runtime.degraded` events.

## Testing Strategy

Use TDD per component.

CLI tests cover parsing, invalid combinations, file flag handling, text rendering, JSON rendering, and root help registration.

Workflow tests cover new session, continue latest, specific session, fork, streaming provider, non-streaming provider, offline degraded fallback, attachment ingestion, and event persistence.

Rust tests cover contract advertisement, `session.runDirect` method routing, success envelope, startup failure envelope, request failure envelope, and cancellation classification.

Integration smoke covers:

- `dh run "summarize this repo" --json`
- `dh run --continue "continue the previous answer"`
- `dh run --file README.md "explain this file"`

## Acceptance Criteria

- `dh run` appears in CLI help as a Rust-hosted run path.
- `dh run "message"` produces a useful plain text response.
- `dh run "message" --json` produces NDJSON run events and a Rust authority envelope when called through the Rust adapter.
- `--continue` resumes the latest run-compatible session.
- `--session <id>` targets a specific session.
- `--fork --session <id>` creates a new session linked to the source session in metadata.
- Text file attachments are included in prompt context and recorded in event metadata.
- Doctor/parity no longer lists direct run loop as missing once acceptance gates pass.

## Self-Review

- Placeholder scan: no placeholder sections or deferred implementation notes remain inside the committed scope.
- Consistency check: Rust is lifecycle authority, TypeScript is worker body authority, matching Milestone 1.
- Scope check: this is one milestone focused on CLI run plus event stream, not TUI/server/tool catalog.
- Ambiguity check: JSON output is NDJSON events for CLI automation, while Rust JSON envelope remains the host boundary for adapter calls.
