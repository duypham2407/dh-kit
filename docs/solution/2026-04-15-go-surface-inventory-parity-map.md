# GO-TO-RUST-MIGRATION: Active Go Surface Inventory and Parity Map

Date: 2026-04-15  
Work item: `GO-TO-RUST-MIGRATION`  
Task: `TASK-GO-SURFACE-INVENTORY`

## Scope classification contract

This inventory classifies Go-owned surfaces into:

- **Active surfaces requiring replacement now**
- **Temporary compatibility surfaces**
- **Historical/deletable residue (post-parity retirement)**

The classification is based on active operator lifecycle (install, upgrade, doctor, smoke, release), CI workflows, and checked-in runtime entrypoints.

---

## 1) Active surfaces that required replacement in this migration

### Release/build path

- Root `Makefile`
  - Previously delegated binary/release creation to `packages/opencode-core` Go make targets.
  - Now switched to Rust engine workspace build path as release artifact source.

- `scripts/package-release.sh`
  - Previously defaulted to `packages/opencode-core/dist/releases`.
  - Now defaults to Rust-produced artifact staging path.

### Doctor/runtime readiness path

- `packages/runtime/src/diagnostics/doctor.ts`
  - Previously treated embedded Go binary as install/distribution readiness prerequisite.
  - Now checks Rust-backed release artifact readiness contract (`dist/releases` binary + metadata).

- `packages/runtime/src/diagnostics/doctor.test.ts`
- `apps/cli/src/commands/doctor.test.ts`
- `scripts/check-doctor-snapshot.mjs`
  - Updated to remove Go-specific readiness assertions/messages and align to Rust-backed runtime artifact checks.

### CI/release workflow path

- `.github/workflows/ci.yml`
- `.github/workflows/release-and-smoke.yml`
- `.github/workflows/nightly-smoke.yml`
  - Removed Go setup/test stages from active path.
  - Replaced with Rust toolchain setup and `cargo test --workspace` over `rust-engine`.

### Active product/maintainer docs that previously instructed Go as active dependency

- `README.md`
- `docs/operations/release-and-install.md`
- `packages/opencode-sdk/README.md`
  - Updated active architecture/lifecycle language from Go-backed runtime dependence to Rust + TypeScript path.

---

## 2) Temporary compatibility surfaces (kept during cutover)

- `packages/opencode-core/` tree remains in repository for compatibility/rollback/history while active path is cut over.
- Existing Go CLI/runtime sources are retained as non-authoritative fallback surface during migration window.
- Release/install contract is preserved at operator interface level:
  - `dist/releases/`
  - `manifest.json`
  - `SHA256SUMS`
  - host-resolved installer path via `scripts/resolve-release-binary.sh`

---

## 3) Historical/deletable-after-parity residue

These are not required for active Rust-backed lifecycle after parity checkpoint and can be retired in follow-up cleanup:

- Most of `packages/opencode-core/**` implementation internals not used by active release/install/doctor/CI flow.
- Historical docs and implementation notes that discuss Go runtime as current active authority.
- Legacy comments/references in architecture snapshots and migration deep-dives (archive-class material).

---

## 4) Owner mapping (active parity map)

- **Runtime binary authority:** `rust-engine/` (Rust)
- **Release packaging contract + metadata generation:** root `Makefile` + `scripts/package-release.sh` (Shell/TS-adjacent ops)
- **Installer/upgrade/uninstall lifecycle:** `scripts/install*.sh`, `scripts/upgrade*.sh`, `scripts/uninstall.sh`
- **Doctor lifecycle classification and readiness policy:** `packages/runtime/src/diagnostics/*` (TypeScript)
- **CI/release/smoke orchestration:** `.github/workflows/*`
- **Operator-facing docs:** `README.md`, `docs/operations/*`, `docs/homebrew.md`, `docs/troubleshooting.md`

---

## 5) Parity risks to monitor in QA

- Rust artifact production must remain compatible with installer expectations and release metadata contract.
- Doctor lifecycle classification must remain truthful and not regress into false-green readiness.
- CI must remain Rust + TS validated without hidden Go dependency in required jobs.
- Go repository content may still exist temporarily; existence alone must not be interpreted as active ownership.
