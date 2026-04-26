---
artifact_type: scope_package
version: 1
status: ready
feature_id: WORKSPACE-SEGMENTATION-CONSUMER-ALIGNMENT
feature_slug: workspace-segmentation-consumer-alignment
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Workspace Segmentation Consumer Alignment

## Goal

Harden DH consumers of marker-driven workspace segmentation so indexing, graph extraction, retrieval, diagnostics, and operator-safe runtime surfaces consistently honor detected workspace boundaries instead of falling back to single-root or repo-root path assumptions.

## Target Users

- Operators using DH/OpenKit indexing, retrieval, diagnostics, and graph tools against repositories with multiple detected workspace roots.
- Implementation, review, and QA agents relying on indexed graph/retrieval evidence for workspace-local code navigation and impact analysis.
- Maintainers extending marker-driven segmentation without accidentally reopening generic worktree or project lifecycle subsystem parity.

## Problem Statement

Marker-driven multi-workspace segmentation has already established that the remaining gap is boundary selection and segmented-consumer alignment, not worktree/project lifecycle parity. Recent runtime work now carries `workspaceRoot` through indexing, graph, retrieval, and operator-safe surfaces, and alias support already uses workspace-root boundaries. The next product requirement is to make every affected consumer preserve those boundaries end-to-end so file reads, graph edges, retrieval chunks, diagnostics, summaries, and operator-safe outputs describe the detected workspace layout truthfully.

## In Scope

- Align indexing consumers so every file read or file identity decision for an `IndexedFile` uses that file's `workspaceRoot` plus its workspace-relative `path`, not an implicit `repoRoot + file.path` rule.
- Align graph extraction and symbol/call/import extraction consumers so segmented workspaces index and query correctly when files live under child workspace roots.
- Align semantic retrieval and chunking consumers so retrieved content, chunk metadata, reduced-coverage reporting, and path display stay anchored to the detected workspace boundary.
- Align diagnostics and runtime/index-job summaries so partial scans, stop reasons, workspace counts, and coverage status are reported per detected workspace where that distinction affects operator understanding.
- Align operator-safe project/worktree utility surfaces only where they consume or display workspace segmentation outputs, especially boundary checks and safe path presentation.
- Preserve the already-approved marker-driven segmentation contract: `IndexedFile.path` remains workspace-relative and `workspaceRoot` is the authority for absolute path resolution.
- Preserve existing single-root behavior for repositories where segmentation emits one workspace.
- Add or update focused tests/fixtures proving segmented consumer behavior across indexing, graph, retrieval, diagnostics, and operator-safe boundary output.
- Keep documentation, runtime messages, and acceptance evidence explicit that this is consumer alignment for segmentation, not a lifecycle subsystem redesign.

## Out of Scope

- Generic worktree lifecycle parity with upstream or any project/worktree subsystem redesign.
- Shell orchestration, checkout commands, worktree creation/removal/reset flows, or git-aware lifecycle management.
- Replacing marker-driven segmentation with manifest-driven, user-configured, or project-service-driven workspace selection.
- Broad graph schema redesign, retrieval-strategy redesign, planner rewrite, or new workspace state machine beyond what segmented consumption requires.
- Changing the marker set, nested-root selection policy, scan budgets, or fallback semantics except where a narrow consumer test exposes a direct inconsistency with the approved segmentation contract.
- Treating `workspaceRoot` as optional for segmented consumers or flattening segmented files back into repo-root-relative identity.
- Cross-platform shell/path support beyond the repository's current supported runtime path expectations.

## Main Flows

- As an operator, I want indexed files from child workspaces to be read from their detected workspace roots so that graph and retrieval results match the actual files indexed.
- As an implementation agent, I want dependency, symbol, call, and retrieval evidence to preserve workspace boundaries so that impact analysis does not mix files from sibling workspaces.
- As a maintainer, I want diagnostics and operator-safe summaries to show segmentation coverage truthfully so that partial workspace failures are not misreported as whole-repo success or failure.

## Business Rules

1. `workspaceRoot` is the boundary authority for segmented file consumers.
2. `IndexedFile.path` remains relative to its owning workspace root; it must not be reinterpreted as repo-root-relative in consumer code.
3. Absolute file resolution for indexed files must be derived from `(workspaceRoot, file.path)` through a shared or otherwise consistent boundary-safe path contract.
4. A resolved file path must remain inside the owning `workspaceRoot`; unsafe traversal or out-of-boundary targets must be rejected or reported, not read silently.
5. Single-root repositories must keep their current observable behavior unless a change is necessary to expose the same truth rules more explicitly.
6. Multi-workspace consumers must not emit duplicate, overlapping, or boundary-flattened output that hides which workspace owns a file.
7. Partial scan safety remains workspace-aware: one partial workspace must not authorize unsafe graph deletes for that workspace, and summaries must not imply unaffected workspaces failed if they did not.
8. Retrieval reduced-coverage signals must remain visible and must reflect segmented workspace coverage rather than a misleading flat repo-level state.
9. Operator-safe surfaces may display or validate segmentation boundaries, but must not add shell orchestration or lifecycle operations under this scope.
10. Any new metadata or reporting fields must be additive and truthful; unsupported or deferred lifecycle behavior must be named as out of scope rather than implied.

## Truth Rules

- The prior solution package `docs/solution/2026-04-11-marker-driven-multi-workspace-segmentation-dh.md` is the product/solution baseline for this follow-on: the missing work is boundary selection and segmented-consumer alignment.
- Current repository reality says `workspaceRoot` is already present in indexing/graph/retrieval/operator-safe surfaces; this scope assumes consumer hardening should use that existing boundary signal rather than invent a new subsystem.
- Recent alias support using `workspaceRoot` boundaries is precedent for safe boundary enforcement, not an invitation to broaden alias or module-resolution scope.
- Runtime and docs must avoid claiming project/worktree lifecycle parity, shell orchestration, or broad subsystem redesign.
- If implementation discovers a consumer that cannot safely use `workspaceRoot`, that is a Solution Lead open issue; it must not be solved by flattening boundaries back to repo root without explicit approval.

## Acceptance Criteria Matrix

| ID | Acceptance Criterion | Inspectable Expectation |
| --- | --- | --- |
| AC-1 | Given a segmented fixture with at least two detected workspace roots, when indexing reads files for graph extraction, then each file is read from its owning `workspaceRoot` plus workspace-relative `path`. | Focused tests or integration evidence fail if any affected consumer reads via `repoRoot + file.path` for child workspace files. |
| AC-2 | Given graph import/call/symbol extraction runs against child workspace files, when graph data is indexed, then local relationships are recorded without crossing sibling workspace boundaries by path accident. | Graph/indexer tests assert expected edges/symbols/calls for child workspaces and no fabricated sibling-boundary matches. |
| AC-3 | Given semantic chunking/retrieval consumes segmented indexed files, when retrieval returns results, then content and metadata correspond to the file under its owning workspace root. | Retrieval/chunker tests assert child workspace content is read correctly and path/workspace metadata remains distinguishable. |
| AC-4 | Given one workspace in a multi-workspace scan is partial or stopped by budget/guardrail, when diagnostics and index-job summaries are produced, then the partial state is visible at workspace granularity and does not imply all workspaces failed. | Runtime/diagnostic tests or snapshots show workspace count, affected workspace, and reduced coverage/stop reason truthfully. |
| AC-5 | Given a partial segmented scan, when graph deletion or stale-data handling runs, then delete safety remains conservative for affected workspace data. | Graph-indexer tests verify partial workspace state prevents unsafe deletes or stale cleanup for impacted data. |
| AC-6 | Given a single-root repository, when the aligned consumers run, then current graph, retrieval, diagnostics, and operator-safe behavior remains compatible. | Existing single-root tests pass or focused regression tests assert unchanged output except additive truthful metadata. |
| AC-7 | Given a file path attempts to escape its owning `workspaceRoot`, when a consumer resolves it, then the consumer rejects/reports the boundary violation instead of reading outside the workspace. | Boundary tests assert no out-of-workspace read and a visible error/degraded reason. |
| AC-8 | Given operator-safe surfaces display or validate workspace data, when segmentation output contains child workspaces, then the surface presents workspace-root-aware paths/boundaries without offering lifecycle or shell orchestration operations. | Operator-safe tests/snapshots verify boundary-aware output and no new lifecycle commands/claims. |
| AC-9 | Given docs, runtime messages, or summaries mention this work, when reviewed, then they describe segmented-consumer alignment and explicitly avoid worktree/project lifecycle parity claims. | Manual review or snapshot assertions verify wording and out-of-scope boundaries. |
| AC-10 | Given implementation is complete, when repository validation runs, then the Solution Lead-defined validation commands pass or any missing/unavailable command is reported with reason. | Handoff evidence includes concrete command outcomes from the DH repo's actual validation tooling. |

## Edge Cases

- Child workspace file has the same workspace-relative path as a file in another workspace.
- Nested workspace roots already selected by marker segmentation produce child workspace paths that would be wrong if joined against repo root.
- Workspace root contains symlinks, `..` segments, or normalized path variants that could escape or confuse boundary checks.
- One workspace is fully indexed while another is partial due to file count, depth, file size, ignore, or stop-reason guardrails.
- Retrieval returns results from multiple workspaces with similar filenames or symbols.
- Alias-resolved imports and segmented file reads both depend on `workspaceRoot`; the two behaviors must not disagree about boundary ownership.
- Existing callers that only have single-root data must continue working without requiring new non-additive fields.

## Error And Failure Cases

- Missing `workspaceRoot` on a consumer input that requires segmented file resolution: fail loudly or report degraded input rather than guessing repo root for segmented data.
- Unreadable file under a valid workspace root: report read failure for that workspace/file without collapsing all workspace summaries into a generic repo failure.
- Boundary violation while resolving a file path: reject the read and surface the boundary reason.
- Duplicate or conflicting file identities across workspaces: preserve workspace ownership in output rather than deduplicating by workspace-relative path alone.
- Partial scan or stopped workspace: keep reduced-coverage and delete-safety signals active for affected workspace data.
- Unsupported lifecycle request discovered during implementation: record as out of scope and route to future product definition instead of adding lifecycle behavior.

## Risks / Edge Cases

- Hidden single-root assumptions may remain in less obvious consumers; Solution Lead should require a targeted search/review strategy for file resolution patterns.
- Graph, retrieval, and diagnostics may each represent paths differently; inconsistent normalization could create false missing-file or duplicate-file results.
- Overcorrecting all path display to absolute paths could reduce operator readability; output should stay truthful while preserving current display contracts where possible.
- The operator-safe worktree/project surfaces are adjacent to out-of-scope lifecycle functionality, so implementation must avoid adding command orchestration while fixing boundary display/validation.
- If tests only cover segmentation emission and not downstream reading, the core regression can remain hidden; acceptance requires consumer-level proof.

## Acceptance Expectations

- Acceptance evidence must include at least one segmented fixture or equivalent test setup where a child workspace file would fail under `repoRoot + file.path` but passes when resolved through `workspaceRoot`.
- Evidence must cover indexing/graph, retrieval/chunking, diagnostics/runtime summary, and operator-safe boundary surfaces or explicitly justify any surface found unaffected.
- Review must inspect for remaining single-root assumptions in file-reading consumers, especially any direct join of repo root with indexed file path.
- Validation should use the DH repo's actual available commands as identified by Solution Lead; do not invent commands in the scope package.
- Documentation or runtime wording changed by this work must preserve the explicit out-of-scope boundary around lifecycle parity and shell orchestration.

## Open Questions

- Which concrete consumer files still contain single-root path assumptions after recent `workspaceRoot` propagation and alias-boundary work?
- What is the canonical display format for operator-safe paths: absolute path, workspace-relative path plus workspace root, or existing display plus additive workspace metadata?
- Should missing `workspaceRoot` on legacy indexed data be treated as single-root fallback only when exactly one workspace is present, or always as degraded data requiring reindex?

## Success Signal

- A segmented repository can be indexed, queried, retrieved, diagnosed, and displayed through operator-safe surfaces with file reads and coverage reports anchored to detected workspace roots.
- Single-root repositories remain compatible, and no new lifecycle/project/worktree subsystem behavior is introduced or claimed.

## Handoff Notes For Solution Lead

- Preserve the existing segmentation truth: `workspaceRoot` is the boundary authority and `IndexedFile.path` is workspace-relative.
- Start solution design by inventorying current consumers that read indexed files or display indexed paths; prioritize indexing/graph, retrieval/chunking, diagnostics/runtime summaries, and operator-safe surfaces.
- Plan validation around consumer-level failures, not just segmentation emission.
- Keep lifecycle parity, shell orchestration, and broad subsystem redesign out of the solution package unless routed as a separate product scope.
- Resolve the open question on legacy/missing `workspaceRoot` behavior before implementation if current data paths can encounter it.
