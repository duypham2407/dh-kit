# Agent/Subagent Runtime Design

## Goal

Milestone 7 reconciles DH workflow roles with OpenCode-style selectable agents and controlled subagents.

Users should be able to list built-in agents, create repo-local custom agents, select them with `dh run --agent <id>`, and have the task tool use a bounded subagent executor instead of an untracked ad hoc prompt.

## Scope

In scope:

- Built-in agent descriptors: `build`, `plan`, `general`, `quick`, `analyst`, `architect`, `implementer`, `reviewer`, `tester`, and existing compatibility ids.
- Repo-local user-defined agent config under `.dh/agents/agents.json`.
- `dh agent list [--json]`.
- `dh agent create --id <id> --mode <primary|subagent> --prompt <text> [--model <provider/model>] [--permission <name>]`.
- Agent resolution for `dh run --agent <id>`.
- Per-agent permission policy metadata that future tool calls can use.
- A controlled subagent runtime for the task tool with bounded output and no implicit filesystem writes.
- Tests for agent config persistence, CLI rendering, run agent resolution, and task subagent execution.

Out of scope:

- Full multi-agent scheduler.
- Parallel subagent orchestration.
- Rich prompt-template inheritance.
- Remote agent marketplace.
- Interactive agent editor UI.

## Architecture

Agent code lives under `packages/opencode-app/src/agent`:

- `agent-config-service.ts` owns `.dh/agents/agents.json` persistence, built-in merge, validation, and public list/create reports.
- `agent-runtime.ts` resolves agents for `dh run` and maps agent descriptors to existing `AgentRegistryEntry` fields.
- `subagent-runtime.ts` creates a task-tool executor that runs a bounded provider call or deterministic fallback and returns a capped string result.

Shared agent types are extended in `packages/shared/src/types/agent.ts`; built-ins remain in `packages/shared/src/constants/roles.ts` so existing session/envelope code keeps a single registry source.

CLI parsing stays in `apps/cli/src/commands/agent.ts`. The CLI does not execute agents directly; it manages configuration and renders reports.

## Permission Model

Agent descriptors carry a named permission policy:

- `read_only`: read/search/graph/todo only.
- `standard`: read/search plus explicit ask for writes, shell, and task.
- `builder`: read/search plus ask for shell/write/edit/task.
- `restricted`: all mutating or shell tools denied unless explicitly overridden later.

Milestone 7 stores and exposes this policy. Milestone 8+ can wire it into model tool-call loops. For `task`, the subagent runtime always returns bounded text and does not write files.

## Error Handling

- Duplicate custom agent ids fail deterministically.
- Built-in ids cannot be overwritten by `agent create`.
- Invalid model strings must use `provider/model`.
- Invalid mode or permission names fail before writing config.
- Malformed `.dh/agents/agents.json` throws a clear parse error.
- `dh run --agent <missing>` fails clearly instead of silently falling back to quick-agent.

## Testing

Use TDD:

- Agent config service tests for built-ins, create, duplicate refusal, malformed store, and model parsing.
- Agent CLI tests for list/create JSON and plain output.
- Run-direct tests proving custom agent resolution and missing agent errors.
- Task/subagent tests proving bounded output and fallback behavior.
- Root help and parity tests update public status.

Acceptance commands:

- `npm test -- agent agent-config-service agent-runtime subagent-runtime run-direct-command tool-runner root parity-report`
- `npm run check`
