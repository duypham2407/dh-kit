---
name: verification-before-completion
description: "Use before claiming work is complete, fixed, or passing. Requires fresh verification evidence before any success claim."
---

# Skill: Verification Before Completion

## Context

Use this skill immediately before the agent:

- says the work is done
- claims tests pass / the fix is done / the workflow is complete
- creates a commit, PR, or merge
- moves the task to the next step as if it were already complete

OpenKit prioritizes **evidence before assertion**. Without fresh verification evidence, you must not speak as if the work is already sound.

## Iron Law

```
DO NOT CLAIM COMPLETION WITHOUT FRESH VERIFICATION EVIDENCE
```

If you have not run the command that proves the claim in the current working session, the agent must report the real status as "not yet verified" instead of guessing.

## Gate Function

When verification requires reading diffs, tracing changed code, or checking implementation evidence, follow `context/core/tool-substitution-rules.md` and prefer kit intelligence tools before basic built-in tools.

Before making any statement that implies success:

1. IDENTIFY which command proves the claim
2. RUN the full command
3. READ the real output without inventing meaning
4. CHECK the exit code, error count, and pass/fail counts
5. ONLY THEN speak as if the outcome succeeded

If the command fails, or if no verification path exists yet, report that exact reality.

## What Counts as Valid Evidence

### Tests

Valid example:

- `node --test ".opencode/tests/*.test.js"` with real passing output

Not valid:

- "it passed earlier"
- "the code looks right"
- "part of the suite passed so the rest is probably fine"

### Runtime behavior

Valid examples:

- run `node .opencode/workflow-state.js status`
- run `node .opencode/workflow-state.js doctor`
- run a manual smoke test with clearly described observed input and output

Not valid:

- "this hook probably prints the right output because the unit test passed" when the claim is about integrated runtime behavior that has not been checked appropriately

### Requirements / solution-package completion

Valid example:

- compare every item in the scope package or solution package against the diff and verification output

Not valid:

- "tests passed, so the requirements must all be done"

## Current OpenKit Reality

OpenKit does not currently define repo-wide build, lint, or test commands for general application code.

So this skill must stay honest to the actual repo state:

- if the repo has workflow-runtime tests, use them
- if it only has runtime CLI checks or manual checks, say clearly that those are the real verification paths
- if no suitable validation path exists, report that gap instead of inventing a command

## Common Failure Patterns

| Claim | Required evidence | Not enough |
|------|-------------------|------------|
| "Tests pass" | latest test-command output | old run, memory, assumption |
| "Bug fixed" | symptom reproduction + passing verification | code changes alone |
| "Ready to commit" | passing verification for the relevant scope | only looking at the diff |
| "Requirements met" | checklist against scope package/solution package + verification | partial test success |
| "Agent task done" | inspect changes + verify behavior | trusting a subagent report |

## Red Flags

If you catch yourself thinking these phrases, stop:

- “should work now”
- “looks correct”
- “probably fine”
- “just this once”
- “the old test already passed”
- “I'm pretty sure”

Those are signs the agent is shifting from engineering into guessing.

## Required Output Style When Verification Fails or Is Missing

If verification fails:

- state the command you ran
- state the real failure status
- include the important output or summary
- do not use fuzzy wording like "almost done"
- when routing a failure, include a structured record with issue type, rooted_in, evidence, behavior impact, and recommended route

If no verification path exists:

- say clearly that the repo does not yet have an appropriate command
- describe any manual check you did perform
- explain the remaining limitation

## Before Commit / PR / Merge

Immediately before commit, PR, or merge, the agent must check:

- which claim is about to be made
- which command proves it
- whether fresh output actually exists

Do not use commit or merge as a way to "close the task and move on" when verification is still missing.

## Bottom Line

**Evidence before claims. Always.**

OpenKit may still lack tooling in many areas, but it must never lack honesty about verification status.

For reviewer and QA outputs, prefer compact structured records over free-form narrative so rerouting can stay explicit and machine-checkable later.
