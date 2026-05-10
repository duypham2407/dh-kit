# TUI MVP Design

## Goal

Milestone 11 adds a first interactive terminal client for DH after the `run`, session, server, and SDK surfaces exist.

The MVP should make DH usable from a persistent terminal screen without pretending to have full OpenCode TUI parity. It attaches to the local server contract, can start a local server when no server URL is provided, sends prompts through the SDK, renders session/run events, and exposes model/agent/session/permission state in a deterministic text UI.

## Scope

In scope:

- `apps/tui/src/state.ts` reducer for session list, transcript, prompt text, model/agent selection, read-only fallback, and permission prompts.
- `apps/tui/src/render.ts` ANSI-safe string renderer for the main screen, dialogs, run reports, and server fallback.
- `apps/tui/src/app.ts` controller that attaches to a `DhClient`, fetches health/sessions, submits prompts, and applies run reports to state.
- `apps/tui/src/main.ts` runtime entry point using Node `readline/promises` for a small dependency-free interactive loop.
- `apps/cli/src/commands/tui.ts` command that starts `dh serve` by default or attaches to `--server <url>`.
- `packages/sdk/src/client.ts` session-list method for `/sessions`.
- Root help and parity report updates for the TUI command surface.

Out of scope:

- OpenTUI/React/Ink dependency adoption.
- Mouse support, panes, alternate-screen terminal management, and full keybinding coverage.
- WebSocket/event streaming; the MVP renders completed run reports and their normalized events.
- Full permission approval workflow over the server; the MVP renders permission requests found in events and keeps approval APIs deferred until server streaming exists.
- TUI plugin hooks.

## Library Spike Decision

OpenTUI would be closer to OpenCode's client direction, but it is not present in this repository and adding it now would require new dependency and integration risk. React/Ink is also not present. The MVP therefore uses Node `readline/promises`, plain TypeScript state, and string renderers. This keeps tests fast and makes the interaction contract independent from any future richer terminal renderer.

## Data Flow

`dh tui` parses flags and creates a TUI runtime:

1. If `--server <url>` is provided, create `DhClient` for that URL.
2. Otherwise start `startDhServer({ host: "127.0.0.1", port: 0 })` and create a client for the returned URL.
3. Call `client.health()` and `client.sessions()`.
4. Render the screen.
5. Read prompt lines from stdin. A non-empty line calls `client.run({ message, model, agentId })`.
6. Convert the returned `RunDirectReport` into TUI transcript items and permission prompt state.
7. Re-render after each state transition.

When the server is unavailable, the app enters read-only mode with the error message and does not attempt prompt submission.

## Testing

- Reducer tests prove state transitions are deterministic.
- Renderer tests prove sessions, transcript, permissions, and read-only fallback appear in output.
- App/controller tests use a fake client and fake IO, with no real terminal or server.
- CLI tests inject server/client dependencies and verify attach/start modes.
- Parity/root tests prove the TUI surface is advertised without claiming full attach/web parity.

Acceptance:

- `npm test -- tui sdk root parity-report`
- `npm run check`
