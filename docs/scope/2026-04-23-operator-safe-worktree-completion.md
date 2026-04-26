---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: OPERATOR-SAFE-WORKTREE-COMPLETION
feature_slug: operator-safe-worktree-completion
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Operator Safe Worktree Completion

OPERATOR-SAFE-WORKTREE-COMPLETION closes the remaining bounded operator-safe program gap by making temp-workspace, snapshot, and report maintenance surfaces first-class and inspectable on current repository reality. The repository already has operator-safe preflight, runtime lifecycle artifacts, debug-dump summaries, and maintenance-oriented helpers; this feature is successful only if list/inspect/prune/cleanup become explicit operator-safe runtime paths for those artifacts, temp-workspace-first semantics remain the default, diagnostics/reporting truth stays separate from workflow-state truth, and scope does not drift into generic git worktree orchestration or broad shell/platform management.

## Goal

- Complete the bounded operator-safe project/worktree program for the current repository reality.
- Make operator-safe artifact hygiene a real runtime capability, not an internal helper or runbook-only expectation.
- Ensure operators can inspect and safely maintain the artifact families already produced by the operator-safe lifecycle:
  - execution reports
  - snapshot manifests
  - temp workspaces
- Preserve the current bounded operator-safe posture:
  - temp-workspace-first
  - report/snapshot/temp rooted in operator-safe runtime storage
  - no generic git worktree platform expansion
  - no workflow-state truth leakage into diagnostics/reporting surfaces

## Target Users

- OpenKit operators and maintainers who run indexing, debug, and maintenance flows and need safe cleanup/hygiene over real operator-safe artifacts.
- Runtime and diagnostics consumers that already surface operator-safe summaries and need a truthful way to inspect the underlying artifact state.
- Solution Lead, Code Reviewer, and QA as downstream owners of a bounded, testable completion contract.

## Problem Statement

- Repository reality already shows a meaningful operator-safe lifecycle exists:
  - bounded preflight and lifecycle execution
  - snapshot artifact creation
  - temp workspace provisioning
  - execution report persistence
  - debug-dump summary integration
  - maintenance-oriented helper code and runbook guidance
- The remaining completion gap is not “invent operator-safe worktree support from scratch.” The remaining gap is that maintenance surfaces are still too internal or too summary-oriented for program closure.
- The authoritative 2026-04-13 operator-safe program solution explicitly says list/inspect/prune/cleanup are mandatory completion work, not deferred polish.
- If DH stops at preflight plus summary reporting, operators still lack a first-class bounded way to:
  - see what operator-safe artifacts currently exist
  - inspect report/snapshot/temp artifacts without manual filesystem digging
  - prune stale artifacts safely by policy
  - perform bounded cleanup after degraded, abandoned, or incomplete runs
- Without this feature, the program remains operationally incomplete and risks:
  - artifact debt under `.dh/runtime/operator-safe-worktree/`
  - drift between internal helper reality and operator-facing maintenance reality
  - confusion between operator-safe report truth and unrelated workflow-state truth
  - scope creep pressure toward ad hoc shell cleanup or broader worktree/platform behaviors

## In Scope

- Make maintenance of current operator-safe artifacts a first-class runtime path for the existing bounded operator-safe layer.
- Cover these artifact families only:
  - `.dh/runtime/operator-safe-worktree/reports/`
  - `.dh/runtime/operator-safe-worktree/snapshots/`
  - `.dh/runtime/operator-safe-worktree/temp/`
- Make the following maintenance capabilities real and inspectable for those artifact families:
  - list inventory
  - inspect artifact details
  - prune stale artifacts by bounded policy
  - cleanup bounded operator-safe residue from degraded, failed, or abandoned runs
- Preserve and expose the relationship between operator-safe lifecycle outputs and maintenance actions so an operator can understand what they are cleaning and why.
- Require that at least one current runtime/operator path exposes real maintenance behavior against live artifacts rather than leaving maintenance available only as internal library functions.
- Allow diagnostics/reporting surfaces to summarize recent operator-safe artifact truth and point to the maintenance path, while keeping those summary surfaces secondary to the underlying artifact truth.
- Preserve temp-workspace-first policy as the default isolation posture for this feature.
- Keep scope bounded to the current operator-safe operation catalog and its produced artifacts; this feature does not implicitly widen the operation catalog.
- Keep runbook/help/docs aligned with live bounded maintenance behavior so reviewers can inspect one truthful story.

## Out of Scope

- Generic git worktree orchestration, wrapper parity, or reopening the accepted no-go default for optional worktree-wrapper behavior.
- Branch lifecycle management, merge/rebase/reset flows, or broad repo/VCS orchestration.
- Arbitrary shell execution, arbitrary filesystem cleanup, or platform-wide temp-directory management outside the operator-safe artifact roots.
- Broad platform maintenance tooling unrelated to the operator-safe lifecycle.
- Using workflow-state, approvals, gates, or release-readiness as the source of truth for operator-safe artifact maintenance.
- Replacing diagnostics/reporting surfaces with workflow-state surfaces, or vice versa.
- Expanding the operator-safe operation catalog beyond current bounded repository reality unless separately scoped.
- Rebuilding the existing preflight/lifecycle foundation except where direct maintenance-path integration is required.

## Main Flows

- **Flow 1 — Operator lists current operator-safe artifacts**
  - An operator uses the approved bounded maintenance path.
  - The system returns current operator-safe report, snapshot, and temp-workspace inventory from the real artifact roots.
  - The inventory distinguishes artifact family and gives enough identity/recency information for follow-up inspection or cleanup.

- **Flow 2 — Operator inspects an individual artifact or recent run residue**
  - An operator selects a report, snapshot, temp workspace, or a bounded recent artifact set.
  - The system returns inspectable metadata explaining what the artifact is, how it relates to the operator-safe lifecycle, and whether cleanup is relevant.
  - The operator does not need to infer this from raw filenames alone.

- **Flow 3 — Operator prunes stale artifacts by policy**
  - Artifacts older than the bounded retention policy exist.
  - The operator runs prune through the approved operator-safe maintenance path.
  - Only eligible operator-safe artifacts inside the allowed roots are removed.
  - The result states what was removed and what was retained/skipped.

- **Flow 4 — Operator performs cleanup after degraded or abandoned operator-safe activity**
  - A dry run, execute path, or debug/maintenance session leaves temp/snapshot/report residue that should be cleaned.
  - The operator uses the bounded cleanup surface.
  - The system removes only the targeted or policy-eligible operator-safe residue, or explicitly reports why cleanup could not fully proceed.

- **Flow 5 — Diagnostics summarize maintenance truth without replacing it**
  - A reviewer or operator uses a current diagnostics/reporting surface such as debug-oriented output.
  - The surface summarizes recent operator-safe outcome and artifact counts or pointers.
  - It does not become the sole maintenance interface and does not claim workflow-state truth.

## Business Rules

### Program-completion rules

- This feature finishes the operator-safe program at the maintenance/hygiene layer; it does not reopen the already-built preflight, snapshot, temp-workspace, or reporting foundations as separate greenfield work.
- Maintenance/list/inspect/prune/cleanup are mandatory completion scope for this feature because the authoritative program contract says they are part of done, not deferred cleanup.
- The feature must operate on real artifacts produced by the current bounded operator-safe lifecycle, not on hypothetical future worktree/platform artifacts.

### Operator / Runtime Truth Rules

- Operator-safe artifact truth comes from the actual report, snapshot, and temp-workspace artifacts under the bounded operator-safe runtime roots.
- Diagnostics and reporting surfaces may summarize, count, or point to operator-safe artifacts, but they do not replace the underlying maintenance truth.
- Diagnostics/reporting truth must remain separate from workflow-state truth:
  - operator-safe reports/artifacts describe bounded runtime execution and hygiene state
  - workflow-state describes stage, approval, issue, and evidence state elsewhere
- This feature must not blur those two truth domains in wording, output, or routing.
- If summary output and underlying artifact state disagree, underlying operator-safe artifact truth wins.

### Boundary and safety rules

- Maintenance actions are limited to operator-safe artifact families only:
  - reports
  - snapshots
  - temp workspaces
- No maintenance action may silently delete, mutate, or manage paths outside the approved operator-safe artifact roots.
- Temp-workspace-first remains the default policy posture. This feature must not introduce a hidden dependency on git worktrees.
- Cleanup eligibility must be explicit. Active, recent, or ineligible artifacts must be retained with an explainable reason instead of being silently removed.
- The feature must preserve the current bounded operator-safe posture for the existing operation catalog; it must not imply that all future repo/worktree actions are now supported.

### Inspectable Acceptance Expectations

- Reviewers must be able to identify at least one current runtime/operator path that supports list, inspect, prune, and cleanup for real operator-safe artifacts.
- Reviewers must be able to inspect report, snapshot, and temp-workspace maintenance behavior separately; counts alone are not enough.
- Inspect output must expose meaningful artifact facts for this phase, such as applicable identity, artifact family, recency, relation to the operator-safe lifecycle, outcome/eligibility clues, and cleanup relevance.
- Prune and cleanup output must be inspectable enough to show what changed, what did not change, and why.
- Docs/runbook/help wording must match the bounded maintenance behavior that actually exists in the runtime.

## Acceptance Criteria Matrix

- **AC1 — Maintenance is first-class, not helper-only:** **Given** reviewers inspect the delivered feature, **when** they trace current operator-safe maintenance behavior, **then** list, inspect, prune, and cleanup exist as a real bounded runtime/operator path for current operator-safe artifacts rather than only internal helper code or runbook prose.
- **AC2 — Artifact inventory is truthful:** **Given** report, snapshot, or temp-workspace artifacts exist under the operator-safe artifact roots, **when** an operator lists current artifacts, **then** the response reflects the real inventory by artifact family and provides enough identity/recency information to drive inspection or cleanup.
- **AC3 — Empty or missing inventory is explicit:** **Given** an operator-safe artifact family is empty or absent, **when** list or inspect is requested, **then** the response explicitly reports that no matching artifact exists and does not fabricate a successful artifact result.
- **AC4 — Report inspection is meaningful:** **Given** an operator inspects a stored operator-safe report artifact, **when** the inspection result is returned, **then** it exposes the bounded execution facts needed for operator maintenance in this phase, including operation/mode, outcome, failure class or equivalent status, recommended next action when available, and related artifact pointers when present.
- **AC5 — Snapshot and temp inspection are meaningful:** **Given** an operator inspects a snapshot or temp-workspace artifact, **when** the inspection result is returned, **then** it exposes enough metadata to understand what the artifact is, when it was created or last touched, how it relates to the bounded operator-safe lifecycle, and whether cleanup is relevant.
- **AC6 — Policy prune stays bounded:** **Given** stale operator-safe artifacts older than the approved policy threshold exist, **when** prune runs, **then** only policy-eligible artifacts inside the approved operator-safe roots are removed, and the result reports removed versus retained/skipped artifacts by family or count.
- **AC7 — Cleanup handles degraded or abandoned residue:** **Given** a degraded, failed, or abandoned bounded operator-safe run leaves residue, **when** the operator invokes cleanup through the approved path, **then** the system removes only the targeted or eligible operator-safe residue or explicitly reports why a residue item was retained.
- **AC8 — Ineligible artifacts are not silently deleted:** **Given** an artifact is active, too recent, missing required cleanup eligibility, or otherwise not removable, **when** prune or cleanup runs, **then** that artifact is retained and surfaced as skipped/retained with a reason rather than silently deleted.
- **AC9 — Diagnostics stay in their lane:** **Given** a diagnostics/reporting surface summarizes operator-safe maintenance state, **when** a reviewer compares that summary with the detailed maintenance path, **then** the diagnostics surface summarizes operator-safe report/artifact truth without claiming workflow-stage, approval, or workflow-state truth.
- **AC10 — Temp-workspace-first posture is preserved:** **Given** the delivered feature is reviewed for scope boundaries, **when** reviewers inspect the maintenance model, **then** it remains centered on temp workspaces, snapshots, and reports and does not require or imply generic git worktree orchestration.
- **AC11 — Scope does not broaden into shell/platform maintenance:** **Given** reviewers inspect cleanup and prune behavior, **when** they compare it against this scope package, **then** the delivered behavior remains bounded to operator-safe artifact maintenance and does not become arbitrary shell cleanup or broad filesystem/platform management.
- **AC12 — Current operation catalog stays bounded:** **Given** the delivered maintenance surfaces are reviewed, **when** current operator-safe capability boundaries are inspected, **then** the feature does not imply support for a broader operator-safe operation catalog than current repository reality already supports.
- **AC13 — Docs and runtime tell the same maintenance story:** **Given** runbook/help/docs and live maintenance behavior are compared after delivery, **when** reviewers inspect the feature, **then** they describe the same bounded operator-safe maintenance contract and do not over-claim broader worktree/platform behavior.

## Edge Cases

### Key Risks

- **Scope creep into platform management:** maintenance could drift from operator-safe artifacts into generic repo, shell, or worktree management unless bounded roots remain explicit.
- **Truth drift across surfaces:** debug-dump summaries, maintenance output, helper behavior, and docs can diverge unless one artifact-truth story is preserved.
- **Unsafe cleanup:** prune/cleanup logic can become too aggressive and remove recent or still-relevant temp/snapshot/report artifacts.
- **Internal-only completion:** the feature can appear “done” because helper functions exist while operators still lack a real inspectable maintenance path.

### Edge Cases

- Fresh repository or freshly cleaned repository with zero operator-safe artifacts.
- Report exists but referenced snapshot or temp workspace was already removed manually.
- Snapshot or report artifact is partially written, corrupt, or unreadable.
- Temp workspace path exists in inventory metadata but the filesystem directory is already gone.
- Multiple dry-run or diagnostics sessions create many artifacts quickly, requiring bounded inventory output and clear recency cues.
- Stale temp workspaces and recent temp workspaces coexist; only eligible stale artifacts should be removable.
- Degraded or rollback-limited runs leave residue across more than one artifact family.
- Repeated cleanup attempts encounter already-removed artifacts and must report that honestly.
- Repositories without `.git` can still have operator-safe artifact residue because this feature is bounded to operator-safe runtime artifacts, not VCS status.

## Error And Failure Cases

- The feature fails if list/prune helpers exist in code but there is still no first-class inspectable runtime/operator path for list, inspect, prune, and cleanup.
- The feature fails if maintenance actions can affect paths outside `.dh/runtime/operator-safe-worktree/`.
- The feature fails if diagnostics/reporting surfaces imply workflow-state, approval, or release truth while summarizing operator-safe artifact state.
- The feature fails if report, snapshot, and temp artifacts cannot be inspected meaningfully enough for an operator to understand cleanup relevance.
- The feature fails if prune/cleanup only report success counts and hide skipped/retained or failure conditions that matter for safe maintenance.
- The feature fails if the delivered scope reopens optional worktree-wrapper/platform behavior or broad shell/platform maintenance.
- The feature fails if docs/runbook/help describe inspect or cleanup capabilities that are not actually available on the delivered runtime path.

## Open Questions

- No blocking product ambiguity remains before Solution Lead planning.
- Solution Lead must choose the smallest truthful first-class runtime/operator entry surface for list/inspect/prune/cleanup while preserving current repository ergonomics.
- Solution Lead must decide the minimum first-wave cleanup granularity that still satisfies this scope:
  - policy-based stale prune only is not sufficient on its own
  - there must also be a bounded cleanup path for degraded, failed, or abandoned operator-safe residue
- Solution Lead must decide how inventory/inspection output stays bounded and readable when artifact volume is high, without weakening inspectability.

## Success Signal

- The repository can truthfully say the operator-safe project/worktree program is complete at the maintenance/hygiene layer for current bounded repository reality.
- Operators can list, inspect, prune, and clean operator-safe report/snapshot/temp artifacts without resorting to ad hoc filesystem digging or broad shell cleanup.
- Debug and diagnostics surfaces can summarize operator-safe artifact truth and point to maintenance behavior without pretending to be workflow-state surfaces.
- Temp-workspace-first and bounded operator-safe semantics remain intact.
- The delivered feature closes maintenance as a required completion surface without broadening DH into a generic git worktree or platform-management layer.

## Handoff Notes For Solution Lead

- Start from repository reality, not historical absence:
  - operator-safe lifecycle artifacts already exist
  - debug-dump already summarizes operator-safe report/artifact counts
  - maintenance-oriented helper code and runbook guidance already exist
  - the remaining feature is to make maintenance completion first-class and inspectable
- Preserve these hard boundaries:
  - bounded operator-safe project/worktree completion only
  - temp-workspace-first default
  - no generic git worktree wrapper/platform expansion
  - no broad shell or arbitrary filesystem management
  - no workflow-state truth leakage into diagnostics/reporting truth
- Treat these as primary acceptance hotspots:
  - real runtime/operator path for list/inspect/prune/cleanup
  - meaningful inspection of report, snapshot, and temp artifacts
  - safe stale-prune behavior and bounded degraded-run cleanup
  - retained/skipped reasoning for non-removable artifacts
  - docs/runbook/runtime alignment
- Do not design this as a brand-new operator-safe lifecycle. Design it as completion of the existing lifecycle with maintenance surfaces that operators and reviewers can actually inspect.
- The solution package must explicitly preserve current bounded catalog reality and must not imply new operator-safe operations beyond the current supported scope unless separately approved.
