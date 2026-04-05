# Staging E2E Smoke

This runbook verifies release artifacts and runtime behavior after packaging.

## Prerequisites

- Release artifacts exist in `dist/releases/` (run `make release-all` first).
- Optional for provider-backed smoke: set `OPENAI_API_KEY`.

## Execute smoke script

```sh
scripts/staging-e2e-smoke.sh
```

Optional custom release directory:

```sh
scripts/staging-e2e-smoke.sh dist/releases
```

## What it validates

1. Resolves host-compatible binary from release directory.
2. Verifies release artifacts (`SHA256SUMS` + `manifest.json`) before executing binaries.
3. Runs deterministic `--run-smoke` to verify hook dispatch surfaces.
4. If `OPENAI_API_KEY` is set, runs provider-backed `--run` smoke prompt.
5. In non-TTY environments (CI/automation), `--run` auto-switches to quiet mode to avoid spinner `/dev/tty` warnings.

## Expected output

- Script exits `0`.
- Output includes `[smoke] completed`.
- With key configured, provider-backed run is executed; without key, it is explicitly skipped.
- Provider-backed output should include `DH_STAGING_SMOKE_OK`.
