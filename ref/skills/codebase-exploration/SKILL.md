# codebase-exploration

Use this skill when the main job is locating code, tracing behavior, or mapping repository structure quickly.

## Tool Usage — MANDATORY

You MUST use the kit's intelligence tools instead of OS commands or basic built-in tools alone. The following rules apply whenever this skill is active.

### Finding files and symbols

- Do NOT use `find`, `ls`, or raw `grep` to locate source files.
- Use **Glob tool** for file-pattern matching.
- Use **`tool.find-symbol`** when you know the symbol name and want its definition.
- Use **`tool.import-graph`** to see what a file imports or who imports it.

### Searching code

- Do NOT use OS `grep`, `egrep`, `fgrep`, or `rg` on source files.
- Use **Grep tool** (built-in) for exact regex matches.
- Use **`tool.semantic-search`** for meaning-based search when exploring unfamiliar code or when the exact pattern is unknown.
- Use **`tool.ast-grep-search`** for structural code patterns (function calls, class shapes, import declarations).

### Reading and understanding code

- Do NOT use `cat`, `head`, or `tail` on source files.
- Use **`tool.syntax-outline`** first to understand a file's structure before reading it fully.
- Use **Read tool** to read the actual content when needed.
- Use **`tool.syntax-context`** when you need surrounding code context at a specific position.
- Use **`tool.syntax-locate`** to find the exact line/position of a named construct.

### Navigating code relationships

- Use **`tool.find-dependencies`** / **`tool.find-dependents`** for module dependency graphs.
- Use **`tool.graph-goto-definition`** for IDE-style navigation to a symbol's definition.
- Use **`tool.graph-find-references`** to locate every usage of a symbol across the codebase.
- Use **`tool.graph-call-hierarchy`** to understand who calls a function and what it calls.

### Fallback

If a kit intelligence tool is unavailable, not indexed, or returns degraded results, fall back to the corresponding basic built-in tool (Grep, Glob, Read). But always try the smarter tool first.
