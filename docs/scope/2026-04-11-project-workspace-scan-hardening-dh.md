# Scope Package: Project / Workspace Scan Hardening (DH)

Date: 2026-04-11
Owner: DH intelligence/runtime team
Execution driver:
- `docs/opencode/project-workspace-scan-hardening-selective-port-mapping-dh.md`

---

DH already depends on `detect-projects.ts` as the intake path for indexing, retrieval, and index-job execution, but the current project/workspace scan layer is still thin: recursive scan behavior is minimally guarded, workspace typing is logically weak, diagnostics are limited, and path handling is not yet hardened as a shared invariant. This scope defines the next selective-port task as **project/workspace scan hardening only**: improve scan correctness, safety guardrails, diagnostics, and downstream handling of partial coverage in DH without expanding into full upstream project/worktree/platform parity or unrelated shell/plugin work.

## Problem Statement

- DH currently treats `packages/intelligence/src/workspace/detect-projects.ts` as a single choke point for:
  - graph indexing,
  - retrieval input discovery,
  - index job execution.
- The current scan layer is thin in ways that create concrete reliability risk:
  - no clear scan budget or stop controls,
  - no explicit symlink policy,
  - workspace type detection depends on filtered files and can misclassify real workspaces,
  - limited visibility into why files or directories were skipped,
  - all content is effectively grouped into one workspace root,
  - path normalization/canonicalization is not a clearly enforced shared invariant.
- `module-resolver.ts` is also thin and currently lacks strong shared normalization semantics with the scan layer, which increases mismatch risk across scan, index, and resolution paths.
- The immediate user value is safer and more trustworthy code-discovery input for DH intelligence flows on real repositories, not a full rebuild of project/filesystem/worktree infrastructure.

## Current State vs Target State

| Dimension | Current state in DH | Target state for this scope |
|---|---|---|
| Scan entry point | `detect-projects.ts` recursively scans from `repoRoot` with basic ignore rules | Scan behavior is bounded, explicit, and hardened with clear scan controls |
| Workspace detection | Returns a single workspace and weakly detects type | Workspace typing is based on real markers and scan output is ready for safer segmentation logic |
| Path handling | No clearly shared canonical-path contract across scan and consumers | Canonical path handling is treated as a required invariant for scan output and downstream consumers |
| Symlink behavior | No explicit policy | Default symlink handling is explicit and safe-by-default |
| Diagnostics | Little visibility into ignored/skipped/error cases | Scan diagnostics explain visited/indexed/ignored/skipped/error and stop conditions |
| Downstream interpretation | Consumers can treat scan output as if it were full coverage | Consumers can distinguish full scan from partial/budget-stopped scan |
| Scope ambition | Thin baseline only | Hardened scan layer only; still not full upstream project/worktree/platform parity |

## In Scope

1. **Scan contract hardening in `detect-projects.ts`**
   - Define bounded scan controls such as file/depth/size limits and related stop behavior.
   - Make symlink handling explicit and safe-by-default.
   - Add diagnostics that make scan behavior observable.

2. **Workspace marker and type detection correction**
   - Detect workspace type from real markers such as `package.json`, `go.mod`, or equivalent marker presence.
   - Remove the current logical dependency on already-filtered indexable files for workspace typing.

3. **Canonical path invariant for scan output**
   - Introduce a consistent canonicalization/normalization expectation for scan output paths.
   - Align downstream consumers to rely on that canonical output instead of applying inconsistent path handling independently.

4. **Consumer alignment for partial scan awareness**
   - Ensure `graph-indexer`, `run-retrieval`, and `index-job-runner` can understand diagnostics and budget-stop/partial-scan states.
   - Prevent downstream logic from interpreting partial scan coverage as authoritative full coverage.

5. **Minimal type contract expansion**
   - Extend shared indexing types only where needed to carry diagnostics, marker, or scan metadata.
   - Preserve backward compatibility through additive or optional fields where possible.

6. **Optional monorepo-aware segmentation as a later slice within this scope family**
   - Define it as a possible later phase only if marker-based boundaries are clear.
   - Do not require full multi-workspace parity for the initial hardening slice.

## Out of Scope

- Porting the full upstream `Project`, `Vcs`, `Worktree`, or Effect-layer service model.
- Full project/worktree/platform parity with upstream.
- Worktree lifecycle features such as create/remove/reset.
- General shell orchestration, process-tree management, or shell fallback work.
- Broad plugin, MCP, or unrelated runtime subsystem changes.
- Replacing DH architecture with an upstream-style project management subsystem.
- Full monorepo/workspace management parity beyond the minimum scan hardening needs.

## Business Rules and Scope Boundaries

1. **Selective-port only** — upstream is reference input for invariants and guardrails, not a blueprint to mirror.
2. **Scan-first focus** — the immediate target is project/workspace scan hardening, not general project/worktree/platform parity.
3. **Thin-DH reality stays explicit** — `detect-projects.ts` and `module-resolver.ts` are currently thin and should be hardened incrementally.
4. **Canonical path handling is mandatory** — path normalization is part of correctness, not an optional optimization.
5. **Partial scan must be observable** — if scan coverage is limited by budget or guardrails, downstream consumers must be able to tell.
6. **No shell/plugin broadening** — improvements outside scan correctness, scan safety, and closely related consumer alignment are outside this scope.

## Acceptance Criteria

| # | Acceptance criterion | Observable completion signal |
|---|---|---|
| AC-1 | DH defines a hardened scan contract for project/workspace discovery with explicit scan controls and stop behavior | `detect-projects` or its equivalent contract exposes bounded scan options and a clear stop/termination model |
| AC-2 | Workspace type detection no longer depends on filtered indexable files and instead uses real workspace markers | A repository with marker files such as `package.json` or `go.mod` can be typed correctly even when those files are not part of indexed content |
| AC-3 | Scan output includes diagnostics sufficient to explain coverage and filtering behavior | Diagnostics can report at least visited/indexed/ignored/skipped/error counts plus a stop reason when scan is partial |
| AC-4 | Symlink handling is explicit and safe-by-default | The scan contract defines default no-follow or equivalent guarded behavior and does not silently recurse through unsafe symlink paths |
| AC-5 | Canonical path handling is applied consistently to scan output and relied on by downstream consumers | Indexing/resolution consumers consume scan paths using one shared normalization expectation rather than divergent local handling |
| AC-6 | `index-job-runner` can surface partial-scan or budget-stop conditions in operator-visible diagnostics | Job summaries or equivalent diagnostics make partial coverage explicit instead of implying a complete scan |
| AC-7 | `graph-indexer` does not mis-handle partial scan output as authoritative deletion/full-state evidence | A budget-stopped or partial scan does not cause downstream logic to treat missing files as definitively removed solely because they were not scanned |
| AC-8 | Retrieval-facing scan use can surface reduced-coverage conditions when scan results are partial | Retrieval output or associated metadata can indicate when workspace coverage is incomplete |
| AC-9 | Shared indexing types carry the minimum new metadata needed for diagnostics and scan-state awareness without breaking existing callers | Type updates are additive/minimally disruptive and existing integration points remain compatible |
| AC-10 | Delivered work remains limited to project/workspace scan hardening and closely related consumer alignment | No implementation in this task introduces full project/worktree/platform parity or unrelated shell/plugin subsystem work |

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Scope creep into full project/worktree parity | Would expand the task beyond the stated selective-port goal | Review every slice against the out-of-scope list before approval/completion |
| Over-tight budgets reduce useful coverage | Could make scan safer but less useful on real repositories | Start with conservative defaults plus diagnostics that explain stop reasons |
| Path canonicalization drift across consumers | Could preserve mismatch bugs even after scan hardening | Define one canonical path expectation and align consumers to it explicitly |
| Partial-scan handling is ignored downstream | Could produce incorrect index or retrieval conclusions | Treat consumer alignment as part of the core scope, not follow-up cleanup |
| Marker heuristics are too narrow | Could still misclassify workspace type in mixed repositories | Keep marker logic explicit and minimal, and preserve room for later extension |

### Assumptions

1. `docs/opencode/project-workspace-scan-hardening-selective-port-mapping-dh.md` is the authoritative analysis input for this scope.
2. The immediate next selective-port task is scan hardening, not a broader upstream subsystem port.
3. `detect-projects.ts` and `module-resolver.ts` are currently thin and should be improved incrementally rather than replaced wholesale.
4. Initial delivery may keep single-root workspace behavior while adding the contracts needed for safer future segmentation.

## Execution Sequencing Expectations

### Required sequence
1. **Phase 0 — Baseline and contract confirmation**
   - Confirm current scan callers, current type contracts, and current downstream assumptions.
   - Define the hardened scan contract, diagnostics vocabulary, and canonical path expectation.

2. **Phase 1 — Core scan hardening**
   - Add scan controls, stop behavior, symlink policy, marker-based workspace typing, and diagnostics to `detect-projects.ts`.
   - Keep behavior additive and backward compatible where practical.

3. **Phase 2 — Consumer alignment**
   - Update `index-job-runner`, `graph-indexer`, and retrieval-facing flows to understand diagnostics and partial-scan semantics.
   - Ensure operator-visible outputs distinguish complete from partial coverage.

4. **Phase 3 — Conditional workspace segmentation follow-up**
   - Only if Phase 1 and Phase 2 are stable, evaluate marker-driven multi-workspace segmentation as a narrow follow-on slice.
   - Keep backward compatibility with current single-root assumptions unless separately approved.

### Hard sequencing rules
- Do not start by porting full upstream project/worktree services.
- Do not add broad shell, plugin, or unrelated runtime work under this task.
- Do not treat partial-scan semantics as optional; consumer alignment is required before the task is considered complete.
- Do not make multi-workspace parity a prerequisite for the initial hardening slice.

## Handoff Notes for Solution Lead

- Preserve the framing: this is a **project/workspace scan hardening** task, not a general project subsystem port.
- Keep design centered on `detect-projects.ts` as the primary change surface plus targeted consumer alignment.
- Treat canonical path handling, marker-based workspace typing, diagnostics, and partial-scan safety as the main acceptance hotspots.
- Preserve DH reality: current scan and module resolution are thin, and the goal is to harden them incrementally without widening the task into shell/plugin or full parity work.
