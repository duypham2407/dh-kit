# QA Report: Rust Host Lifecycle Authority

## Observed Result

PASS.

## Verification Scope

QA validated `RUST-HOST-LIFECYCLE-AUTHORITY` in `full/full_qa` against:

- `docs/scope/2026-04-22-rust-host-lifecycle-authority.md`
- `docs/solution/2026-04-22-rust-host-lifecycle-authority.md`
- Task-board QA scope: `TASK-RHLA-1` through `TASK-RHLA-7`, plus `REWORK-RHLA-1`, `REWORK-RHLA-2`, and `REWORK-RHLA-3`

## Scope Validation

PASS.

Verified:

- Rust lifecycle authority is scoped to first-wave Rust-hosted `ask`, `explain`, and `trace` only.
- Rust-hosted path launches and manages the TypeScript worker while Rust remains parent and lifecycle authority.
- TypeScript worker and `HostBridgeClient` do not spawn Rust or own lifecycle/recovery truth.
- Worker bundle/manifest launch truth works and remains Linux/macOS-only.
- Legacy TypeScript-hosted paths are labeled compatibility-only.
- Replay-safe recovery is integrated into the hosted request path.
- Unsafe/uncertain/final-response errors are not replayed and have the expected request classification where applicable.
- Final lifecycle/reporting metadata is truthful, including the `trace` unsupported result where applicable.
- No Windows support, daemon/socket control plane, worker pool, shell orchestration, worktree lifecycle parity, or full workflow-lane parity was introduced.

## Runtime And Automated Validation

PASS.

Commands reported by QA:

- `npm run check` — PASS
- `npm test` — PASS
- `cargo test --workspace --manifest-path rust-engine/Cargo.toml` — PASS
- `make build` — PASS
- `sh scripts/build-worker-bundle.sh` — PASS
- `sh scripts/package-release.sh dist/rust-engine/releases dist/releases dev` — PASS
- `sh scripts/verify-release-artifacts.sh dist/releases` — PASS
- `sh scripts/test-installers.sh dist/releases` — PASS
- `cargo test -p dh-engine --manifest-path rust-engine/Cargo.toml first_wave_command -- --nocapture` — PASS
- `cargo test -p dh-engine --manifest-path rust-engine/Cargo.toml worker_supervisor::tests -- --nocapture` — PASS
- `cargo run -p dh-engine --manifest-path rust-engine/Cargo.toml -- ask "find auth" --workspace . --json` — PASS
- `cargo run -p dh-engine --manifest-path rust-engine/Cargo.toml -- explain "auth" --workspace . --json` — PASS
- `cargo run -p dh-engine --manifest-path rust-engine/Cargo.toml -- trace "auth" --workspace . --json` — PASS
- Semgrep auto scan on RHLA touched files — PASS, 0 findings
- Semgrep security scan on RHLA touched files — PASS, 0 findings

## Evidence Records

QA reported evidence capture for:

- `rhla-full-qa-validation-2026-04-25`
- `rhla-full-qa-scans-2026-04-25`
- `rhla-full-qa-structural-2026-04-25`

## Issue Verification

- `RHLA-CR-001`: resolved. Replay-safe recovery is integrated into the hosted request path.
- `RHLA-QA-001`: resolved. Post-ready/pre-final replay-unsafe and uncertain worker exits are request-classified and not replayed, while replay-safe recovery remains intact.

## Task Status Recommendations

- `TASK-RHLA-1`: done — lifecycle vocabulary/protocol/Rust authority contract verified.
- `TASK-RHLA-2`: done — supervisor launchability, readiness, health, timeout, recovery, and cleanup behavior verified.
- `TASK-RHLA-3`: done — TypeScript worker entry and host-backed `BridgeClient` boundary verified.
- `TASK-RHLA-4`: done — first-wave Rust-hosted `ask`/`explain`/`trace` reporting verified.
- `TASK-RHLA-5`: done — worker bundle/manifest and release/install launch truth verified.
- `TASK-RHLA-6`: done — operator wording, compatibility-only labeling, Linux/macOS-only truth, and no-Windows boundary verified.
- `TASK-RHLA-7`: done — integrated automated, packaging, release, installer, smoke, scan, and structural evidence verified.
- `REWORK-RHLA-1`: done — replay-safe recovery integrated into hosted request path and verified.
- `REWORK-RHLA-2`: done — replay-unsafe pre-final failure request classification/no-replay verified.
- `REWORK-RHLA-3`: done — post-ready/pre-final unsafe and uncertain worker exits remain request-classified/no-replay while replay-safe recovery remains intact.

## Residual Risk

None for scoped acceptance.

QA noted that artifact writing was blocked by edit policy in the QA agent, and runtime `syntax-outline` path resolution was degraded due a literal `{cwd}` path. Manual structural evidence was substituted.

## Tool Evidence

- rule-scan: runtime `tool.rule-scan` unavailable; Semgrep CLI substitute reported 0 findings on 46 files.
- security-scan: runtime `tool.security-scan` unavailable; Semgrep CLI substitute reported 0 findings on 46 files.
- evidence-capture: 3 records reported by QA.
- syntax-outline: attempted but unavailable/degraded due runtime path resolution with literal `{cwd}`; manual structural verification substituted.
