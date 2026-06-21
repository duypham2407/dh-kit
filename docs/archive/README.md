# Archived documentation

Docs in this directory are retained for **historical provenance only**. They describe earlier
design directions that have since been superseded — most notably the original "forked OpenCode
Go core + TypeScript SDK" architecture, which was removed in commit `ee2c1e2`. The runtime is now
the Rust `dh-engine` host supervising a TypeScript `worker.mjs`; product direction is set by the
2026-05-10 ADRs under `docs/adr/`.

**Nothing here is authoritative for the current system.** For current architecture start at:

- `docs/architecture/system-overview.md` — current Rust-host / TS-worker architecture
- `docs/architecture/source-tree-blueprint.md` — current source tree
- `docs/adr/2026-05-10-personal-coding-assistant-direction.md` — current product direction
- `README.md` — current user-facing command surface and boundaries

## Convention

When a doc becomes historical, **move it here** (preserving its sub-path, e.g.
`architecture/<name>.md`) with `git mv`, and **prepend a one-paragraph banner** to its top naming
what superseded it and where the current truth lives. This replaces the older mixed practice of
leaving stale docs in place with an inline note — keep stale content out of the live `docs/` tree.
