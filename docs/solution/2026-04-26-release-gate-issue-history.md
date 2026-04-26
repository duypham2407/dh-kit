---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: RELEASE-GATE-ISSUE-HISTORY
feature_slug: release-gate-issue-history
source_scope_package: docs/scope/2026-04-26-release-gate-issue-history.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Release Gate Issue History

## Chosen Approach

Filter release-readiness and closeout blocker calculations to count only active unresolved high/critical issue records, while leaving the underlying issue arrays and audit/history output intact. This is enough because the approved scope is a hotfix for false release blockers, not a redesign of issue taxonomy, release approval, or cleanup behavior.

This artifact records the technical gate for an implementation that has already landed in the global kit runtime and passed code review.

## Recommended Path

Use a read-model/blocker-derivation filter that counts only active unresolved high/critical issue records for release readiness and closeout gates, while preserving every issue record in history/audit output. This satisfies the approved scope without deleting artifacts, changing issue taxonomy, or altering release approval semantics.

## Impacted Surfaces

- `/Users/duypham/.config/opencode/kits/openkit/.opencode/lib/workflow-state-controller.js`
  - Release-readiness and closeout/readiness summaries must derive blockers from an active-unresolved predicate instead of treating every historical high/critical issue as blocking.
- `/Users/duypham/.config/opencode/kits/openkit/.opencode/tests/workflow-state-controller.test.js`
  - Regression coverage must prove resolved/closed high/critical history is retained but non-blocking, and active high/critical issues still block.

## Boundaries And Components

- Keep the change inside the workflow-state controller/read-model layer and its tests.
- Do not mutate, delete, compact, or rewrite issue history as part of gate evaluation.
- Do not change issue severity values, status taxonomy, issue creation, release-candidate membership, or approval semantics.
- Preserve local generated artifacts, including raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, and generated local state.

## Interfaces And Data Contracts

- Issue records remain the source of truth for audit history.
- Gate/readiness blocker lists include only high/critical issues whose status represents active unresolved work.
- Resolved, closed, or otherwise non-active issue records remain visible in issue history/audit output but are excluded from readiness blockers.
- Unknown, missing, or unrecognized issue statuses must not be silently treated as closed history; they should remain visible and conservatively block or be reported for follow-up.

## Implementation Approach

- Apply the filtering at blocker derivation time for closeout and release readiness, not at persistence time.
- Use status-aware classification so historical resolved/closed high/critical issues stay in reported issue history but no longer fail `linux-macos-runtime-hardening-rc` readiness.
- Keep open/active high/critical issues release-blocking and visible in gate output.
- Add targeted controller tests for mixed active/history issue sets and history preservation.

## Implementation Slices

### Slice 1: Status-aware blocker derivation

- **Files:** `.opencode/lib/workflow-state-controller.js`
- **Goal:** Release gate and closeout summaries distinguish active unresolved blockers from historical resolved/closed issue records.
- **Validation hook:** `node --test ".opencode/tests/workflow-state-controller.test.js"` from `/Users/duypham/.config/opencode/kits/openkit`.

### Slice 2: Regression coverage for history-sensitive gates

- **Files:** `.opencode/tests/workflow-state-controller.test.js`
- **Goal:** Prove resolved/closed high/critical issues remain auditable but non-blocking, and active high/critical issues still block readiness.
- **Validation hook:** same targeted controller test command above.

## Dependency Graph

- Slices are sequential: blocker derivation contract first, then regression assertions against that contract.
- Critical path: controller blocker classification -> release/closeout read models -> targeted regression tests.
- No parallel execution is needed for this hotfix gate artifact.

## Parallelization Assessment

- `parallel_mode`: `none`
- `why`: The impacted runtime logic and tests share one controller surface; sequential review is safer and sufficient.
- `safe_parallel_zones`: []
- `sequential_constraints`: [`Slice 1 -> Slice 2`]
- `integration_checkpoint`: Confirm release/closeout outputs retain full issue history while blocker lists include only active unresolved high/critical issues.
- `max_active_execution_tracks`: 1

## Validation Plan

- Run targeted runtime regression coverage from the global kit root:
  - `node --test ".opencode/tests/workflow-state-controller.test.js"`
- Where release-state evidence is needed, verify `linux-macos-runtime-hardening-rc` readiness with the workflow-state release gate command after the artifact gate is approved.
- Label evidence as OpenKit `compatibility_runtime` / runtime regression evidence, not target-project app-native build/lint/test evidence.

## Validation Matrix

| Scope Target | Validation Path |
| --- | --- |
| AC-1: resolved/closed severe history does not block readiness | Controller tests with closed/resolved high/critical issue records in release readiness inputs. |
| AC-2: active high/critical issue still blocks | Controller tests with at least one active unresolved high/critical issue. |
| AC-3: issue history is retained | Assertions that issue records remain present in history/audit output after readiness evaluation. |
| AC-4: mixed active/history records are separated | Tests verify active blocker lists differ from retained issue history. |
| AC-5: local artifacts are preserved | Review/QA check: no deletion of raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state. |

## Risks And Trade-offs

- Misclassifying unknown issue statuses as resolved would create an unsafe false pass; keep unknown/missing statuses conservative.
- Filtering at persistence time would destroy audit value; filtering must remain read-model/blocker-only.
- Release readiness could still fail correctly if unrelated active high/critical issues exist; this hotfix should not override genuine blockers.

## Non-Goals

- No issue history cleanup or artifact deletion.
- No severity/status taxonomy redesign.
- No release-candidate membership or approval-process change.
- No broad workflow-state refactor beyond the blocker-filter hotfix.

## Integration Checkpoint

Before QA/closeout, confirm the implementation shows two separate truths: full issue history remains inspectable, and readiness blocker lists contain only active unresolved high/critical issues.

## Rollback Note

If the hotfix causes incorrect readiness behavior, revert only the controller/test changes for `RELEASE-GATE-ISSUE-HISTORY`. Do not roll back by deleting issue records, raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.

## Reviewer Focus Points

- Scope compliance: historical resolved/closed issues are preserved and non-blocking; active high/critical issues still block.
- Safety: no artifact deletion, no issue-history rewrite, and no status/severity model drift.
- Validation: targeted controller regression tests cover resolved/closed-only, active-only, and mixed issue scenarios.
