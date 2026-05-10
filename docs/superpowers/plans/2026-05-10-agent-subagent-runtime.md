# Agent/Subagent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable built-in/custom agents and a bounded task subagent runtime.

**Architecture:** Extend shared agent descriptors, add a repo-local agent config service, register an `agent` CLI command, resolve `dh run --agent` through the agent runtime, and provide a bounded task-tool executor for subagent calls.

**Tech Stack:** TypeScript ESM, Vitest, Node `fs/path`, existing CLI command pattern, existing `RunDirectCommand`, existing `ToolRunner` task executor hook.

---

## File Structure

- Modify: `packages/shared/src/types/agent.ts`
  - Add agent mode, permission policy, prompt/model fields, and report types.
- Modify: `packages/shared/src/constants/roles.ts`
  - Add OpenCode-style built-ins while preserving existing ids.
- Create: `packages/opencode-app/src/agent/agent-config-service.ts`
  - Built-in/custom merge, local `.dh/agents/agents.json` persistence, list/create validation.
- Create: `packages/opencode-app/src/agent/agent-runtime.ts`
  - Resolve agent ids for `dh run`.
- Create: `packages/opencode-app/src/agent/subagent-runtime.ts`
  - Bounded task executor for `ToolRunner`.
- Create tests next to each new module.
- Create: `apps/cli/src/commands/agent.ts`
  - `agent list/create` parser and renderer.
- Create: `apps/cli/src/commands/agent.test.ts`
  - CLI coverage.
- Modify: `apps/cli/src/commands/root.ts`
  - Register `agent`.
- Modify: `packages/opencode-app/src/workflows/run-direct-command.ts`
  - Resolve agents through `AgentRuntime` and fail missing ids clearly.
- Modify: `packages/runtime/src/diagnostics/parity-report.ts`
  - Remove `agent` from missing command surfaces while keeping advanced subagent gaps visible.

## Task 1: Shared Types And Built-In Agents

- [ ] Write failing tests for built-in agent descriptors and permission metadata.
- [ ] Run `npm test -- agent-config-service` and verify failure because service does not exist.
- [ ] Extend shared agent types and constants.
- [ ] Implement `agent-config-service.ts`.
- [ ] Run `npm test -- agent-config-service`.
- [ ] Commit `feat: add agent config service`.

## Task 2: Agent CLI

- [ ] Write failing `apps/cli/src/commands/agent.test.ts` tests for list/create/errors.
- [ ] Run `npm test -- agent root` and verify failure.
- [ ] Implement `apps/cli/src/commands/agent.ts`.
- [ ] Register root command/help.
- [ ] Run `npm test -- agent root`.
- [ ] Commit `feat: add agent lifecycle cli`.

## Task 3: Run Agent Resolution

- [ ] Write failing `agent-runtime` and `run-direct-command` tests for custom agent selection and missing agent refusal.
- [ ] Run `npm test -- agent-runtime run-direct-command` and verify failure.
- [ ] Implement `agent-runtime.ts` and wire `run-direct-command`.
- [ ] Run `npm test -- agent-runtime run-direct-command`.
- [ ] Commit `feat: resolve run agents from registry`.

## Task 4: Task Subagent Runtime

- [ ] Write failing `subagent-runtime` and `tool-runner` tests for bounded task results.
- [ ] Run `npm test -- subagent-runtime tool-runner` and verify failure.
- [ ] Implement `subagent-runtime.ts` and expose task executor integration.
- [ ] Run `npm test -- subagent-runtime tool-runner`.
- [ ] Commit `feat: add bounded subagent task runtime`.

## Task 5: Parity And Verification

- [ ] Update parity tests so `agent` command is no longer missing while advanced scheduling remains a gap.
- [ ] Update parity report/root status.
- [ ] Run `npm test -- agent agent-config-service agent-runtime subagent-runtime run-direct-command tool-runner root parity-report`.
- [ ] Run `npm run check`.
- [ ] Commit `docs: update agent runtime parity status`.
