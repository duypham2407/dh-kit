# Tool Runtime And Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a validated, audited, permission-bound core tool runtime for DH.

**Architecture:** Tool schemas, metadata, and execution live under `packages/opencode-app/src/tools`. `ToolRunner` is the single execution boundary: validate input, audit the attempt, evaluate permission, emit normalized run events, execute the tool, truncate output, and audit the final state.

**Tech Stack:** TypeScript ESM, Zod, Vitest, Node `fs/path/child_process`, existing `SessionEventStream`, `ToolUsageAuditRepo`, `RuntimeEnforcer`, and bash guard primitives.

---

## File Structure

- Create: `packages/opencode-app/src/tools/schemas.ts`
  - Tool names, Zod schemas, permission levels, normalized result envelope types.
- Create: `packages/opencode-app/src/tools/tool-registry.ts`
  - Core catalog metadata and lookup helpers.
- Create: `packages/opencode-app/src/tools/read-tool.ts`
  - Repository-contained text file reads with line slicing and truncation.
- Create: `packages/opencode-app/src/tools/search-tool.ts`
  - Repository-contained `glob` and `grep` operations.
- Create: `packages/opencode-app/src/tools/write-tool.ts`
  - Repository-contained file writes behind permission.
- Create: `packages/opencode-app/src/tools/edit-tool.ts`
  - Exact text replacement behind permission.
- Create: `packages/opencode-app/src/tools/shell-tool.ts`
  - Permission-bound shell execution with streaming chunks, timeout, and truncation.
- Create: `packages/opencode-app/src/tools/todo-tool.ts`
  - Normalized non-persistent todo result.
- Create: `packages/opencode-app/src/tools/task-tool.ts`
  - Controlled task executor integration point.
- Create: `packages/opencode-app/src/tools/tool-runner.ts`
  - Validation, permission, audit, event emission, execution dispatch.
- Create tests next to the new modules.
- Modify: `packages/opencode-app/src/executor/enforce-tool-usage.ts`
  - Treat catalogued structured tools as valid, keep legacy OS-tool aliases blocked.
- Modify: `packages/runtime/src/hooks/bash-guard.ts`
  - Add shell permission-level evaluation while preserving existing strict/advisory behavior.
- Modify: `packages/runtime/src/hooks/runtime-enforcer.ts`
  - Route both `bash` and `shell` through shell guard/audit.
- Modify: `packages/opencode-app/src/executor/hook-enforcer.test.ts`
  - Update blocked-tool expectation to reflect structured `grep` support.
- Modify: `packages/runtime/src/diagnostics/parity-report.ts`
  - Report tool runtime catalog as landed while keeping unsupported integrations visible.
- Modify: `apps/cli/src/commands/root.ts`
  - Update public help limitations.

## Task 1: Tool Catalog And Schemas

- [ ] Write failing tests in `packages/opencode-app/src/tools/tool-registry.test.ts` proving the catalog includes all milestone tool names and exposes permission/streaming metadata.
- [ ] Write failing tests in `packages/opencode-app/src/tools/schemas.test.ts` proving invalid read/shell/grep/write inputs are rejected.
- [ ] Run `npm test -- tool-registry schemas` and verify failure because modules do not exist.
- [ ] Implement `packages/opencode-app/src/tools/schemas.ts`.
- [ ] Implement `packages/opencode-app/src/tools/tool-registry.ts`.
- [ ] Run `npm test -- tool-registry schemas` and verify pass.
- [ ] Commit `feat: add tool catalog schemas`.

## Task 2: Read/Search/Mutation Tool Implementations

- [ ] Write failing tests for read/glob/grep/write/edit containment, truncation, and exact replacement.
- [ ] Run `npm test -- read-tool search-tool write-tool edit-tool` and verify failure.
- [ ] Implement `read-tool.ts`, `search-tool.ts`, `write-tool.ts`, and `edit-tool.ts`.
- [ ] Run `npm test -- read-tool search-tool write-tool edit-tool` and verify pass.
- [ ] Commit `feat: add filesystem tool implementations`.

## Task 3: Shell Permission Levels And Execution

- [ ] Write failing bash guard tests for `deny`, `ask`, `allow`, and `auto_approve_with_policy`.
- [ ] Write failing shell tool tests for streaming output, strict auto-approval blocking, timeout, and truncation.
- [ ] Run `npm test -- bash-guard shell-tool` and verify failure.
- [ ] Extend `packages/runtime/src/hooks/bash-guard.ts`.
- [ ] Implement `packages/opencode-app/src/tools/shell-tool.ts`.
- [ ] Run `npm test -- bash-guard shell-tool` and verify pass.
- [ ] Commit `feat: add shell tool permission execution`.

## Task 4: Tool Runner, Audit, And Events

- [ ] Write failing `packages/opencode-app/src/tools/tool-runner.test.ts` tests for validation failure, permission request, audit records, event order, read execution, shell execution, and unsupported task behavior.
- [ ] Run `npm test -- tool-runner` and verify failure.
- [ ] Implement `todo-tool.ts`, `task-tool.ts`, and `tool-runner.ts`.
- [ ] Run `npm test -- tool-runner` and verify pass.
- [ ] Commit `feat: add audited tool runner`.

## Task 5: Runtime Enforcer And Public Status

- [ ] Write/update failing tests for `runtime-enforcer`, `hook-enforcer`, `enforce-tool-usage`, `parity-report`, and `root`.
- [ ] Run `npm test -- runtime-enforcer hook-enforcer enforce-tool-usage parity-report root` and verify failure.
- [ ] Update `enforce-tool-usage.ts`, `runtime-enforcer.ts`, parity report, and root help text.
- [ ] Run `npm test -- runtime-enforcer hook-enforcer enforce-tool-usage parity-report root`.
- [ ] Run `npm test -- tool-registry schemas read-tool search-tool write-tool edit-tool shell-tool tool-runner bash-guard runtime-enforcer hook-enforcer parity-report root`.
- [ ] Run `npm run check`.
- [ ] Run `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine hooks`.
- [ ] Commit `docs: update tool runtime parity status`.
