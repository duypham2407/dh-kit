# LSP Graph Augmentation Design

## Goal

Milestone 8 adds a live LSP intelligence boundary that augments DH's Rust graph without replacing it.

The immediate target is a truthful, testable LSP surface: configuration, server catalog, diagnostics service, LSP-backed tool wrappers, and `dh lsp diagnostics`. When no language server is configured, DH reports an explicit unavailable state instead of pretending to have live LSP data.

## Scope

In scope:

- LSP enablement config vocabulary: `off`, `manual`, `auto`.
- TypeScript/JavaScript catalog entry.
- Mockable LSP client interface for diagnostics, hover, definition, references, document symbols, and workspace symbols.
- `LspService` that resolves config, routes supported operations, and returns unavailable reports when no client exists.
- `lsp-tool.ts` wrappers for runtime tool use.
- `dh lsp diagnostics --file <path> [--json]`.
- Retrieval augmentation hook that can accept live LSP evidence packets without treating them as canonical index truth.

Out of scope:

- Auto-installing language servers.
- Long-lived LSP process supervision.
- LSP over TCP/websocket.
- Replacing Rust graph symbol storage.
- Full call hierarchy implementation beyond a typed unavailable result.

## Architecture

LSP code lives under `packages/opencode-app/src/lsp`:

- `lsp-client.ts` defines the client interface and report types.
- `lsp-server-catalog.ts` lists known language server metadata.
- `lsp-service.ts` owns config resolution, path containment, client dispatch, and unavailable fallbacks.

Runtime-facing wrappers live in `packages/opencode-app/src/tools/lsp-tool.ts`. They return normalized tool-style result envelopes and can be wired into the tool runner later.

CLI code in `apps/cli/src/commands/lsp.ts` only parses arguments and renders reports. It does not spawn a language server in this milestone.

## Testing

Use TDD:

- Catalog tests for TypeScript/JavaScript support.
- Service tests with injected fake client and unavailable fallback.
- Tool tests for diagnostics/hover/definition wrappers.
- CLI tests for diagnostics JSON/plain errors.
- Retrieval tests proving LSP evidence can be merged as live evidence.

Acceptance commands:

- `npm test -- lsp lsp-tool run-retrieval root parity-report`
- `npm run check`
