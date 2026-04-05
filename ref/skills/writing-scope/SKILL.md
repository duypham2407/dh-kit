---
name: writing-scope
description: "Converts requirements into structured scope packages with concrete acceptance criteria."
---

# Skill: Writing Scope Packages

## Context

This skill is used by `Product Lead` to turn high-level intent into a detailed scope and acceptance artifact that is ready for `Solution Lead` and the delivery team.

In full delivery, this scope package is the required upstream artifact for `Solution Lead` in `full_solution`. `Solution Lead` should design from this package, not in parallel with it.

## Execution Process

### 1. Verification (Input Check)
- Make sure you already have a clear problem statement.
- If the scope is still vague (for example: "make it faster"), go back to the user or the active scope owner and get measurable detail.

### 2. User Stories Breakdown
Break the feature into user flows (user stories).
**Required format:** `As a [User Type], I want [Action], so that [Benefit/Value].`

### 3. BDD Acceptance Criteria
This is the hardest and most important section. Each user story must include Given-When-Then acceptance criteria.

**Bad example (too vague):**
> The submit button should be disabled when the data is invalid.

**Good example (Given-When-Then):**
> **Given** the user is on the "Create New" form
> **And** the "Email" field is blank or invalid
> **When** they try to click the "Submit" button
> **Then** the "Submit" button must be disabled
> **And** an empty/invalid-format error message appears under the "Email" field

### 4. Edge Cases
You must include a dedicated section for failure conditions and awkward scenarios:
- What happens if the network drops mid-request?
- What happens if the user double-clicks the button?
- What happens with input that is too long, too short, or contains special characters?
- Race conditions?

### 5. Document Output
Create the markdown file at `docs/scope/YYYY-MM-DD-<feature-name>.md`.

The output must be explicit enough that `Solution Lead` can turn it into `docs/solution/YYYY-MM-DD-<feature-name>.md` without rediscovering user intent, business rules, or acceptance boundaries.

## Anti-Patterns to Avoid
- **Tech leaking**: putting technical implementation decisions in the scope package (for example: "Use React `useState` to store the form"). A scope package should describe behavior and requirements, not code.
- **Unmeasurable goals**: "beautiful UI", "fast performance". Replace them with measurable requirements like "responsive on mobile" or "response time < 200ms".
