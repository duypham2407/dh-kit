# Scope Package: Marker-Driven Multi-Workspace Segmentation (DH)

Date: 2026-04-11
Owner: DH intelligence/runtime team
Execution driver:
- `docs/opencode/marker-driven-multi-workspace-segmentation-analysis-dh.md`

---

DH has already completed project/workspace scan hardening, including scan guardrails, diagnostics, and stronger path handling, but `detect-projects` still intentionally preserves single-root behavior and returns the repository as one workspace. This follow-on scope is limited to a narrow next step: enable marker-driven multi-workspace segmentation so DH can emit multiple workspace boundaries when valid markers are present, while preserving backward-compatible fallback to the current single-root model and avoiding any expansion into full project/worktree parity.

## Problem Statement

- DH indexing and retrieval now operate on a hardened scan layer, but the scan output still collapses the repository into one workspace.
- In repositories with multiple package or module boundaries, single-root output creates practical issues:
  - workspace boundaries are less accurate,
  - indexing and retrieval can include extra cross-package noise,
  - diagnostics are harder to interpret at a package/module level,
  - future per-workspace policy refinement remains blocked.
- The problem to solve here is **boundary segmentation only**: identify valid workspace roots from markers and return segmented workspace output without changing DH into a full project/worktree management system.

## Current State vs Target State

| Dimension | Current state in DH | Target state for this scope |
|---|---|---|
| Scan hardening | Already completed | Remains the foundation; no re-opening of scan hardening scope |
| Workspace discovery | `detect-projects` detects marker signals but still returns one workspace rooted at `repoRoot` | `detect-projects` can return multiple workspaces when valid marker roots are discovered |
| Segmentation behavior | Single-root behavior is preserved in all cases | Marker-driven segmentation occurs only when valid, non-duplicate workspace roots are found |
| Fallback behavior | Single-root output is the only mode | Single-root output remains the fallback when no valid segmentation applies |
| Boundary rules | No active multi-workspace root selection policy | Root selection and de-duplication rules are explicit and bounded |
| Downstream meaning | Consumers mostly see one flat workspace | Consumers can receive segmented workspace output without requiring full subsystem redesign |
| Scope ambition | Hardened single-root scan | Narrow marker-driven segmentation only; still not full project/worktree parity |

## In Scope

1. **Marker-driven workspace root discovery**
   - Discover candidate workspace roots from valid directory-level markers such as `package.json` and `go.mod`.
   - Reuse current scan guardrails, diagnostics, and canonical path handling.

2. **Workspace root finalization rules**
   - Canonicalize candidate roots.
   - Remove duplicates.
   - Apply an explicit nested-root policy for milestone-1 segmentation so DH does not emit overlapping or contradictory workspace roots.
   - Ensure every emitted workspace root remains within `repoRoot`.

3. **Segmented `IndexedWorkspace` output**
   - Return multiple `IndexedWorkspace` entries when valid marker roots are discovered.
   - Preserve current type compatibility through additive or optional metadata only where needed.

4. **Backward-compatible fallback**
   - Preserve the current single-root workspace behavior when no valid marker segmentation is available.
   - Preserve compatibility for existing callers that currently assume a single-root baseline.

5. **Minimal downstream alignment for segmented coverage**
   - Ensure downstream consumers can interpret multiple workspaces and workspace-level diagnostics/coverage summaries.
   - Keep this limited to safe consumption of segmented output, not broader planner or lifecycle redesign.

## Out of Scope

- Reworking or extending the already-completed scan hardening effort beyond what segmentation directly requires.
- Porting or introducing a full `Project` / `Worktree` / lifecycle subsystem.
- Worktree lifecycle actions such as create, remove, reset, or checkout management.
- Full parity with upstream project/workspace management models.
- Deep git-aware orchestration or a new workspace state machine.
- Complex per-workspace budget or policy tuning in this milestone.
- Broad retrieval, graph, or runtime redesign unrelated to consuming segmented workspace output.

## Business Rules and Scope Boundaries

1. **Scan hardening is complete** — this task builds on the hardened scan contract and does not reframe that effort as still in progress.
2. **Marker-driven only** — segmentation is triggered by valid markers, not by arbitrary directory heuristics or full manifest-driven configuration.
3. **Single-root fallback is mandatory** — if valid segmentation is not available, DH must keep the current single-root behavior.
4. **Boundary correctness over feature breadth** — the priority is correct workspace root selection, not rich workspace management features.
5. **No subsystem parity expansion** — any change that turns this task into full project/worktree parity is outside scope.
6. **Compatibility matters** — segmented output must be introduced in a way that does not unnecessarily break current downstream consumers.

## Acceptance Criteria

| # | Acceptance criterion | Observable completion signal |
|---|---|---|
| AC-1 | DH can discover candidate workspace roots from supported markers under existing scan guardrails | Marker files such as `package.json` or `go.mod` can produce candidate workspace roots without bypassing current scan budgets and path rules |
| AC-2 | DH applies explicit canonicalization and de-duplication before emitting segmented workspaces | Duplicate or path-equivalent roots are not emitted as separate workspaces |
| AC-3 | DH applies an explicit milestone-1 nested-root policy so emitted workspaces are not overlapping in an undefined way | A repository containing nested markers does not produce ambiguous or contradictory workspace output |
| AC-4 | When valid marker roots exist, `detect-projects` can return multiple `IndexedWorkspace` results instead of always collapsing to `repoRoot` | A multi-marker repository yields multiple workspace entries that remain within the repository root |
| AC-5 | When valid marker segmentation does not apply, DH preserves the current single-root behavior | A repository without qualifying segmented roots still returns one workspace rooted at `repoRoot` |
| AC-6 | Segmented workspace output remains backward-compatible enough for current DH consumers to process it without a full subsystem rewrite | Required type or metadata changes are additive or optional, and existing consumers can be aligned without wholesale architecture changes |
| AC-7 | Workspace-level diagnostics or coverage summaries can distinguish per-workspace status instead of reporting only one flat repo-level view | Downstream summaries can identify which workspace is partial or complete when segmented output is present |
| AC-8 | Delivered work stays limited to narrow marker-driven segmentation and does not introduce project/worktree lifecycle parity | No implementation in this task adds worktree lifecycle management, broad git orchestration, or full upstream project subsystem behavior |

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Nested marker ambiguity | Parent and child markers can create duplicate indexing or unclear workspace selection | Define one explicit milestone-1 nested-root policy before implementation |
| Path identity drift | Segmentation can create inconsistent file/workspace identity if path semantics diverge across consumers | Reuse the hardened canonical path rules and align consumers to the same expectation |
| Extra scan or collection cost | Multi-root collection can increase traversal or repeated work | Reuse discovery results where practical and keep the milestone policy narrow |
| Downstream misinterpretation of partial coverage | Partial status in one workspace could be misread as whole-repo failure or success | Require workspace-level diagnostics and summaries |
| Scope creep into full workspace management | The task could expand into project/worktree parity and lose its narrow follow-on character | Review all solution slices against the out-of-scope list before approval |

### Assumptions

1. `docs/opencode/marker-driven-multi-workspace-segmentation-analysis-dh.md` is the authoritative analysis input for this scope.
2. Scan hardening is already complete and is the baseline this task must build on.
3. `detect-projects` currently preserves single-root behavior even though marker signals already exist.
4. The first delivery milestone should stay marker-driven and narrow rather than pursuing full project/worktree parity.

## Execution Sequencing Expectations

### Required sequence
1. **Phase 0 — Contract confirmation**
   - Confirm the current hardened scan contract, current `detect-projects` single-root behavior, and the downstream callers that consume workspace output.
   - Define the supported marker set and the milestone-1 nested-root / de-duplication policy.

2. **Phase 1 — Marker root discovery and root finalization**
   - Add candidate root discovery using existing scan guardrails.
   - Finalize roots through canonicalization, in-repo validation, duplicate removal, and nested-root policy.

3. **Phase 2 — Segmented workspace emission with fallback**
   - Emit multiple `IndexedWorkspace` results when valid roots exist.
   - Preserve the current single-root fallback when segmentation does not apply.

4. **Phase 3 — Minimal downstream alignment and diagnostics clarity**
   - Align downstream consumers to process segmented workspaces and workspace-level coverage/partial-scan summaries.
   - Keep changes limited to correct consumption and reporting of segmented output.

### Hard sequencing rules
- Do not reopen the earlier scan-hardening task as part of this follow-on.
- Do not start with consumer redesign before the root discovery and root finalization rules are defined.
- Do not require full project/worktree parity to deliver this milestone.
- Do not mark the task complete unless both segmented-output behavior and single-root fallback behavior are explicit and verifiable.

## Handoff Notes for Solution Lead

- Preserve DH reality: scan hardening is already done, and this follow-on starts from that hardened baseline.
- Keep the solution narrowly centered on marker-driven segmentation in `detect-projects` plus minimal downstream alignment.
- Treat nested-root policy, de-duplication, fallback behavior, and workspace-level diagnostics as the main acceptance hotspots.
- Reject any solution direction that expands into full project/worktree subsystem parity unless separately approved.
