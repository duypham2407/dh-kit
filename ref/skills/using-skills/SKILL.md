---
name: using-skills
description: "Meta-skill: Teaches agents how to discover, evaluate, and invoke skills. Loaded at session start."
---

# Skill Usage Guide - Meta-Skill

## What Skills Mean

In the AI Software Factory, "Skills" are standard operating procedures that define how the system should work. When a situation matches a skill, you **must** follow that skill instead of improvising from raw LLM instinct.

## Instruction Priority

When instructions conflict, apply this order (1 is highest):

1. **Current user prompt**: direct instructions from the user in the current message
2. **Skill instructions**: guidance inside the active `SKILL.md`
3. **Agent role instructions**: the agent's role and constraints (for example, `QA Agent does not edit code`)
4. **General system prompt**: the base LLM behavior

## How to Use a Skill

When you identify a situation (for example: need to write a solution package, fix a bug, or test code), follow these steps:

1. **Identify**: "I need to create a solution package"
2. **Discover**: "Let me use the tool to read `skills/writing-solution/SKILL.md`"
3. **Read**: use `view_file` (or the equivalent tool) to read the ENTIRE `SKILL.md`
4. **Execute**: apply the steps from that file

When a skill requires code exploration or file inspection, also follow `context/core/tool-substitution-rules.md` so kit intelligence tools are preferred before basic built-in tools or OS commands.

When choosing between multiple plausible skills, use `.opencode/openkit/docs/maintainer/role-skill-matrix.md` when that matrix is available in the active kit surface.

## Built-In Bundled Skills

OpenKit ships with bundled default skills that should be used proactively when the task domain matches:

- `vercel-react-best-practices` for React or Next.js implementation, refactors, data fetching, rendering, and performance work
- `vercel-composition-patterns` for component API design, boolean-prop sprawl, compound components, context providers, and reusable React composition
- `vercel-react-native-skills` for React Native, Expo, mobile UI performance, navigation, animation, and native-platform concerns
- `find-skills` when the user wants a capability the current kit may not already cover and discovering an external skill is more appropriate than improvising

When a task clearly matches one of these domains, read that skill before proceeding instead of relying on generic framework instinct.

## Warning: Rationalization Prevention

LLM instinct often tries to short-circuit the process. Watch for these faulty thoughts:

| Bad thought (Rationalization) | Correct action |
|--------------------------------|----------------|
| "This file is easy, I'll just fix it without reporting to the Master Orchestrator." | Stop. Follow the role boundary. Report to the Master Orchestrator first. |
| "I already know how to write solution packages, I don't need to reread `skills/writing-solution/SKILL.md`." | No. Every time you write one, reread the skill so you are using the latest checklist. |
| "This bug is obvious, I can skip root-cause analysis and fix it directly." | No. Use `systematic-debugging`. Root cause analysis is mandatory first. |
| "The user said it's urgent, so I'll skip the test-writing step (TDD)." | In full-delivery implementation, TDD remains the default unless the user **very explicitly** says "Skip TDD". In migration mode, follow the migration validation model instead of forcing fake TDD. |
