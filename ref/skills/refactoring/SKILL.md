# refactoring

Use this skill when a task centers on changing structure without changing behavior, especially when validation and safety matter.

## Tool Usage — MANDATORY

When refactoring, you MUST prefer the kit's structured editing and inspection tools over raw text manipulation. The following rules apply whenever this skill is active.

### Understanding before changing

- Use **`tool.syntax-outline`** to understand file structure before editing.
- Use **`tool.import-graph`** / **`tool.find-dependencies`** / **`tool.find-dependents`** to map what will be affected by the refactor.
- Use **`tool.graph-find-references`** to find every usage of a symbol before renaming or moving it.
- Use **`tool.graph-call-hierarchy`** to understand callers and callees before restructuring a function.

### Making changes

- Do NOT use `sed`, `awk`, or manual multi-file `Edit` loops for repetitive transformations.
- Use **`tool.codemod-preview`** to preview the transformation before applying it.
- Use **`tool.codemod-apply`** to apply verified transformations across multiple files.
- Use **`tool.ast-grep-search`** to identify all structural matches before applying a codemod.
- Use **`tool.graph-rename-preview`** before renaming a symbol to see all affected locations.
- Use **Edit tool** (built-in) for single-file, single-location changes only.

### Validating after changing

- Use **`tool.rule-scan`** to verify code quality rules are still satisfied after refactoring.
- Use **`tool.syntax-outline`** on changed files to confirm structure is preserved.
- Use **`tool.graph-find-references`** after a rename to verify all references are updated.
- Run tests via Bash if a test runner is available.

### Fallback

If a kit intelligence tool is unavailable or degraded, fall back to the corresponding basic built-in tool (Edit, Grep, Read). But always try the smarter tool first, especially for multi-file operations.
