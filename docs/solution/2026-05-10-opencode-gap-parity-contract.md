# OpenCode Gap Parity Contract Solution

Date: 2026-05-10

## Approach

The first parity contract is deterministic and static. It does not probe OpenCode or infer runtime support from naming. Runtime discovery can replace parts of the matrix only after Rust owns the related lifecycle paths.

## Files

- `packages/shared/src/types/parity.ts` defines contract types.
- `packages/runtime/src/diagnostics/parity-report.ts` builds the report.
- `packages/runtime/src/diagnostics/parity-report.test.ts` verifies report truthfulness.
- `packages/runtime/src/diagnostics/doctor.ts` exposes the report.
- `packages/runtime/src/diagnostics/doctor.test.ts` and `apps/cli/src/commands/doctor.test.ts` verify runtime and CLI JSON payloads.

## JSON Shape

`dh doctor --json` exposes:

```json
{
  "diagnostics": {
    "parity": {
      "source": "opencode-gap-roadmap",
      "summary": {
        "recommendedNextMilestone": "Milestone 1: Rust Runtime Authority For All Command Paths"
      }
    }
  },
  "snapshot": {
    "parity": {
      "source": "opencode-gap-roadmap"
    }
  }
}
```

## Risk Control

- The report lists missing OpenCode command surfaces explicitly.
- Supported DH knowledge commands are not mixed into OpenCode missing command lists.
- Doctor text says the parity contract is conservative and bounded.
- Tests fail if missing OpenCode command surfaces disappear without implementation updates.
