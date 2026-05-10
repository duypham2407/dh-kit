# MCP Lifecycle Option A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local MCP lifecycle CLI commands and redacted debug/status reports without implementing full MCP stdio runtime or OAuth callbacks.

**Architecture:** Keep MCP lifecycle in `packages/opencode-app/src/mcp`, with CLI modules only parsing and rendering. Store local command-based MCP config in `.dh/mcp/servers.json`, merge it with `DEFAULT_MCP_REGISTRY`, and expose public DTOs that never include raw env or token values.

**Tech Stack:** TypeScript ESM, Vitest, Node `fs/path`, existing MCP registry/auth status primitives, existing CLI command pattern.

---

## File Structure

- Create: `packages/shared/src/types/mcp.ts`
  - Shared MCP lifecycle DTOs and status vocabulary.
- Create: `packages/opencode-app/src/mcp/mcp-config-service.ts`
  - Local `.dh/mcp/servers.json` persistence, merge/list/add/logout, redaction.
- Create: `packages/opencode-app/src/mcp/mcp-config-service.test.ts`
  - Store, merge, auth status, redaction, malformed file behavior.
- Create: `packages/opencode-app/src/mcp/mcp-debug.ts`
  - Debug report shaping for default/local MCP entries.
- Create: `packages/opencode-app/src/mcp/mcp-debug.test.ts`
  - Debug reports do not leak env/token values.
- Create: `apps/cli/src/commands/mcp.ts`
  - `dh mcp list/add/auth/logout/debug` parser and renderer.
- Create: `apps/cli/src/commands/mcp.test.ts`
  - CLI JSON/plain rendering and validation errors.
- Modify: `apps/cli/src/commands/root.ts`
  - Register `mcp` and help text.
- Modify: `apps/cli/src/commands/root.test.ts`
  - Help assertion.
- Modify: `packages/runtime/src/diagnostics/parity-report.ts`
  - Remove `mcp` from missing command surfaces, keep runtime/OAuth gaps.
- Modify: `packages/runtime/src/diagnostics/parity-report.test.ts`
  - Updated parity expectations.

## Task 1: Shared MCP Types And Config Service

- [ ] Write failing tests for add/list/logout/redaction in `packages/opencode-app/src/mcp/mcp-config-service.test.ts`.
- [ ] Run `npm test -- mcp-config-service` and verify it fails because the service/types do not exist.
- [ ] Add `packages/shared/src/types/mcp.ts`.
- [ ] Implement `packages/opencode-app/src/mcp/mcp-config-service.ts`.
- [ ] Run `npm test -- mcp-config-service` and verify it passes.
- [ ] Commit `feat: add local mcp config service`.

## Task 2: MCP Debug Reports

- [ ] Write failing debug tests in `packages/opencode-app/src/mcp/mcp-debug.test.ts`.
- [ ] Run `npm test -- mcp-debug` and verify it fails.
- [ ] Implement `packages/opencode-app/src/mcp/mcp-debug.ts`.
- [ ] Run `npm test -- mcp-debug mcp-config-service` and verify it passes.
- [ ] Commit `feat: add mcp debug reports`.

## Task 3: MCP CLI

- [ ] Write failing CLI tests in `apps/cli/src/commands/mcp.test.ts` and root help assertions.
- [ ] Run `npm test -- mcp root` and verify it fails.
- [ ] Implement `apps/cli/src/commands/mcp.ts`.
- [ ] Register `mcp` in `apps/cli/src/commands/root.ts`.
- [ ] Run `npm test -- mcp root` and verify it passes.
- [ ] Commit `feat: add mcp lifecycle cli`.

## Task 4: Parity And Verification

- [ ] Update parity tests so `mcp` command is no longer listed as missing.
- [ ] Update `packages/runtime/src/diagnostics/parity-report.ts`.
- [ ] Run `npm test -- parity-report doctor`.
- [ ] Run `npm test -- mcp mcp-config-service mcp-debug root parity-report`.
- [ ] Run `npm run check`.
- [ ] Commit `docs: update mcp parity status`.

