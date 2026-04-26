# QA Report: BRIDGE-RUNTIME-UTILITY-SURFACES

Date: 2026-04-22
Work Item: BRIDGE-RUNTIME-UTILITY-SURFACES
Lane/Stage: full / full_qa

## Overall Status

PASS

Verification scope covered:
- Live bounded runtime/utility method family on Rust↔TS bridge surfaces:
  - `file.read`
  - `file.readRange`
  - `file.list`
  - `tool.execute`
  - `runtime.health`
  - `runtime.diagnostics`
- Capability advertisement truthfulness and first-wave bounding
- Repo-root file-access bounds and explicit refusal/error paths
- `tool.execute` allowlist/read-only enforcement
- `doctor` / `debug-dump` bridge-native runtime truth usage without workflow/release leakage
- TS touched-path role as consumer/presenter only for runtime/file/tool truth
- Operator wording bounded/truthful for this feature’s runtime/utility surfaces

Manual bounded cross-surface verification notes:
- Rust dispatcher advertises and handles the six approved methods, with out-of-scope query family excluded from capability advertisement (`rust-engine/crates/dh-engine/src/bridge.rs`).
- File boundary enforcement and refusal taxonomy are Rust-owned with canonical root checks, traversal/symlink denial, UTF-8 gating, and bounded caps (`rust-engine/crates/dh-engine/src/bridge_file.rs`).
- Tool execution remains allowlisted/read-only (`git.rev_parse_head`, `git.status_short`) with timeout/output bounds and explicit refusals (`rust-engine/crates/dh-engine/src/bridge_tool.rs`).
- Runtime health/diagnostics payloads are bounded to bridge/runtime truth and do not include workflow-state or release-readiness claims (`rust-engine/crates/dh-engine/src/bridge_runtime.rs`).
- TS wrappers and diagnostics consumers call bridge runtime/file/tool methods and preserve bounded statuses/refusals (`packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`, `packages/runtime/src/diagnostics/bridge-runtime-probe.ts`, `packages/runtime/src/diagnostics/rust-engine-status.ts`).
- Doctor/debug-dump surfaces consume bridge-native runtime truth and explicitly communicate scope boundaries (`packages/runtime/src/diagnostics/doctor.ts`, `packages/runtime/src/diagnostics/debug-dump.ts`, `apps/cli/src/commands/doctor.ts`, `docs/user-guide.md`).

## Test Evidence

Fresh validation (this QA run):
- `npm run check` — PASS
- `npm test` — PASS
- `semgrep --config p/ci <in-scope files>` — PASS (0 findings on 17 files)
- `semgrep --config p/security-audit <in-scope files>` — PASS (0 findings on 17 files)
- `cd rust-engine && cargo test --workspace` — PASS

Tool Evidence:
- rule-scan: unavailable — `tool.rule-scan` is not exposed in this runtime; substituted with `semgrep --config p/ci` (0 findings on 17 files)
- security-scan: unavailable — `tool.security-scan` is not exposed in this runtime; substituted with `semgrep --config p/security-audit` (0 findings on 17 files)
- evidence-capture: pending workflow record updated during QA closeout
- syntax-outline: unavailable — `tool.syntax-outline` path resolution is rooted to `/Users/duypham/Code/DH/{cwd}` and cannot reach in-scope files; substituted with manual structural verification via direct source inspection and test assertions

## Issues

No blocking issues found for BRIDGE-RUNTIME-UTILITY-SURFACES in the validated in-scope surfaces.
