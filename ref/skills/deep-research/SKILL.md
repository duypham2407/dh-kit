# deep-research

Use this skill when a task needs evidence-based research across repository context, docs, and external references.

## Tool Usage — MANDATORY

When performing deep research, you MUST use the kit's intelligence tools to gather evidence systematically. Do NOT rely on OS commands (`grep`, `find`, `cat`) or surface-level built-in tools alone.

### Searching for evidence

- Use **`tool.semantic-search`** for meaning-based search when the exact term or pattern is unknown. This is the primary research tool.
- Use **Grep tool** (built-in) for exact regex matches when you know the precise pattern.
- Use **`tool.ast-grep-search`** when searching for structural code patterns (e.g. all functions that call a specific API).

### Tracing code relationships

- Use **`tool.import-graph`** to trace module boundaries and data flow paths.
- Use **`tool.find-dependencies`** / **`tool.find-dependents`** to map which modules are affected by a component or API.
- Use **`tool.graph-find-references`** to find every usage of a symbol across the codebase.
- Use **`tool.graph-call-hierarchy`** to trace execution paths through the codebase.
- Use **`tool.graph-goto-definition`** to navigate to the authoritative definition of a symbol.

### Understanding code structure

- Use **`tool.syntax-outline`** to survey a file's shape before reading it entirely.
- Use **`tool.syntax-context`** for targeted context at a specific position.
- Use **`tool.find-symbol`** when you know a symbol name and want its definition location.
- Use **Read tool** (built-in) to read the full content when needed.

### Quality and security evidence

- Use **`tool.rule-scan`** to gather quality evidence about specific files or patterns.
- Use **`tool.security-scan`** when researching security-related concerns.

### Fallback

If a kit intelligence tool is unavailable, not indexed, or returns degraded results, fall back to the corresponding basic built-in tool (Grep, Glob, Read). But always try the smarter tool first — research quality depends on tool quality.
