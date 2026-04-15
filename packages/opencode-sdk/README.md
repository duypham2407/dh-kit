# opencode-sdk

dh-owned internal runtime bridge SDK for TypeScript ↔ Rust runtime communication.

What exists today:

- canonical bridge contract types (`types/`, `protocol/`, `client/`, `compat/`)
- protocol versioning (`BRIDGE_PROTOCOL_VERSION`)
- key normalization helpers (camelCase ↔ snake_case)
- typed runtime decision writers for SQLite-backed bridge flow
- contract stubs for filesystem/CLI transport and IPC future mode

What does not exist yet:

- IPC runtime transport implementation (v1 ships interface stubs only)
- complete migration of every legacy local bridge type path

Current research note:

- the current JS-SDK candidate is `anomalyco/opencode/packages/sdk/js` at `8b8d4fa066a1de331f6e478ae4055636a9271707`
- this does not currently share the same upstream lineage as the Rust-runtime candidate

Current vs target packaging note:

- **Current state:** repo is TypeScript-first, bridge contracts are consumed directly from source.
- **Target state:** single-binary packaging remains a separate runtime/distribution track and does not change this package ownership model.

## Safe extension guide

When extending bridge contracts:

1. Add/adjust types in `src/types/` first, derived from runtime reader expectations.
2. Keep both camelCase and snake_case payload compatibility where runtime readers accept dual keys.
3. Bump protocol version only when runtime reader changes are also required.
4. Route all new decision writes through client helpers (do not duplicate serialization in callers).
5. Update `PATCHES.md` with rationale and migration notes for any compatibility shim.

## Race/order safety note

Bridge readers consume latest rows ordered by envelope preference and timestamp. TS decision writes must occur before related runtime hook reads for deterministic enforcement. Current architecture maintains that ordering within the same process flow.
