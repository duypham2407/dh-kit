---
name: brainstorming
description: "Socratic design refinement process. Used before writing any specs or code to clarify intent and explore options."
---

# Skill: Brainstorming (Socratic Refinement)

## Context

When the user brings a new idea or request, or when `Product Lead` or `Solution Lead` encounters meaningful ambiguity, this skill should be used before locking in scope or solution decisions.

When brainstorming requires exploring existing code, follow `context/core/tool-substitution-rules.md` and prefer kit intelligence tools before basic built-in tools.

Do not force brainstorming when the request is already clear enough for direct scope or solution work. Use it when ambiguity is still high enough that jumping straight into scope, planning, or code would be risky.

## Execution Process

### Phase 1: Context Exploration
1. Read the user's initial request.
2. Identify any relevant existing files.
3. Ask clarifying questions. **Golden Rule: ask only ONE question at a time.**
   - Do not dump a list of 5 questions on the user and overwhelm them.
   - Ask the most important question first. Wait for the answer before asking the next one.
   - Example: "Who is the primary user of this feature: Admin or Client?"

### Phase 2: Option Generation
Once you have enough information (no major open questions remain), use judgment:

- if the decision is still genuinely open, present 2-3 materially different approaches
- if one approach is clearly better given the request and repository context, recommend it directly and state the main trade-off instead of forcing fake options

**Proposal template:**
```markdown
Based on what you've shared, I see X main approaches:

**Option 1: [Short name]**
*   **How it works**: [Brief description]
*   **Pros**: [...]
*   **Cons / Trade-offs**: [...]

**Option 2: [Short name]**
*   **How it works**: [Brief description]
*   **Pros**: [...]
*   **Cons / Trade-offs**: [...]

Which direction do you prefer, or do you want to combine ideas from both?
```

### Phase 3: Incremental Design
After the direction is clear, design the solution **one part at a time**.
- Do not drop one giant design block on the user.
- For example, design the database first and get feedback. Then design the API and get feedback.
- Use visual tools when helpful (Mermaid diagrams, ASCII art).

If the request is already clear enough to move into `Product Lead` or `Solution Lead` output, keep this phase short and hand off quickly.

### Phase 4: Handoff
Finish brainstorming by moving into a scope or solution artifact that the active role owns, then hand off to the next role in the pipeline.
