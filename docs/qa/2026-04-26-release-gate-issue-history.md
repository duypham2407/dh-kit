# QA Report: Release Gate Issue History

## Overall Result

**PASS**

QA validated the `RELEASE-GATE-ISSUE-HISTORY` hotfix for release candidate `linux-macos-runtime-hardening-rc`.

## Scope Verified

- Resolved or closed historical issue records no longer block closeout or release readiness.
- Open high/critical issues still block readiness.
- Malformed-only manual override evidence still blocks stage readiness.
- Older malformed manual override evidence plus a later valid manual override can pass without deleting evidence history.
- Historical evidence and local generated artifacts are preserved.

## Validation Commands

| Command | Exit | Result |
|---|---:|---|
| `semgrep --version` | timeout | Direct rule/security scan unavailable; timed out after 30000 ms with no output. |
| `node --test --test-name-pattern "manual override\\|full_code_review blocks when only structured manual override is malformed" ".opencode/tests/workflow-state-controller.test.js"` | 0 | PASS — 7 tests passed, 0 failed. |
| `node --test ".opencode/tests/workflow-state-controller.test.js"` | 0 | PASS — 133 tests passed, 0 failed. |
| `NODE_OPTIONS=--no-warnings node --test ".opencode/tests/workflow-state-cli.test.js"` | 0 | PASS — 67 tests passed, 0 failed. |
| `node ".opencode/workflow-state.js" validate` | 0 | PASS — workflow state valid. |
| `node ".opencode/workflow-state.js" check-release-gates linux-macos-runtime-hardening-rc` | 0 | PASS for hotfix expectation: no historical resolved issue IDs listed as blockers; remaining blocker was the active hotfix work item itself. |
| `node ".opencode/workflow-state.js" closeout-summary trace-and-impact-completion` | 0 | PASS — ready to close. |
| `node ".opencode/workflow-state.js" closeout-summary rust-hosted-build-evidence` | 0 | PASS — ready to close. |
| `node ".opencode/workflow-state.js" closeout-summary release-gate-issue-history` | 0 | Informational — not ready at the time because the QA report artifact and runtime evidence still needed to be recorded. |

## Acceptance Coverage

| Area | Result |
|---|---|
| Resolved/closed issue history ignored for blockers | PASS |
| Open high/critical issues still block | PASS |
| Malformed-only manual override blocks | PASS |
| Later valid manual override satisfies gate | PASS |
| Evidence history preserved | PASS |
| Local generated artifacts preserved | PASS |

## Findings

### Blocking Findings

None.

### Non-Blocking Observations

- Direct Semgrep/rule/security scan was unavailable due timeout; structured manual override evidence records this limitation.
- Some Node commands emit the known unrelated `MODULE_TYPELESS_PACKAGE_JSON` warning unless run with `NODE_OPTIONS=--no-warnings`; validations still exited successfully.

## Local Artifact Preservation

The hotfix and QA did not delete:

- raw Semgrep JSON;
- `{cwd}/`;
- `.opencode` local runtime state;
- generated local workflow/runtime state.

## Recommendation

Approve `qa_to_done` for `RELEASE-GATE-ISSUE-HISTORY`, then re-run release gates for `linux-macos-runtime-hardening-rc`.
