Track dh-specific changes to the TypeScript SDK/bridge package here.

## Classification

This package is dh-owned original code, NOT a fork. See `FORK_ORIGIN.md` for provenance details.

## Current contents

- `src/index.ts`: barrel exports for all bridge contracts and helpers
- `src/types/protocol.ts`: discriminated bridge message union (sqlite/filesystem/cli/ipc)
- `src/types/hook-decision.ts`: canonical hook decision types aligned to Go bridge readers
- `src/types/envelope.ts`: bridge envelope identity and context contracts
- `src/types/session.ts`: session-state bridge contracts (camel/snake awareness)
- `src/types/model.ts`: model override contracts (camel/snake awareness)
- `src/types/transport-mode.ts`: transport-mode enum for bridge surface
- `src/protocol/versioning.ts`: protocol version constant
- `src/protocol/error-envelope.ts`: typed bridge result/error envelope
- `src/protocol/envelope-contract.ts`: envelope fallback semantics (envelopeId -> sessionId)
- `src/protocol/key-normalization.ts`: recursive key normalizer
- `src/compat/key-normalizer.ts`: convenience wrappers for normalization targets
- `src/compat/legacy-shims.ts`: temporary compatibility re-exports for incremental migration
- `src/client/decision-writer.ts`: typed decision write helper for SQLite-backed flow
- `src/client/session-client.ts`: session state bridge write helper
- `src/client/model-client.ts`: model override bridge write helper
- `src/client/skill-client.ts`: skill activation bridge write helper
- `src/client/mcp-client.ts`: MCP routing bridge write helper
- `src/client/ipc-stub.ts`: IPC contract placeholder (not implemented in v1)

## Migration guardrails

- Compatibility shims remain temporary and must be removed when all callers import SDK-native contracts.
- SQLite decision payloads are normalized to snake_case on write and camelCase on read to match Go dual-key readers safely.

## Planned evolution

As runtime migration continues, this package will further expand to include:

- additional consumer migrations from local bridge types to SDK contracts
- wider runtime helper coverage where legacy call sites still inline serialization logic
- eventual IPC runtime transport implementation beyond v1 contract stubs
