---
name: subagent-driven-development
description: "Execution engine. Dispatches fresh subagents for each task to avoid context pollution and ensures 2-stage review."
---

# Skill: Subagent-Driven Development

## Context

Used by the Fullstack Agent to execute a solution package.

When preparing task context from repository code, follow `context/core/tool-substitution-rules.md` and prefer kit intelligence tools before basic built-in tools.

When working through a complex sequence of tasks, the primary agent can get overwhelmed or hallucinate because the context grows too large. Subagent-Driven Development solves this by splitting the work into tasks and dispatching a fresh subagent to handle each task individually.

## Execution Process

### 1. Preparation (Task Queueing)
Read `docs/solution/YYYY-MM-DD-<feature>.md`.
Build a queue of tasks.

### 2. Batch Execution (Repeat for Each Task)

Take Task N from the queue:

#### Step 2a: Prepare the Subagent Payload
Create a prompt (define it first, do not run it yet) with enough context for the subagent (usually the implementation-focused Fullstack Agent):
- target files
- exact code requirements from the solution package
- tests that must pass
- explicit instruction: "Follow the active mode's validation model and the coding standards"; use TDD in full-delivery implementation work and migration validation in migration work

#### Step 2b: Dispatch & Execution
Call the tool or script that runs the subagent independently. (This may be a shell command, a `run_agent.sh` script, or an equivalent delegation mechanism.)

The subagent must report one of 4 standard statuses:

- `DONE`: task completed, ready for review
- `DONE_WITH_CONCERNS`: task completed, but with concerns the controller must read before review
- `NEEDS_CONTEXT`: missing context; must not guess
- `BLOCKED`: cannot complete with the current scope or context

#### Step 2c: Stop and Call a Reviewer (Code Reviewer Subagent)
Do NOT mark the current task complete and continue.
You must dispatch an independent `code-reviewer` subagent with a fresh context to evaluate the implementation.

Two-stage review process (see `skills/code-review/SKILL.md`):
- **Stage 1**: scope compliance
- **Stage 2**: code quality

Do not reverse this order.

*If it fails*: send the task back to Step 2a with the review feedback.
*If it passes*: mark the task as DONE and commit.

### 3. Loop and Throughput
Return to Step 2 for Task N+1.

## Anti-Patterns to Eliminate
- "I'll just take all 5 tasks in the solution package and do them in one shot." -> **Seriously wrong**. The LLM will forget instructions midway and accumulate context garbage.
- Skipping the code-review subagent because "I trust my own work." -> The implementer subagent can still be wrong. An independent reviewer is mandatory.
- Letting the implementer reread the whole solution package and choose scope when the controller already knows the current task. -> Wrong. The controller should provide the full task text and relevant context, not dump the whole world into the subagent.
- Moving to the next task while scope review or quality review still has open issues. -> Wrong. A task is DONE only after it passes both gates.

## Handling Implementer Status

### `DONE`
- move straight into scope review

### `DONE_WITH_CONCERNS`
- read the concerns first
- if they affect correctness or scope, resolve them before review
- if they are only maintainability notes, continue into review but keep them in mind for later work

### `NEEDS_CONTEXT`
- provide the missing context
- re-dispatch the same task; do not let the implementer invent assumptions

### `BLOCKED`
- assess whether the blocker comes from missing context, an oversized task, or a bad solution package
- if needed, split the task smaller or escalate to the coordinating human or agent
