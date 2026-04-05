---
name: code-review
description: "Pre-review checklist and quality gates. Uses a two-stage approach: scope compliance then code quality."
---

# Skill: Code Review

## Context

Used by the Code Reviewer subagent, the QA Agent, or the Solution Lead when review framing is needed.
The goal is to be the technical gate before QA, catching off-scope or low-quality code before runtime verification begins.

## Required Inputs

- What needs review? (files / commit / PR)
- Comparison documents: approved scope package (requirements), approved solution package (design), and code standards. Use a separate architecture artifact only as supplemental context when the repository explicitly includes one.

## Tool Usage -- MANDATORY

When this skill requires reading, searching, or tracing code, follow `context/core/tool-substitution-rules.md`.

### Do NOT use OS commands for source-code inspection

- Do not use `grep`, `find`, `cat`, `head`, `tail`, `sed`, `awk`, `wc`, or `echo > file` on source code files.
- Use built-in tools for fallback (`Grep`, `Glob`, `Read`, `Edit`, `Write`) only when the smarter kit tool is unavailable.

### Prefer these kit tools first

- `tool.syntax-outline`: inspect file structure before reviewing large or unfamiliar files.
- `tool.syntax-context`: inspect a precise code region without reading the wrong area.
- `tool.syntax-locate`: verify handlers, exports, and structural expectations exist where claimed.
- `tool.graph-goto-definition`: jump to the implementation that a symbol or API name resolves to.
- `tool.graph-find-references`: trace all usages of the reviewed symbol or function.
- `tool.heuristic-lsp`: use lightweight symbol navigation when graph-backed tools are unavailable.
- `tool.rule-scan` and `tool.security-scan`: gather quality and security evidence before finalizing review findings.

### Fallback

- If a kit intelligence tool is unavailable or degraded, fall back to the corresponding built-in tool.
- Always try the smarter tool first and record when you had to fall back.

## Two-Stage Review Process

Strictly follow these two stages in order. Do not talk about formatting or clean code if the feature itself is off-spec.

### Stage 1: Scope Compliance
**Ask exactly one question: "Does this code meet the acceptance criteria in the scope package exactly, and does it avoid inventing extra features?"**

- Inspect each acceptance criterion (Given - When - Then).
- Does the code handle the edge cases the scope package documented?
- **Overscope Audit (Over-engineering)**: counter the developer instinct to "helpfully" add extra behavior. Has the code built convenience features that were never requested? (YAGNI)

=> **Record Pass / Fail for Stage 1. If it fails, stop the review there and send it back to the developer. Do not continue to Stage 2.**

### Stage 2: Code Quality
Only reach this step if Stage 1 has passed. Use `context/core/code-quality.md` as the review baseline.

Review by severity:
1. **Critical / Security (Must fix immediately)**: SQL injection, leaked environment variables, crash-level memory issues.
2. **Architecture (Needs consultation)**: wrong boundary ownership (for example, a controller doing database query logic). Escalate to Solution Lead.
3. **Important Quality (Should fix)**: meaningless variable names (`let a = 1`), functions longer than 50 lines, badly degraded test coverage.
4. **Minor**: brace and spacing debates. Follow the existing linter or formatter.

## Checklist for a Good Review Report
- [ ] Clearly state Stage 1 (Pass/Fail) and why.
- [ ] Cite the exact file path and failing line number.
- [ ] State severity clearly (Critical / Important / Minor).
- [ ] Do not just criticize - include a concrete fix suggestion or example snippet.
- [ ] Recommend the route back to implementation, solution, or product when the issue is not purely code-local.

## Anti-Patterns to Avoid
- Superficial review: "LGTM" without actually reading the files.
- Fixing the code for the developer: "I'll just patch it quickly and approve." The reviewer must not touch the implementation. The developer stays responsible for the fix.
- Replaying QA: trying to prove release readiness or end-to-end runtime behavior instead of reviewing the code and its contracts.
