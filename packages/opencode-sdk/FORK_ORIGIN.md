## Fork Provenance

Decision: `docs/adr/2026-04-05-fork-provenance-strategy.md`

### Classification

dh-owned internal SDK/bridge. NOT a fork of any upstream.

### Evaluated upstream (not adopted)

- Repository: `https://github.com/anomalyco/opencode`
- Branch: `dev`
- Evaluated commit: `8b8d4fa066a1de331f6e478ae4055636a9271707`
- SDK path in upstream: `packages/sdk/js/`
- Status: Evaluated and rejected for vendoring

### Reason for rejection

The JS SDK candidate comes from a different upstream lineage (`anomalyco/opencode`) than the Go runtime fork source (`opencode-ai/opencode`). Forcing mixed-lineage vendoring would:

1. Create misleading provenance records
2. Introduce dependency coupling between unrelated codebases
3. Provide no meaningful advantage since dh's TS layer is already substantially original code

### Current purpose

This package defines protocol contracts between dh's TypeScript orchestration layer and the Go runtime:

- Type definitions for the bridge protocol
- Message/event types that cross the TS <-> Go boundary
- SDK surface for internal dh packages to communicate with the runtime

### Ownership

Fully owned by `dh`. All code in this package is original or will be written to match dh's specific bridge requirements.
