Track dh-specific changes to the TypeScript SDK/bridge package here.

## Classification

This package is dh-owned original code, NOT a fork. See `FORK_ORIGIN.md` for provenance details.

## Current contents

- `src/types/protocol.ts`: minimal protocol placeholder for TS <-> Go bridge type contracts

## Planned evolution

As the Go runtime fork is vendored and hook integration progresses, this package will grow to include:

- Bridge protocol message types (TS <-> Go IPC/shared-DB)
- Hook decision payload types matching `packages/opencode-core/pkg/types/`
- Session and envelope types that cross the language boundary
- SDK-level helpers for dh's TS packages to interact with the Go runtime
