# Tool Runtime And Permission Model Design

## Goal

Milestone 6 gives DH a real OpenCode-like tool catalog and a policy-bound tool runner without weakening DH operator safety.

The milestone should make model-requested tools observable and enforceable: inputs are validated before execution, every attempted tool call is audited, shell commands pass through explicit permission levels, and long-running tools can stream normalized `dh run` tool events.

## Scope

In scope:

- Core catalog metadata for `read`, `write`, `edit`, `shell`, `glob`, `grep`, `apply_patch`, `todo`, `task`, `semantic_search`, `graph_find_symbol`, `graph_find_references`, and `graph_call_hierarchy`.
- Zod-backed input validation in one schema module.
- A `ToolRunner` service under `packages/opencode-app/src/tools`.
- Repository-root path containment for filesystem tools.
- Read/search tools that execute safely inside the repository.
- Write/edit tools that require explicit permission and stay inside the repository.
- Shell permission levels: `deny`, `ask`, `allow`, `auto_approve_with_policy`.
- Strict shell substitution rules for automatic approval.
- Streaming `tool.started`, `tool.delta`, `tool.finished`, and `permission.requested` events through an event sink.
- Tool result truncation metadata.
- Audit records for called, succeeded, failed, and permission-required attempts using the existing `tool_usage_audit` surface.
- Runtime enforcer compatibility for both legacy `bash` and new `shell` tool names.
- Parity/doctor text updates that describe tool runtime as partial, not full OpenCode tool parity.

Out of scope:

- Full model tool-call loop inside provider streaming.
- Interactive permission UI.
- Full `apply_patch` parser/executor.
- Subagent process spawning for `task`.
- LSP-backed graph operations.
- Web search/web fetch.

## Architecture

Tool code lives in a new `packages/opencode-app/src/tools` boundary:

- `schemas.ts` owns tool names, Zod schemas, input parsing, permission vocabulary, and result envelope types.
- `tool-registry.ts` owns catalog metadata and lookup helpers.
- Individual tool files own execution for one family: read, write, edit, shell, search, todo, and task.
- `tool-runner.ts` is the only public executor. It validates input, audits the call, evaluates permission, emits events, invokes the implementation, records final audit status, and returns a normalized result envelope.

The runner is dependency-injected for tests and future runtime integration. Its default dependencies use the existing SQLite audit repository and DH shell guard. `dh run` can later pass its `SessionEventStream.emit` method as the event sink without changing tool implementation code.

## Permission Model

All tool calls use `ToolPermissionLevel`:

- `deny`: block before execution.
- `ask`: emit `permission.requested` and return a permission-required result without executing.
- `allow`: execute after validation and containment checks.
- `auto_approve_with_policy`: execute only if the tool category is auto-safe. Shell additionally uses strict `evaluateBashCommand` rules; commands matching DH substitution rules are blocked.

Default policy:

- `read`, `glob`, `grep`, `semantic_search`, and graph read tools may auto-approve.
- `write`, `edit`, `apply_patch`, and `task` require ask/allow unless a caller explicitly overrides policy.
- `shell` defaults to `ask`; `--auto-approve` maps to `auto_approve_with_policy`.

## Tool Behavior

Filesystem tools resolve every user path relative to `repoRoot` and reject traversal outside the repository.

`read` returns text with line offset/limit support and truncation metadata.

`glob` walks the repository and returns matching file paths with a result limit.

`grep` walks text files and returns bounded line matches.

`write` creates or replaces a file only after write permission.

`edit` replaces exact text and fails if the target text is absent.

`shell` runs with `child_process.spawn`, emits streaming output chunks, applies timeout/output truncation limits, and returns stdout/stderr/exit code.

`todo` returns normalized todo state from the request. It is intentionally not persistent in this milestone.

`task` is a controlled integration point. Without an injected task executor it returns a permission-required/unsupported result; with an executor it emits bounded task output.

`apply_patch`, semantic, and graph tools are catalogued with validated inputs but return explicit unsupported results until their dedicated runtime bridges land. This keeps parity reporting truthful.

## Error Handling

- Unknown tool names fail before permission evaluation and do not execute.
- Invalid input returns a failed tool result with validation issues.
- Path escape attempts fail with a deterministic message.
- Permission-required calls return exit-safe result envelopes and emit `permission.requested`.
- Shell timeout kills the child process and returns a failed result.
- Output truncation always sets `truncated: true` and includes byte counts.

## Testing

Use TDD for each slice:

- Registry tests prove the catalog includes the milestone tools and correct permission metadata.
- Schema tests prove invalid input is rejected before execution.
- Runner tests prove audit, permission, event streaming, truncation, path containment, read/search/write/edit, and shell policy behavior.
- Bash guard tests prove new permission levels preserve strict substitution blocking.
- Enforcer tests prove new `shell` name routes through the same guard as legacy `bash`.
- Parity/root help tests keep the public status accurate.

Acceptance commands:

- `npm test -- tool-registry tool-runner bash-guard runtime-enforcer hook-enforcer parity-report root`
- `npm run check`
- `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine hooks`
