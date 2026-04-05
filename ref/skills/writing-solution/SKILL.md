---
name: writing-solution
description: "Converts an approved Product Lead scope package into an execution-ready Solution Lead package with validation matched to the workflow mode."
---

# Skill: Writing Solution Packages

## Context

This skill is used by `Solution Lead`. It turns an approved `Product Lead` scope package into an execution-ready solution package that `FullstackAgent`, `Code Reviewer`, and `QAAgent` can trust.

When this skill requires reading code, tracing dependencies, or inspecting impacted files, follow `context/core/tool-substitution-rules.md` and prefer kit intelligence tools before basic built-in tools.

Each solution package should be detailed enough that implementation can proceed without guesswork and review can trace decisions back to approved scope.

For full delivery, the sequence is strict:
- `Product Lead` writes the scope package in `full_product`
- that scope package is approved
- `Solution Lead` then writes the solution package in `full_solution`

Do not write the solution package in parallel with `Product Lead` scope work.

## Core Rules of a Good Plan

1. **Feature slices first**: start with feature-level slices, sequencing, and integration checkpoints before any optional micro-task breakdown.
2. **Executable boundaries**: each slice should be coherent enough to hand to implementation and review without hidden assumptions.
3. **Exact file paths**: specify the exact absolute path or repository-relative path for every file to create or edit when file targets are known.
4. **Validation flow**: solution-package validation must match the active workflow mode. Full-delivery logic work should be TDD-first when the repository has suitable test tooling. Migration work should prioritize preserved invariants, blocker-decoupling steps, compatibility checks, staged verification, and targeted tests only where they are truly reliable and helpful. If the repo does not define a standard command yet, the solution package must state the missing validation path instead of inventing one.
5. **Upstream contract first**: in full delivery, every major decision in the solution package must trace back to the approved `Product Lead` scope package rather than replacing or redefining product intent.

## Anti-Bloat Rules

- do not open with generic architecture narration when the real need is an execution-ready solution package
- do not repeat the same scope detail from the scope package in every slice
- do not produce more slices than the repository or feature actually needs
- do not expand slices into micro-steps unless implementation would otherwise be ambiguous
- do not create placeholder sections with no concrete decisions inside them
- prefer one recommended path over multiple equivalent options unless the decision is still genuinely unresolved

## Execution Process

### Step 1: Context Gathering
Make sure you have read:
- `docs/scope/YYYY-MM-DD-<feature>.md`
- the current workflow stage and approval context
- `context/core/code-quality.md`

Before writing, confirm that in full delivery the scope package came from `Product Lead` in `full_product` and is approved for `Solution Lead` to use in `full_solution`.

### Step 2: Write the Solution Package

Create `docs/solution/YYYY-MM-DD-<feature>.md` using this structure:

```markdown
# Solution Package: [Feature Name]

## Dependencies
- Are any additional packages required? (`npm install X`, `pip install Y`)
- Are any environment variables required?

## Solution Slices

List the major slices first. For each slice, follow a validation-aware structure:

### [ ] Slice 1: [Specific outcome]
- **Files**: `path/to/file.ext`
- **Goal**: [Brief description]
- **Validation Command**: `[test/build/typecheck/smoke/manual verification command for this step, or an explicit note that no repo-native validation command exists yet]`
- **Details**:
  - State the baseline or expected change for this slice
  - State the implementation or upgrade action
  - State dependencies, reviewer focus points, and how the result will be verified honestly

## Dependency Graph
- Record which slices must stay sequential.
- Record which slices may run in parallel safely only when the solution package explicitly documents why parallel execution is safe.
- Name the critical path in one short line.

## Validation Matrix
- Map acceptance or invariant targets to the real validation path.

## Optional Execution Breakdown
- Add micro-steps only when execution needs them.
```

### Step 3: Review and Refine
- Are the solution slices coherent and traceable?
- Does any slice still hide too many unrelated surfaces? -> If yes, split it.
- In full mode, does any logic task skip the "write test first" step without justification? -> Add the test requirement.
- In full mode, does the package clearly depend on the approved `Product Lead` scope package instead of redefining requirements? -> Rewrite it.
- In migration mode, does the solution package mix rewrite work into the migration instead of isolating blockers and proving parity? -> Rewrite the sequence.
- In migration mode, does the solution package rely on fake TDD instead of baseline, compatibility, and regression evidence? -> Rewrite the validation guidance.
- Does the solution package cover all acceptance criteria from the scope package?

## Anti-Patterns
- A solution package written before the `Product Lead` scope package is approved.
- A solution package that redefines product scope instead of designing from the approved scope package.
- A solution package that starts with micro-checklists but never explains the feature slices, dependencies, or integration checkpoint.
- A solution package that reads like a generic architecture essay instead of an execution-ready delivery artifact.
- No test guidance or test command, and no explicit note that the repo lacks a standard command.
- A solution package that does not specify which files need to be edited.
