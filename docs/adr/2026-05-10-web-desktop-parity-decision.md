# ADR: Web UI And Desktop Parity Decision

- Status: Accepted
- Date: 2026-05-10

## Context

The OpenCode gap roadmap reaches Milestone 12 after DH has local-first command, session, provider, MCP, tool, LSP, plugin, server/SDK, and TUI MVP surfaces.

OpenCode has richer web, desktop, console, and attach surfaces. DH now has the safer foundation for those clients through:

- `dh serve` local HTTP server with localhost default and password guard for non-localhost binds
- `packages/sdk` fetch client
- `dh tui` terminal client that can start or attach to the local server
- parity reporting that still exposes missing `web`, `attach`, `github`, `pr`, `db`, and `acp` command surfaces

The remaining decision is whether to create `apps/web/` or `apps/desktop/` now.

## Decision

Do not implement web or desktop in this roadmap wave.

Keep DH local-first around CLI, server/SDK, and TUI. Treat web and desktop as explicitly deferred product surfaces until TUI/server usage shows a concrete workflow that the terminal client cannot cover.

Cloud console, billing, hosted share, and provider account console remain out of scope.

## Rationale

1. The current parity gap that affects daily local use is now better served by hardening `dh run`, `dh serve`, SDK, and `dh tui` than by adding another client.
2. A web app would force browser packaging, frontend state, auth, and security review before the server has streaming/event APIs.
3. A desktop app would add lifecycle and distribution complexity while mostly wrapping a web client that is not yet justified.
4. The existing SDK keeps the future web/desktop path open without committing DH to product sprawl.

## Follow-Up Gates

Reconsider web only when all of these are true:

- server has streaming session events or WebSocket support
- TUI usage reveals a repeated workflow that benefits from browser layout
- a dedicated web implementation plan is written against `dh serve` and `packages/sdk`
- the plan includes auth, local secret handling, and browser threat-model notes

Reconsider desktop only when all of these are true:

- a web UI has been approved or implemented first
- local server lifecycle supervision is stable
- release packaging has an explicit desktop distribution contract
- desktop remains a wrapper around local-first DH, not a cloud console

## Consequences

Positive:

- The OpenCode parity roadmap closes without adding unproven product surfaces.
- The server and SDK remain the stable integration boundary for future clients.
- TUI can absorb immediate interactive workflow feedback.

Trade-offs:

- DH still does not claim OpenCode web, desktop, attach, or console parity.
- Visual workflows remain terminal-bound until a future ADR changes this decision.

## Verification

Milestone 12 acceptance is this accepted ADR. No web or desktop code is created in this wave.
