---
name: test-driven-development
description: "RED-GREEN-REFACTOR cycle. Enforces strictly writing failing tests before production code."
---

# Skill: Test-Driven Development (TDD)

## Context

This is the Iron Law for the Fullstack Agent. You are NOT ALLOWED to write any production code until a failing test proves that code needs to exist.

When TDD requires locating implementation points, related tests, or call sites, follow `context/core/tool-substitution-rules.md` and prefer kit intelligence tools before basic built-in tools.

## Execution Process (RED-GREEN-REFACTOR)

### Step 1: RED (Write a Failing Test)
1. Pick one small task from the approved solution package.
2. Write **one** test case for that behavior.
3. Run the repository's defined test command for the language or framework in use. If the repo does not define a standard command, stop and report the missing validation path instead of guessing.
4. **Mandatory validation**: the test MUST fail. It must fail for the right reason (for example, `ReferenceError: function is not defined`, or `Expected true but got false`).
   - If the test passes immediately -> the test is wrong, delete it and rewrite it.

### Step 2: GREEN (Write the Minimum Code)
1. Write **only enough code to make that one test pass**.
2. **Lazy Code Rule**: return a hardcoded value if that is enough to make the test pass. Do not think about future needs (YAGNI - You Aren't Gonna Need It).
3. Run the tests again.
4. **Mandatory validation**: the test must PASS. If it does not, keep fixing until it passes. Do not add extra features.

### Step 3: REFACTOR
When (and only when) all tests are green:
1. Review the code: is there duplication (DRY)? Are names understandable? Is the design still sound?
2. Refactor the code.
3. Run the tests again. If any test fails -> revert the refactor immediately or repair it quickly.

## Anti-Patterns to Eliminate and Required Responses

| Rationalization | Required response |
|-----------------|-------------------|
| "This is too simple, writing a test will take longer, I'll just code it." | **STOP.** Delete the code you just wrote and write the test first, even for a simple `add(a, b)` function. |
| "I'll write 5 tests at once and then code it all in one pass." | **Stop.** One RED, one GREEN, one REFACTOR. Do not batch them together. |
| "UI testing is too hard, I'll skip TDD for this part." | You may skip it only if the user explicitly allows it. Prefer separating logic from UI so the logic can still be tested. |
| "The test failed and I already know the issue, so I'll fix files A, B, and C at once." | The root cause still lives in one place. Find it and fix the right place. Read `systematic-debugging`. |

## Checklist for a Complete Cycle
- [ ] Test written and run (FAIL)
- [ ] Error message read and understood
- [ ] Minimal production code written
- [ ] Test rerun (PASS)
- [ ] Nearby code cleaned up (REFACTOR)
- [ ] Commit made (each GREEN/REFACTOR is a chance for a small commit)
