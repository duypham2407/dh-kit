---
artifact_type: scope_package
version: 1
status: product-lead-ready
feature_id: RELEASE-GATE-ISSUE-HISTORY
feature_slug: release-gate-issue-history
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Release Gate Issue History

## Goal

Preserve issue audit history while ensuring release readiness for `linux-macos-runtime-hardening-rc` blocks only on active unresolved issues.

## Target Users

- Release owners validating the `linux-macos-runtime-hardening-rc` release candidate.
- Maintainers using workflow issue history to audit prior blockers, fixes, reviews, and closure decisions.

## Problem

The release candidate gate false-blocks because resolved or closed historical issue records are counted as unresolved severe blockers. This prevents a release candidate from passing readiness even after severe issues have been addressed, while also creating pressure to delete issue history that should remain available for audit.

## In Scope

- Release readiness severe-blocker checks count only active unresolved issue records as blockers.
- Resolved, closed, or otherwise non-active issue records remain visible in issue history and audit outputs.
- Historical severe issue records do not block release readiness after their status indicates they are resolved or closed.
- Gate output continues to make active severe blockers visible when they exist.
- Existing local evidence and generated runtime artifacts remain preserved during the hotfix and release-gate cleanup.

## Out of Scope

- Deleting or rewriting historical issue records to make release gates pass.
- Changing the severity model, issue taxonomy, or issue creation workflow.
- Reclassifying already-recorded issue history beyond respecting each record's current status.
- Adding a new release approval process or changing release candidate membership.
- Removing local scan output, workflow state, generated state, or operator evidence artifacts.

## Release Candidate Relation

- Release candidate: `linux-macos-runtime-hardening-rc`.
- Hotfix work item: `RELEASE-GATE-ISSUE-HISTORY`.
- The release candidate should be able to pass issue-history-sensitive gates when all severe blockers are resolved or closed and no active unresolved severe blockers remain.
- The release candidate must still fail readiness if any active unresolved severe blocker remains attached to the candidate or its included work items.

## Business Rules

- Issue history is an audit record and must not be deleted as a gate-clearing mechanism.
- A severe issue blocks release readiness only when its status represents active unresolved work.
- Resolved or closed severe issues remain reportable for audit but are not readiness blockers.
- Gate reporting should distinguish active blockers from historical resolved or closed issue records.

## Acceptance Criteria Matrix

| ID | Scenario | Expected Result |
| --- | --- | --- |
| AC-1 | `linux-macos-runtime-hardening-rc` has only resolved or closed severe historical issues. | Release gates do not block readiness on those historical issues. |
| AC-2 | `linux-macos-runtime-hardening-rc` has at least one active unresolved severe issue. | Release readiness remains blocked and reports the active blocker. |
| AC-3 | A severe issue record is resolved or closed. | Issue history and audit output retain the record, status, and evidence references. |
| AC-4 | Historical and active issue records both exist. | Gate output treats active unresolved blockers separately from resolved or closed history. |
| AC-5 | Hotfix artifacts are inspected. | Raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, and generated local state remain preserved. |

## Edge Cases

- If an issue has an unknown, missing, or unrecognized status, it must not be silently treated as closed history; it should remain visible for follow-up or conservative blocking until classified.
- If an issue changes from resolved or closed back to an active unresolved status, it becomes release-blocking again.
- If no issue records exist for the release candidate, readiness should not be blocked by issue history alone.

## Error And Failure Cases

- Gate evaluation must fail or report clearly if issue status data cannot be read, instead of passing by ignoring issue records.
- Gate evaluation must not require deletion of historical issue records or local generated artifacts to recover from false blocking.

## User And Local Artifact Preservation Rule

- Do not delete raw Semgrep JSON.
- Do not delete `{cwd}`.
- Do not delete `.opencode` local runtime state.
- Do not delete generated local state.
- If cleanup is required later, it must be separately requested and scoped; this hotfix scope preserves local audit, scan, and runtime artifacts.

## Open Questions

- None for this scope package; implementation and review are already complete, and this artifact records the product boundary needed for release-gate closure.

## Success Signal

- `linux-macos-runtime-hardening-rc` readiness is no longer false-blocked by resolved or closed severe issue history, while active unresolved severe blockers still prevent release approval.

## Handoff Notes For Solution Lead

- Preserve the distinction between audit history and active blocker state.
- Do not design a fix that clears gates by deleting issue records or local generated artifacts.
- Keep validation focused on release gate behavior for `linux-macos-runtime-hardening-rc` and issue-history preservation.
