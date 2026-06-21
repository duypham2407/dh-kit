# Go Core Removal — Tombstone

> **Status: completed.** The Go core has been fully removed. There are no `.go` files in the repo.
> This note is kept as the discoverable answer to "where did `packages/opencode-core/` go?".

## What was removed

- `packages/opencode-core/` — the Go-based hook-enforcement and session-bridge runtime.
- Go binary distribution for hook/session management.

The original architecture forked OpenCode with a Go core and 6 Go hook points. That direction was
reversed during the Rust migration. The Go core was retired in commit `ee2c1e2`
("complete Rust migration and retire Go surfaces").

## Replacement

The Rust `dh-engine` binary now owns:

- Session lifecycle (create/resume/transition/complete)
- Hook enforcement (`HookDispatcher` in `rust-engine/crates/dh-engine/src/hooks.rs`)
- Audit logging (SQLite-backed invocation logs via `dh-storage`)
- Worker supervision and the full process lifecycle authority

The TypeScript worker (`worker.mjs`) continues to handle workflow logic, agent orchestration, and
LLM interaction as a supervised child of the Rust host.

## Removal timeline (historical — all phases done)

- Phase 1: Go core hooks bypassed, Rust hooks active. ✅ done
- Phase 2: Go core binary no longer distributed. ✅ done
- Phase 3: Go core code removed from repository (`ee2c1e2`). ✅ done

## See also

- `docs/architecture/system-overview.md` — current Rust-host / TS-worker architecture
- `docs/qa/2026-04-15-zero-go-eradication*.md` — eradication record
- `docs/archive/architecture/opencode-integration-decision.md` — the superseded Go-fork ADR
