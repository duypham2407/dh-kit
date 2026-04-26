# QA Report: Rust-Hosted Build Evidence

## Observed Result

OVERALL: PASS.

## Verification Scope

QA validated `RUST-HOSTED-BUILD-EVIDENCE` in `full/full_qa` against:

- `docs/scope/2026-04-25-rust-hosted-build-evidence.md`
- `docs/solution/2026-04-25-rust-hosted-build-evidence.md`

The QA pass covered the approved Rust-hosted first-wave build-evidence scope: one named `query.buildEvidence` worker-to-host expansion, Rust-authored packet truth, bounded broad `ask` routing, preserved narrow behavior, explicit insufficient/unsupported states, lifecycle/evidence separation, allowlist boundaries, bounded operator truth, and final validation evidence.

## Acceptance Coverage Summary

PASS.

- AC-1: `query.buildEvidence` capability truth is live only where the Rust host and TypeScript worker exercise it end to end.
- AC-2: bounded Rust-hosted broad `ask` routes through Rust-authored `query.buildEvidence` packet truth.
- AC-3: narrow `ask`/`explain` behavior remains on the specialized truthful surfaces instead of being forced through build evidence.
- AC-4: grounded build-evidence output preserves inspectable packet evidence and provenance.
- AC-5: partial/degraded packet limitations remain visible through TypeScript consumption and final presentation.
- AC-6: insufficient outcomes remain honest when required proof is missing; TypeScript does not synthesize a stronger packet.
- AC-7: unsupported runtime trace / out-of-scope classes remain explicit and do not silently fall back to hidden packet support.
- AC-8: TypeScript preserves Rust packet truth without confidence upgrades, material-gap removal, or legacy packet promotion.
- AC-9: worker-to-host method support remains allowlisted; adding `query.buildEvidence` did not create generic forwarding.
- AC-10: lifecycle success remains separate from answer/evidence state in Rust-hosted command output.
- AC-11: touched wording and presenter output remain bounded to local Rust-hosted first-wave support and avoid Windows, daemon, remote, runtime-trace, or universal-reasoning claims.
- AC-12: fresh validation evidence was provided across TypeScript checks/tests, Rust formatting/check/tests, worker bundle build, Rust-hosted smokes, and static/security scan substitutes.

## Validation Commands And Outcomes

- `npm run check` — PASS, exit 0.
- Targeted `npm` tests — PASS, exit 0, 7 files / 77 tests.
- `cargo fmt --check` — PASS, exit 0.
- `cargo check --workspace --manifest-path rust-engine/Cargo.toml` — PASS, exit 0, with dead-code warnings only.
- Targeted cargo tests — PASS, exit 0.
- `cargo test --workspace --manifest-path rust-engine/Cargo.toml` — PASS, exit 0, 100 tests.
- Worker bundle build — PASS, exit 0.
- Rust-hosted broad ask smoke — PASS, exit 0; `query.buildEvidence` routed; `answerState` was `insufficient` due no auth evidence; lifecycle was `clean_success`.
- Rust-hosted explain smoke — PASS, exit 0; `query.definition` preserved; grounded definition evidence returned.
- Rust-hosted unsupported trace ask smoke — PASS, exit 0; explicit unsupported result; lifecycle was `clean_success`.
- Semgrep auto/security substitutes — PASS, exit 0, 0 findings.

## Behavior Impact

Verified scoped behavior:

- Rust-hosted broad-understanding `ask` can reach canonical Rust build-evidence routing without TypeScript becoming evidence authority.
- Bounded insufficient and unsupported outcomes are visible and are not confused with lifecycle success.
- Narrow definition-style behavior remains preserved through `query.definition`.
- Unsupported trace-style requests remain explicitly unsupported while the Rust-host lifecycle can still complete cleanly.
- Static/security scan substitutes found no blocking issues.

## Non-Blocking Observations

- Existing Rust dead-code warnings remain present during `cargo check --workspace`; QA treated these as non-blocking because the command exited 0 and warnings were not new blocking failures for this scope.
- Worker path smoke evidence has a `/tmp` versus `/private/tmp` caveat on macOS path normalization; QA treated this as non-blocking because the smoke completed successfully and did not affect scoped behavior.

## Issue List

No blocking QA issues found.

## Tool Evidence

- rule-scan: unavailable as a direct runtime tool in this artifact-only step; QA pass used Semgrep auto substitute, exit 0, 0 findings.
- security-scan: unavailable as a direct runtime tool in this artifact-only step; QA pass used Semgrep security substitute, exit 0, 0 findings.
- evidence-capture: not mutated in this artifact-only step per user instruction; QA pass evidence was summarized from the already-passed session context.
- syntax-outline: not needed for this artifact creation; structural expectations were covered by the previously completed QA pass and acceptance summary above.

## Verification Record

- issue_type: none
- severity: none
- rooted_in: none
- evidence: `npm run check`, targeted `npm` tests, `cargo fmt --check`, `cargo check --workspace`, targeted cargo tests, `cargo test --workspace`, worker bundle build, Rust-hosted broad ask/explain/unsupported smokes, Semgrep auto/security substitutes
- behavior_impact: approved scope acceptance criteria pass; no blocking runtime or security findings
- route: `qa_to_done`

## Recommended Route

Approve `qa_to_done`.
