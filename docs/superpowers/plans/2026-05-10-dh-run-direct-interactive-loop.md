# `dh run` Direct Interactive Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Rust-hosted `dh run` direct assistant command with normalized event output.

**Architecture:** Rust owns launch, worker supervision, cancellation, cleanup, top-level exit, and final lifecycle envelope for `run`. TypeScript owns the worker body: session resolution, prompt/file context assembly, provider call, event persistence, and CLI rendering. JSON CLI output is NDJSON run events; Rust-hosted adapter calls consume the Rust JSON envelope.

**Tech Stack:** TypeScript ESM CLI/runtime packages, Vitest, Rust `dh-engine`, Cargo tests, SQLite session/runtime-event persistence, existing JSON-RPC stdio worker protocol.

---

## File Structure

- Create: `packages/shared/src/types/run.ts`
  - Shared `RunEvent`, `RunEventType`, `RunDirectInput`, `RunDirectReport`, and attachment types.
- Modify: `packages/shared/src/types/session-runtime.ts`
  - Allow run event names in `SessionRuntimeEventType`.
- Create: `packages/runtime/src/session/session-event-stream.ts`
  - Ordered event collector and persistence wrapper.
- Create: `packages/runtime/src/session/session-event-stream.test.ts`
  - Tests ordering and persistence.
- Modify: `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
  - Add event-type listing helper for latest run session lookup.
- Modify: `packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts`
  - Test event-type listing.
- Create: `packages/opencode-app/src/workflows/run-direct-command.ts`
  - Worker-body implementation for `session.runDirect`.
- Create: `packages/opencode-app/src/workflows/run-direct-command.test.ts`
  - Tests streaming, non-streaming, attachments, continue/session/fork, and degraded offline fallback.
- Create: `packages/opencode-app/src/workflows/run-rust-hosted-direct-command.ts`
  - TypeScript adapter that invokes `dh-engine run ... --json`.
- Create: `packages/opencode-app/src/workflows/run-rust-hosted-direct-command.test.ts`
  - Tests Rust envelope adaptation and malformed JSON degradation.
- Create: `apps/cli/src/presenters/run-event.ts`
  - Plain text and NDJSON renderers.
- Create: `apps/cli/src/presenters/run-event.test.ts`
  - Tests renderer behavior.
- Create: `apps/cli/src/commands/run.ts`
  - CLI argument parser and command entry.
- Create: `apps/cli/src/commands/run.test.ts`
  - Tests parsing, validation, rendering, and runtime invocation.
- Modify: `apps/cli/src/runtime-client.ts`
  - Add `runDirect`.
- Modify: `apps/cli/src/commands/root.ts`
  - Register `run` and help text.
- Modify: `apps/cli/src/commands/root.test.ts`
  - Verify help and dispatch.
- Modify: `packages/opencode-app/src/worker/worker-command-router.ts`
  - Add `runDirect`.
- Modify: `packages/opencode-app/src/worker/worker-main.ts`
  - Add `session.runDirect` schema and handler.
- Modify: `packages/opencode-app/src/worker/worker-main.test.ts`
  - Test worker method.
- Modify: `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - Advertise `session.runDirect` and mark run runtime authority supported.
- Modify: `rust-engine/crates/dh-engine/src/host_lifecycle.rs`
  - Move run family state from `planned` to `supported`.
- Modify: `rust-engine/crates/dh-engine/src/host_commands.rs`
  - Add `HostRunCommandRequest`, `run_hosted_direct_command`, run envelope helpers.
- Modify: `rust-engine/crates/dh-engine/src/main.rs`
  - Parse `run` command and flags.
- Modify: `rust-engine/crates/dh-engine/src/bridge.rs`
  - Update initialize capabilities/tests for `session.runDirect`.
- Modify: `rust-engine/crates/dh-engine/tests/host_contract_cli_test.rs`
  - Test `dh-engine run` JSON envelope.
- Modify: `packages/runtime/src/diagnostics/parity-report.ts`
  - Remove `run` from missing command surfaces and mark direct run loop present.
- Modify: `packages/runtime/src/diagnostics/parity-report.test.ts`
  - Test updated parity truth.
- Modify: `packages/runtime/src/diagnostics/doctor.test.ts`
  - Verify doctor parity includes `run`.

## Event Contract

All run events use this shared shape:

```ts
type RunEventBase<TType extends string, TPayload extends Record<string, unknown>> = {
  type: TType;
  sessionId: string;
  sequence: number;
  timestamp: string;
  payload: TPayload;
};
```

Required event names:

```ts
type RunEventType =
  | "session.created"
  | "message.started"
  | "text.delta"
  | "tool.started"
  | "tool.delta"
  | "tool.finished"
  | "permission.requested"
  | "message.finished"
  | "session.finished"
  | "runtime.degraded";
```

The MVP must not emit successful tool execution unless a real tool runner exists. Tool events are vocabulary only until later milestones.

## Task 1: Shared Run Event Stream Contract

**Files:**
- Create: `packages/shared/src/types/run.ts`
- Modify: `packages/shared/src/types/session-runtime.ts`
- Create: `packages/runtime/src/session/session-event-stream.ts`
- Create: `packages/runtime/src/session/session-event-stream.test.ts`

- [ ] **Step 1: Write failing event stream tests**

Create `packages/runtime/src/session/session-event-stream.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { SessionEventStream } from "./session-event-stream.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-run-events-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string): SessionState {
  return {
    sessionId: "session-run-1",
    repoRoot,
    lane: "quick",
    laneLocked: true,
    currentStage: "quick_plan",
    status: "in_progress",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: [],
    semanticMode: "always",
    toolEnforcementLevel: "very-hard",
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos = [];
});

describe("SessionEventStream", () => {
  it("emits ordered run events and persists them as session runtime events", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    const stream = new SessionEventStream({ repoRoot: repo, sessionId: "session-run-1" });

    stream.emit("session.created", { commandFamily: "run", title: "Inspect repo" });
    stream.emit("message.started", { role: "assistant" });
    stream.emit("text.delta", { text: "hello" });
    stream.emit("session.finished", { finalStatus: "clean_success" });

    expect(stream.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(stream.events.map((event) => event.type)).toEqual([
      "session.created",
      "message.started",
      "text.delta",
      "session.finished",
    ]);

    const persisted = new SessionRuntimeEventsRepo(repo).listBySession("session-run-1");
    expect(persisted.map((event) => event.eventType)).toEqual([
      "session.finished",
      "text.delta",
      "message.started",
      "session.created",
    ]);
    expect(persisted[0]?.eventJson).toMatchObject({
      type: "session.finished",
      sequence: 4,
      payload: { finalStatus: "clean_success" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- session-event-stream`

Expected: FAIL because `SessionEventStream` and run types do not exist.

- [ ] **Step 3: Add shared run types**

Create `packages/shared/src/types/run.ts`:

```ts
import type { RuntimeAuthorityFields } from "./runtime-authority.js";

export type RunEventType =
  | "session.created"
  | "message.started"
  | "text.delta"
  | "tool.started"
  | "tool.delta"
  | "tool.finished"
  | "permission.requested"
  | "message.finished"
  | "session.finished"
  | "runtime.degraded";

export type RunEventPayload = Record<string, unknown>;

export type RunEvent<TType extends RunEventType = RunEventType> = {
  type: TType;
  sessionId: string;
  sequence: number;
  timestamp: string;
  payload: RunEventPayload;
};

export type RunFileAttachment = {
  path: string;
  content: string;
  byteLength: number;
};

export type RunDirectInput = {
  message: string;
  repoRoot: string;
  continueLatest?: boolean;
  sessionId?: string;
  fork?: boolean;
  model?: string;
  agentId?: string;
  variant?: string;
  files?: string[];
  title?: string;
  autoApprove?: boolean;
};

export type RunDirectReport = RuntimeAuthorityFields & {
  exitCode: number;
  command: "run";
  sessionId: string;
  model: string;
  agentId: string;
  title?: string;
  text: string;
  events: RunEvent[];
  files: Array<Omit<RunFileAttachment, "content">>;
};
```

Modify `packages/shared/src/types/session-runtime.ts`:

```ts
import type { RunEventType } from "./run.js";

export type SessionRuntimeEventType =
  | RunEventType
  | "busy"
  | "idle"
  | "cancel"
  | "retry"
  | "retry_give_up"
  | "summary_updated"
  | "compaction"
  | "checkpoint_created"
  | "revert";
```

- [ ] **Step 4: Implement `SessionEventStream`**

Create `packages/runtime/src/session/session-event-stream.ts`:

```ts
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import type { RunEvent, RunEventPayload, RunEventType } from "../../../shared/src/types/run.js";
import { nowIso } from "../../../shared/src/utils/time.js";

export class SessionEventStream {
  readonly events: RunEvent[] = [];
  private readonly eventsRepo: SessionRuntimeEventsRepo;
  private sequence = 0;

  constructor(private readonly input: { repoRoot: string; sessionId: string }) {
    this.eventsRepo = new SessionRuntimeEventsRepo(input.repoRoot);
  }

  emit<TType extends RunEventType>(type: TType, payload: RunEventPayload = {}): RunEvent<TType> {
    const event: RunEvent<TType> = {
      type,
      sessionId: this.input.sessionId,
      sequence: this.sequence + 1,
      timestamp: nowIso(),
      payload,
    };
    this.sequence = event.sequence;
    this.events.push(event);
    this.eventsRepo.save({
      sessionId: this.input.sessionId,
      eventType: type,
      eventJson: event,
      createdAt: event.timestamp,
    });
    return event;
  }
}
```

- [ ] **Step 5: Run tests to verify GREEN**

Run: `npm test -- session-event-stream`

Expected: PASS.

## Task 2: Runtime Event Repository Helpers

**Files:**
- Modify: `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
- Modify: `packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts`

- [ ] **Step 1: Add failing repository helper test**

Add to `packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts`:

```ts
  it("lists run events by event type for latest run-session lookup", () => {
    const repo = makeRepo();
    const sessionsRepo = new SessionsRepo(repo);
    sessionsRepo.save({ ...makeSession(repo), sessionId: "session-old" });
    sessionsRepo.save({ ...makeSession(repo), sessionId: "session-new" });
    const events = new SessionRuntimeEventsRepo(repo);

    events.save({
      sessionId: "session-old",
      eventType: "session.created",
      eventJson: { commandFamily: "run" },
      createdAt: "2026-05-10T01:00:00.000Z",
    });
    events.save({
      sessionId: "session-new",
      eventType: "session.created",
      eventJson: { commandFamily: "run" },
      createdAt: "2026-05-10T02:00:00.000Z",
    });

    expect(events.listByEventType("session.created")[0]?.sessionId).toBe("session-new");
  });
```

If `makeSession(repo)` does not exist in that test file, extract the existing inline session object into a local helper first.

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- session-runtime-events-repo`

Expected: FAIL because `listByEventType()` is missing.

- [ ] **Step 3: Implement helper**

Add to `SessionRuntimeEventsRepo`:

```ts
  listByEventType(eventType: SessionRuntimeEventType): SessionRuntimeEventRecord[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT id, session_id, event_type, event_json, created_at
      FROM session_runtime_events
      WHERE event_type = ?
      ORDER BY created_at DESC, rowid DESC
    `).all(eventType) as Array<{
      id: string;
      session_id: string;
      event_type: SessionRuntimeEventType;
      event_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      eventType: row.event_type,
      eventJson: JSON.parse(row.event_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  }
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm test -- session-runtime-events-repo`

Expected: PASS.

## Task 3: TypeScript `runDirectCommand` Body

**Files:**
- Create: `packages/opencode-app/src/workflows/run-direct-command.ts`
- Create: `packages/opencode-app/src/workflows/run-direct-command.test.ts`

- [ ] **Step 1: Write failing workflow tests**

Create `packages/opencode-app/src/workflows/run-direct-command.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";
import { runDirectCommand } from "./run-direct-command.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-run-direct-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos = [];
});

describe("runDirectCommand", () => {
  it("streams provider text into normalized run events and persists them", async () => {
    const repo = makeRepo();
    const provider: ChatProvider = {
      providerId: "mock",
      async chatStream(_request, onChunk) {
        onChunk("hello ");
        onChunk("world");
        return {
          content: "hello world",
          model: "mock-run-model",
          finishReason: "stop",
          usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
        };
      },
      async chat() {
        throw new Error("chat should not be used when chatStream exists");
      },
    };

    const report = await runDirectCommand({
      message: "say hello",
      repoRoot: repo,
      provider,
      model: "mock/run",
    });

    expect(report.exitCode).toBe(0);
    expect(report.command).toBe("run");
    expect(report.runtimeAuthority).toBe("typescript_worker");
    expect(report.text).toBe("hello world");
    expect(report.events.map((event) => event.type)).toEqual([
      "session.created",
      "message.started",
      "text.delta",
      "text.delta",
      "message.finished",
      "session.finished",
    ]);
    const persisted = new SessionRuntimeEventsRepo(repo).listBySession(report.sessionId);
    expect(persisted.some((event) => event.eventType === "text.delta")).toBe(true);
  });

  it("ingests UTF-8 text file attachments into prompt context and event metadata", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "README.md"), "Project readme");
    let prompt = "";
    const provider: ChatProvider = {
      providerId: "mock",
      async chat(request) {
        prompt = request.messages.map((message) => message.content).join("\n");
        return {
          content: "read file",
          model: "mock",
          finishReason: "stop",
          usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
        };
      },
    };

    const report = await runDirectCommand({
      message: "explain file",
      repoRoot: repo,
      files: ["README.md"],
      provider,
    });

    expect(prompt).toContain("README.md");
    expect(prompt).toContain("Project readme");
    expect(report.files).toEqual([{ path: "README.md", byteLength: Buffer.byteLength("Project readme") }]);
    expect(report.events[0]?.payload).toMatchObject({ files: ["README.md"] });
  });

  it("returns degraded offline output when no provider is available", async () => {
    const repo = makeRepo();
    const report = await runDirectCommand({
      message: "summarize repo",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.finalStatus).toBe("degraded_success");
    expect(report.degradedReason).toContain("provider");
    expect(report.events.some((event) => event.type === "runtime.degraded")).toBe(true);
    expect(report.text).toContain("summarize repo");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- run-direct-command`

Expected: FAIL because `run-direct-command.ts` does not exist.

- [ ] **Step 3: Implement workflow**

Create `packages/opencode-app/src/workflows/run-direct-command.ts` with:

```ts
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import type { RunDirectReport, RunFileAttachment } from "../../../shared/src/types/run.js";
import { SessionManager } from "../../../runtime/src/session/session-manager.js";
import { SessionEventStream } from "../../../runtime/src/session/session-event-stream.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";

export async function runDirectCommand(input: {
  message: string;
  repoRoot: string;
  continueLatest?: boolean;
  sessionId?: string;
  fork?: boolean;
  model?: string;
  agentId?: string;
  variant?: string;
  files?: string[];
  title?: string;
  autoApprove?: boolean;
  provider?: ChatProvider;
}): Promise<RunDirectReport> {
  const agent = DEFAULT_AGENT_REGISTRY.find((entry) => entry.agentId === (input.agentId ?? "quick-agent"))
    ?? DEFAULT_AGENT_REGISTRY[0]!;
  const sessionManager = new SessionManager(input.repoRoot);
  const created = await sessionManager.createSession("quick", agent, { runtimeAuthority: "rust_host" });
  const attachments = readTextAttachments(input.repoRoot, input.files ?? []);
  const stream = new SessionEventStream({ repoRoot: input.repoRoot, sessionId: created.session.sessionId });
  const filePaths = attachments.map((file) => file.path);

  stream.emit("session.created", {
    commandFamily: "run",
    title: input.title ?? input.message.slice(0, 80),
    files: filePaths,
    autoApprove: Boolean(input.autoApprove),
  });

  const model = input.model ?? `${created.envelope.resolvedModel.providerId}/${created.envelope.resolvedModel.modelId}`;
  let text = "";
  let finalStatus: RunDirectReport["finalStatus"] = "clean_success";
  let degradedReason: string | null = null;

  stream.emit("message.started", { role: "assistant", model });
  if (input.provider?.chatStream) {
    const response = await input.provider.chatStream({
      messages: [{ role: "user", content: buildPrompt(input.message, attachments) }],
      model,
    }, (chunk) => {
      text += chunk;
      stream.emit("text.delta", { text: chunk });
    });
    if (!text) {
      text = response.content;
      stream.emit("text.delta", { text });
    }
  } else if (input.provider) {
    const response = await input.provider.chat({
      messages: [{ role: "user", content: buildPrompt(input.message, attachments) }],
      model,
    });
    text = response.content;
    stream.emit("text.delta", { text });
  } else {
    finalStatus = "degraded_success";
    degradedReason = "No provider was available; returned deterministic offline run output.";
    text = `Offline run response for: ${input.message || "continued session"}`;
    stream.emit("runtime.degraded", { reason: degradedReason });
    stream.emit("text.delta", { text });
  }
  stream.emit("message.finished", { textLength: text.length });
  stream.emit("session.finished", { finalStatus });

  return {
    exitCode: 0,
    command: "run",
    sessionId: created.session.sessionId,
    model,
    agentId: agent.agentId,
    title: input.title,
    text,
    events: stream.events,
    files: attachments.map(({ path, byteLength }) => ({ path, byteLength })),
    runtimeAuthority: "typescript_worker",
    finalStatus,
    degradedReason,
  };
}

function buildPrompt(message: string, attachments: RunFileAttachment[]): string {
  const fileContext = attachments.map((file) => `File: ${file.path}\n${file.content}`).join("\n\n");
  return [fileContext, message].filter(Boolean).join("\n\n");
}

function readTextAttachments(repoRoot: string, files: string[]): RunFileAttachment[] {
  return files.map((file) => {
    const absolute = path.resolve(repoRoot, file);
    const relative = path.relative(repoRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`File attachment '${file}' is outside the repository.`);
    }
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) {
      throw new Error(`File attachment '${file}' is not a file.`);
    }
    const buffer = fs.readFileSync(absolute);
    const content = buffer.toString("utf8");
    if (content.includes("\uFFFD")) {
      throw new Error(`File attachment '${file}' is not valid UTF-8 text.`);
    }
    return { path: relative, content, byteLength: buffer.byteLength };
  });
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- run-direct-command session-event-stream`

Expected: PASS.

## Task 4: Continue, Specific Session, And Fork Semantics

**Files:**
- Modify: `packages/opencode-app/src/workflows/run-direct-command.ts`
- Modify: `packages/opencode-app/src/workflows/run-direct-command.test.ts`
- Modify: `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`

- [ ] **Step 1: Add failing session targeting tests**

Add to `run-direct-command.test.ts`:

```ts
  it("continues the latest run session", async () => {
    const repo = makeRepo();
    const first = await runDirectCommand({ message: "first", repoRoot: repo });
    const second = await runDirectCommand({ message: "second", repoRoot: repo });
    const continued = await runDirectCommand({ message: "continue", repoRoot: repo, continueLatest: true });

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(continued.sessionId).toBe(second.sessionId);
    expect(continued.events[0]?.payload).toMatchObject({ continued: true });
  });

  it("targets a specific run session", async () => {
    const repo = makeRepo();
    const first = await runDirectCommand({ message: "first", repoRoot: repo });
    await runDirectCommand({ message: "second", repoRoot: repo });
    const targeted = await runDirectCommand({ message: "target", repoRoot: repo, sessionId: first.sessionId });

    expect(targeted.sessionId).toBe(first.sessionId);
  });

  it("forks a specific run session into a new session with source metadata", async () => {
    const repo = makeRepo();
    const source = await runDirectCommand({ message: "source", repoRoot: repo });
    const forked = await runDirectCommand({ message: "forked", repoRoot: repo, sessionId: source.sessionId, fork: true });

    expect(forked.sessionId).not.toBe(source.sessionId);
    expect(forked.events[0]?.payload).toMatchObject({ forkedFromSessionId: source.sessionId });
  });
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- run-direct-command`

Expected: FAIL because current implementation always creates a new session.

- [ ] **Step 3: Implement session resolution**

Add helpers in `run-direct-command.ts`:

```ts
async function resolveRunSession(input: {
  repoRoot: string;
  sessionManager: SessionManager;
  agent: typeof DEFAULT_AGENT_REGISTRY[number];
  continueLatest?: boolean;
  sessionId?: string;
  fork?: boolean;
}) {
  if (input.fork && !input.sessionId) {
    throw new Error("--fork requires --session <id>.");
  }
  if (input.continueLatest && input.sessionId) {
    throw new Error("--continue cannot be combined with --session.");
  }
  if (input.continueLatest) {
    const latest = findLatestRunSessionId(input.repoRoot);
    if (!latest) {
      return { ...(await input.sessionManager.createSession("quick", input.agent, { runtimeAuthority: "rust_host" })), continued: false };
    }
    const read = await input.sessionManager.readSession(latest);
    if (!read) throw new Error(`Latest run session '${latest}' could not be read.`);
    return { session: read.session, envelope: read.envelopes[read.envelopes.length - 1]!, runtimeAuthority: "rust_host" as const, continued: true };
  }
  if (input.sessionId && !input.fork) {
    const read = await input.sessionManager.readSession(input.sessionId);
    if (!read) throw new Error(`Run session '${input.sessionId}' could not be read.`);
    return { session: read.session, envelope: read.envelopes[read.envelopes.length - 1]!, runtimeAuthority: "rust_host" as const, continued: true };
  }
  return { ...(await input.sessionManager.createSession("quick", input.agent, { runtimeAuthority: "rust_host" })), continued: false, forkedFromSessionId: input.sessionId };
}
```

Add `findLatestRunSessionId(repoRoot)` using `SessionRuntimeEventsRepo.listByEventType("session.created")` and filtering `eventJson.payload.commandFamily === "run"`.

Set `session.created` payload:

```ts
stream.emit("session.created", {
  commandFamily: "run",
  continued: resolved.continued,
  forkedFromSessionId: resolved.forkedFromSessionId,
  title: input.title ?? input.message.slice(0, 80),
  files: filePaths,
  autoApprove: Boolean(input.autoApprove),
});
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- run-direct-command session-runtime-events-repo`

Expected: PASS.

## Task 5: CLI Run Presenters And Parser

**Files:**
- Create: `apps/cli/src/presenters/run-event.ts`
- Create: `apps/cli/src/presenters/run-event.test.ts`
- Create: `apps/cli/src/commands/run.ts`
- Create: `apps/cli/src/commands/run.test.ts`
- Modify: `apps/cli/src/runtime-client.ts`
- Modify: `apps/cli/src/commands/root.ts`
- Modify: `apps/cli/src/commands/root.test.ts`

- [ ] **Step 1: Write failing presenter tests**

Create `apps/cli/src/presenters/run-event.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RunDirectReport } from "../../../../packages/shared/src/types/run.js";
import { renderRunNdjson, renderRunText } from "./run-event.js";

function report(overrides: Partial<RunDirectReport> = {}): RunDirectReport {
  return {
    exitCode: 0,
    command: "run",
    sessionId: "session-run-1",
    model: "openai/gpt-5",
    agentId: "quick-agent",
    text: "hello world",
    events: [
      { type: "session.created", sessionId: "session-run-1", sequence: 1, timestamp: "2026-05-10T00:00:00.000Z", payload: { commandFamily: "run" } },
      { type: "text.delta", sessionId: "session-run-1", sequence: 2, timestamp: "2026-05-10T00:00:00.001Z", payload: { text: "hello world" } },
    ],
    files: [],
    runtimeAuthority: "rust",
    finalStatus: "clean_success",
    degradedReason: null,
    ...overrides,
  };
}

describe("run event presenters", () => {
  it("renders plain text with session and lifecycle metadata", () => {
    const text = renderRunText(report());
    expect(text).toContain("session: session-run-1");
    expect(text).toContain("model: openai/gpt-5");
    expect(text).toContain("hello world");
  });

  it("renders newline-delimited JSON events", () => {
    const ndjson = renderRunNdjson(report());
    const lines = ndjson.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).type).toBe("session.created");
    expect(JSON.parse(lines[1]!).type).toBe("text.delta");
  });
});
```

- [ ] **Step 2: Run presenter test to verify RED**

Run: `npm test -- run-event`

Expected: FAIL because presenter file does not exist.

- [ ] **Step 3: Implement presenter**

Create `apps/cli/src/presenters/run-event.ts`:

```ts
import type { RunDirectReport } from "../../../../packages/shared/src/types/run.js";

export function renderRunText(report: RunDirectReport): string {
  const lines = [
    `session: ${report.sessionId}`,
    `model: ${report.model}`,
    `agent: ${report.agentId}`,
    `runtime authority: ${report.runtimeAuthority}`,
    `final status: ${report.finalStatus}`,
  ];
  if (report.degradedReason) lines.push(`degraded reason: ${report.degradedReason}`);
  if (report.files.length > 0) lines.push(`files: ${report.files.map((file) => file.path).join(", ")}`);
  lines.push("", report.text);
  return lines.join("\n");
}

export function renderRunNdjson(report: RunDirectReport): string {
  return report.events.map((event) => JSON.stringify(event)).join("\n");
}
```

- [ ] **Step 4: Write failing CLI command tests**

Create `apps/cli/src/commands/run.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runRunCommand } from "./run.js";
import type { RuntimeClient } from "../runtime-client.js";
import type { RunDirectReport } from "../../../../packages/shared/src/types/run.js";

function makeReport(overrides: Partial<RunDirectReport> = {}): RunDirectReport {
  return {
    exitCode: 0,
    command: "run",
    sessionId: "session-run-1",
    model: "openai/gpt-5",
    agentId: "quick-agent",
    text: "ok",
    events: [{ type: "text.delta", sessionId: "session-run-1", sequence: 1, timestamp: "2026-05-10T00:00:00.000Z", payload: { text: "ok" } }],
    files: [],
    runtimeAuthority: "rust",
    finalStatus: "clean_success",
    degradedReason: null,
    ...overrides,
  };
}

function runtime(calls: unknown[]): RuntimeClient {
  return {
    runDirect: async (input) => {
      calls.push(input);
      return makeReport();
    },
  } as RuntimeClient;
}

afterEach(() => vi.restoreAllMocks());

describe("runRunCommand", () => {
  it("parses run flags and writes plain text output", async () => {
    const calls: unknown[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runRunCommand(["--model", "openai/gpt-5", "--file", "README.md", "summarize", "repo"], "/repo", runtime(calls));

    expect(exitCode).toBe(0);
    expect(calls[0]).toMatchObject({ message: "summarize repo", model: "openai/gpt-5", files: ["README.md"] });
    expect(String(stdout.mock.calls[0]?.[0])).toContain("session: session-run-1");
  });

  it("writes NDJSON for --json", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runRunCommand(["--json", "hello"], "/repo", runtime([]));
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]).trim()).type).toBe("text.delta");
  });

  it("rejects invalid flag combinations", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exitCode = await runRunCommand(["--continue", "--session", "session-1", "hello"], "/repo", runtime([]));
    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("--continue cannot be combined with --session");
  });
});
```

- [ ] **Step 5: Run CLI tests to verify RED**

Run: `npm test -- run`

Expected: FAIL because command file does not exist.

- [ ] **Step 6: Implement `runRunCommand`, runtime client method, and root registration**

Create `apps/cli/src/commands/run.ts` with a small parser that:

- Removes `--json` from runtime input and selects renderer.
- Parses value flags `--session`, `--model`, `--agent`, `--variant`, `--file`, `--title`.
- Parses boolean flags `--continue`, `--fork`, `--auto-approve`.
- Accumulates remaining args into `message`.
- Returns exit code 1 with stderr for missing flag values or invalid combinations.

Add to `RuntimeClient` in `apps/cli/src/runtime-client.ts`:

```ts
import { runRustHostedDirectCommand } from "../../../packages/opencode-app/src/workflows/run-rust-hosted-direct-command.js";
import type { RunDirectInput } from "../../../packages/shared/src/types/run.js";

runDirect: (input: RunDirectInput) => Promise<RunDirectReport>;
```

Default implementation:

```ts
runDirect: runRustHostedDirectCommand,
```

Modify `root.ts`:

```ts
import { runRunCommand } from "./run.js";
```

Add help:

```text
  run [message] [--json] [--continue|--session <id>] [--file <path>]  (Rust-hosted direct run path)
```

Switch:

```ts
case "run":
  return runRunCommand(rest, repoRoot);
```

- [ ] **Step 7: Run tests to verify GREEN**

Run: `npm test -- run run-event root`

Expected: PASS.

## Task 6: Rust-Hosted Direct Command Adapter

**Files:**
- Create: `packages/opencode-app/src/workflows/run-rust-hosted-direct-command.ts`
- Create: `packages/opencode-app/src/workflows/run-rust-hosted-direct-command.test.ts`
- Modify: `apps/cli/src/runtime-client.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `packages/opencode-app/src/workflows/run-rust-hosted-direct-command.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runRustHostedDirectCommand } from "./run-rust-hosted-direct-command.js";

describe("runRustHostedDirectCommand", () => {
  it("adapts Rust run envelope into RunDirectReport", async () => {
    const report = await runRustHostedDirectCommand({
      message: "inspect",
      repoRoot: "/repo",
      spawnEngine: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          command: "run",
          commandFamily: "run",
          runtimeAuthority: "rust",
          sessionId: "session-run-1",
          finalStatus: "clean_success",
          degradedReason: null,
          rustLifecycle: { finalStatus: "clean_success", finalExitCode: 0 },
          workerResult: {
            report: {
              exitCode: 0,
              command: "run",
              sessionId: "session-run-1",
              model: "openai/gpt-5",
              agentId: "quick-agent",
              text: "answer",
              files: [],
              events: [
                { type: "text.delta", sessionId: "session-run-1", sequence: 1, timestamp: "2026-05-10T00:00:00.000Z", payload: { text: "answer" } }
              ]
            }
          }
        }),
        stderr: "",
      }),
    });

    expect(report.runtimeAuthority).toBe("rust");
    expect(report.sessionId).toBe("session-run-1");
    expect(report.text).toBe("answer");
    expect(report.events[0]?.type).toBe("text.delta");
  });

  it("returns request_failed when Rust output is not valid JSON", async () => {
    const report = await runRustHostedDirectCommand({
      message: "bad",
      repoRoot: "/repo",
      spawnEngine: async () => ({ exitCode: 1, stdout: "not-json", stderr: "failed" }),
    });

    expect(report.exitCode).toBe(1);
    expect(report.runtimeAuthority).toBe("rust");
    expect(report.finalStatus).toBe("request_failed");
    expect(report.degradedReason).toContain("Could not parse Rust-hosted run JSON");
  });
});
```

- [ ] **Step 2: Run adapter test to verify RED**

Run: `npm test -- run-rust-hosted-direct-command`

Expected: FAIL because adapter file does not exist.

- [ ] **Step 3: Implement adapter**

Implement like `run-rust-hosted-lane-command.ts`, with args:

```ts
const args = ["run", "-q", "-p", "dh-engine", "--", "run", input.message, "--workspace", input.repoRoot, "--json"];
if (input.continueLatest) args.push("--continue");
if (input.sessionId) args.push("--session", input.sessionId);
if (input.fork) args.push("--fork");
if (input.model) args.push("--model", input.model);
if (input.agentId) args.push("--agent", input.agentId);
if (input.variant) args.push("--variant", input.variant);
if (input.title) args.push("--title", input.title);
if (input.autoApprove) args.push("--auto-approve");
for (const file of input.files ?? []) args.push("--file", file);
```

Adapt `envelope.workerResult.report` into `RunDirectReport`, defaulting `runtimeAuthority: "rust"` and `finalStatus` from envelope/lifecycle.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- run-rust-hosted-direct-command run`

Expected: PASS.

## Task 7: Worker `session.runDirect`

**Files:**
- Modify: `packages/opencode-app/src/worker/worker-command-router.ts`
- Modify: `packages/opencode-app/src/worker/worker-main.ts`
- Modify: `packages/opencode-app/src/worker/worker-main.test.ts`

- [ ] **Step 1: Add failing worker test**

Add to `worker-main.test.ts`:

```ts
  it("runs direct run commands inside the TypeScript worker boundary", async () => {
    const repo = makeRepo();
    const { hostPeer, start } = connectHostAndWorker(repo);
    start();

    await hostPeer.request("dh.initialize", { protocolVersion: "1", workspaceRoot: repo, lifecycleAuthority: "rust" });
    await hostPeer.request("dh.initialized", { accepted: true });

    const result = await hostPeer.request("session.runDirect", {
      message: "inspect run path",
      repoRoot: repo,
    });

    expect(result).toMatchObject({
      runtimeAuthority: "typescript_worker",
      report: {
        command: "run",
        runtimeAuthority: "typescript_worker",
        text: expect.stringContaining("inspect run path"),
      },
    });
  });
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- worker-main`

Expected: FAIL because `session.runDirect` is not registered.

- [ ] **Step 3: Implement router and worker handler**

In `worker-command-router.ts`, add:

```ts
import { runDirectCommand } from "../workflows/run-direct-command.js";
import type { RunDirectInput, RunDirectReport } from "../../../shared/src/types/run.js";

export type WorkerRunDirectResult = { report: RunDirectReport };

async runDirect(params: Omit<RunDirectInput, "repoRoot"> & { repoRoot?: string }): Promise<WorkerRunDirectResult> {
  const report = await runDirectCommand({
    ...params,
    repoRoot: params.repoRoot ?? this.defaultRepoRoot,
  });
  return { report };
}
```

In `worker-main.ts`, add `WorkerRunDirectParamsSchema`:

```ts
const WorkerRunDirectParamsSchema = z.object({
  message: z.string().optional().default(""),
  repoRoot: z.string().optional(),
  continueLatest: z.boolean().optional(),
  sessionId: z.string().optional(),
  fork: z.boolean().optional(),
  model: z.string().optional(),
  agentId: z.string().optional(),
  variant: z.string().optional(),
  files: z.array(z.string()).optional(),
  title: z.string().optional(),
  autoApprove: z.boolean().optional(),
});
```

Register handler:

```ts
input.peer.onRequest("session.runDirect", async (params) => {
  if (!runtime.initialized || !runtime.router) throw new JsonRpcResponseError({ code: -32000, message: "Worker is not initialized for session.runDirect." });
  if (!runtime.readySent) await markReady(runtime);
  const result = await runtime.router.runDirect(asRunDirectParams(params));
  return { ...result, runtimeAuthority: "typescript_worker" };
});
```

- [ ] **Step 4: Run worker tests to verify GREEN**

Run: `npm test -- worker-main run-direct-command`

Expected: PASS.

## Task 8: Rust Run Runtime Authority

**Files:**
- Modify: `rust-engine/crates/dh-engine/src/host_lifecycle.rs`
- Modify: `rust-engine/crates/dh-engine/src/worker_protocol.rs`
- Modify: `rust-engine/crates/dh-engine/src/bridge.rs`
- Modify: `rust-engine/crates/dh-engine/src/host_commands.rs`
- Modify: `rust-engine/crates/dh-engine/src/main.rs`
- Modify: `rust-engine/crates/dh-engine/tests/host_contract_cli_test.rs`

- [ ] **Step 1: Add failing Rust contract tests**

In `host_lifecycle.rs`, change expected run family state:

```rust
{"family":"run","state":"supported","owner":"rust"},
```

In `worker_protocol.rs`, extend method assertions:

```rust
assert!(contract.host_to_worker_request_methods.contains(&"session.runDirect"));
```

In `bridge.rs`, update lifecycle control expected methods to include:

```rust
"session.runDirect",
```

- [ ] **Step 2: Run tests to verify RED**

Run: `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine host_lifecycle::tests::contract_freezes_required_vocabulary_and_boundaries worker_protocol::tests::worker_protocol_contract_freezes_first_wave_methods_and_transport bridge::tests::initialize_advertises_stable_v2_capabilities`

Expected: FAIL because run is still planned and `session.runDirect` is absent.

- [ ] **Step 3: Add run support to protocol contracts**

In `host_lifecycle.rs`, set runtime authority family `Run` to `RuntimeAuthorityState::Supported`.

In `worker_protocol.rs`:

```rust
pub const HOST_TO_WORKER_REQUEST_METHODS: [&str; 6] = [
    "session.runCommand",
    "session.runLane",
    "session.runDirect",
    "runtime.ping",
    "session.cancel",
    "dh.shutdown",
];

pub const BRIDGE_LIFECYCLE_CONTROL_METHODS: [&str; 7] = [
    "dh.initialized",
    "dh.ready",
    "session.runCommand",
    "session.runLane",
    "session.runDirect",
    "runtime.ping",
    "dh.shutdown",
];
```

- [ ] **Step 4: Add failing host command run envelope test**

In `host_commands.rs`, add a unit test near lane tests:

```rust
#[test]
fn run_report_uses_run_identity_and_authority_envelope() {
    let lifecycle = report_for_final_status(
        "linux",
        WorkerState::Stopped,
        HealthState::Healthy,
        FailurePhase::None,
        TimeoutClass::None,
        RecoveryOutcome::NotAttempted,
        CleanupOutcome::Graceful,
        None,
        FinalStatus::CleanSuccess,
        Some(0),
    );
    let report = report_from_run_worker_success(
        WorkerRequestOutcome {
            response: json!({
                "report": {
                    "exitCode": 0,
                    "command": "run",
                    "sessionId": "session-run-1",
                    "text": "answer",
                    "events": []
                }
            }),
            report: lifecycle,
        },
        report_for_final_status(
            "linux",
            WorkerState::Stopped,
            HealthState::Healthy,
            FailurePhase::None,
            TimeoutClass::None,
            RecoveryOutcome::NotAttempted,
            CleanupOutcome::Graceful,
            None,
            FinalStatus::CleanSuccess,
            Some(0),
        ),
        None,
    );

    assert_eq!(report.command, "run");
    assert_eq!(report.command_family, "run");
    assert_eq!(report.runtime_authority, "rust");
    assert_eq!(report.session_id.as_deref(), Some("session-run-1"));
    assert_eq!(report.final_status, FinalStatus::CleanSuccess);
}
```

- [ ] **Step 5: Run host command test to verify RED**

Run: `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine host_commands::tests::run_report_uses_run_identity_and_authority_envelope`

Expected: FAIL because helper does not exist.

- [ ] **Step 6: Implement `HostRunCommandRequest` and host command path**

In `host_commands.rs`, add:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostRunCommandRequest {
    pub message: String,
    pub workspace_root: PathBuf,
    pub node_runtime: PathBuf,
    pub worker_entry: PathBuf,
    pub worker_manifest: Option<PathBuf>,
    pub continue_latest: bool,
    pub session_id: Option<String>,
    pub fork: bool,
    pub model: Option<String>,
    pub agent_id: Option<String>,
    pub variant: Option<String>,
    pub files: Vec<String>,
    pub title: Option<String>,
    pub auto_approve: bool,
    pub output_json: bool,
}
```

Implement `run_hosted_direct_command()` by copying the lane structure and sending method `"session.runDirect"` with params:

```rust
json!({
  "message": request.message,
  "repoRoot": workspace,
  "continueLatest": request.continue_latest,
  "sessionId": request.session_id,
  "fork": request.fork,
  "model": request.model,
  "agentId": request.agent_id,
  "variant": request.variant,
  "files": request.files,
  "title": request.title,
  "autoApprove": request.auto_approve
})
```

Add report helpers like lane helpers, using `command = "run"` and `command_family = "run"`.

- [ ] **Step 7: Parse `dh-engine run` in main**

In `main.rs`, add `run` to command matching. Parse:

- message tokens until known flags or use positional after flags.
- `--workspace <path>`
- `--json`
- `--continue`
- `--session <id>`
- `--fork`
- `--model <provider/model>`
- `--agent <agent-id>`
- `--variant <variant-id>`
- `--file <path>` repeated
- `--title <text>`
- `--auto-approve`

For invalid combinations return JSON startup/request failure envelope when `--json` is set; otherwise print stderr and exit 1.

- [ ] **Step 8: Add host contract CLI test**

In `host_contract_cli_test.rs`, add:

```rust
#[test]
fn run_command_without_worker_bundle_is_rust_classified_startup_failure() -> anyhow::Result<()> {
    let tmp = tempfile::tempdir()?;
    let output = Command::new(env!("CARGO_BIN_EXE_dh-engine"))
        .args(["run", "inspect runtime", "--workspace"])
        .arg(tmp.path())
        .arg("--json")
        .output()?;
    let stdout = String::from_utf8(output.stdout)?;
    let value: serde_json::Value = serde_json::from_str(&stdout)?;

    assert_eq!(value["command"], json!("run"));
    assert_eq!(value["commandFamily"], json!("run"));
    assert_eq!(value["runtimeAuthority"], json!("rust"));
    assert!(["startup_failed", "request_failed"].contains(&value["finalStatus"].as_str().unwrap_or("")));
    Ok(())
}
```

- [ ] **Step 9: Run Rust tests to verify GREEN**

Run: `cargo fmt --manifest-path rust-engine/Cargo.toml --all`

Run: `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine host_commands worker_protocol host_lifecycle bridge host_contract_cli_test`

Expected: PASS.

## Task 9: Parity And Doctor Update

**Files:**
- Modify: `packages/runtime/src/diagnostics/parity-report.ts`
- Modify: `packages/runtime/src/diagnostics/parity-report.test.ts`
- Modify: `packages/runtime/src/diagnostics/doctor.test.ts`
- Modify: `apps/cli/src/commands/root.test.ts`

- [ ] **Step 1: Add failing parity assertions**

In `parity-report.test.ts`, add:

```ts
  it("removes direct run loop from missing surfaces after dh run lands", () => {
    const report = buildOpenCodeParityReport();
    const cli = report.features.find((feature) => feature.category === "cli");

    expect(report.summary.missingCommandSurfaces).not.toContain("run");
    expect(cli?.dhSurface).toEqual(expect.arrayContaining(["run (rust-hosted)"]));
    expect(cli?.missingRuntimeCapabilities).not.toEqual(
      expect.arrayContaining(["OpenCode-like direct interactive run loop"]),
    );
  });
```

- [ ] **Step 2: Run parity tests to verify RED**

Run: `npm test -- parity-report doctor root`

Expected: FAIL because parity still lists `run` as missing.

- [ ] **Step 3: Update parity report and doctor expectations**

In `OPENCODE_MISSING_COMMAND_SURFACES`, remove `"run"`.

In CLI feature `dhSurface`, add:

```ts
"run (rust-hosted)"
```

Change CLI `missingRuntimeCapabilities` from:

```ts
["OpenCode-like direct interactive run loop", "headless server command surface", "session import/export UX"]
```

to:

```ts
["headless server command surface", "session import/export UX"]
```

Update root help assertions to include `run [message]`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- parity-report doctor root`

Expected: PASS.

## Task 10: Final Verification And Milestone Commit

**Files:**
- All files touched by this milestone.

- [ ] **Step 1: TypeScript focused tests**

Run:

```bash
npm test -- session-event-stream session-runtime-events-repo run-direct-command run-rust-hosted-direct-command run-event run worker-main root parity-report doctor
```

Expected: PASS.

- [ ] **Step 2: TypeScript typecheck**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 3: Rust package tests**

Run:

```bash
cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine
```

Expected: PASS.

- [ ] **Step 4: Rust workspace tests**

Run:

```bash
cargo test --manifest-path rust-engine/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Smoke JSON**

Run:

```bash
cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- run "summarize this repo" --workspace . --json
```

Expected: JSON contains:

```json
{
  "command": "run",
  "commandFamily": "run",
  "runtimeAuthority": "rust"
}
```

If the local worker bundle is missing, a Rust-owned `startup_failed` envelope is acceptable. If bundle is present, expected `finalStatus` is `clean_success` or `degraded_success` with run events under `workerResult.report.events`.

- [ ] **Step 6: Inspect diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: only Milestone 2 files are modified; `docs/scope/2026-05-10-delivery-request.md` remains untracked unless the user explicitly asks to include it.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/cli/src/commands/root.test.ts apps/cli/src/commands/root.ts apps/cli/src/commands/run.test.ts apps/cli/src/commands/run.ts apps/cli/src/presenters/run-event.test.ts apps/cli/src/presenters/run-event.ts apps/cli/src/runtime-client.ts packages/shared/src/types/run.ts packages/shared/src/types/session-runtime.ts packages/runtime/src/session/session-event-stream.test.ts packages/runtime/src/session/session-event-stream.ts packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts packages/opencode-app/src/workflows/run-direct-command.test.ts packages/opencode-app/src/workflows/run-direct-command.ts packages/opencode-app/src/workflows/run-rust-hosted-direct-command.test.ts packages/opencode-app/src/workflows/run-rust-hosted-direct-command.ts packages/opencode-app/src/worker/worker-command-router.ts packages/opencode-app/src/worker/worker-main.test.ts packages/opencode-app/src/worker/worker-main.ts packages/runtime/src/diagnostics/parity-report.test.ts packages/runtime/src/diagnostics/parity-report.ts packages/runtime/src/diagnostics/doctor.test.ts rust-engine/crates/dh-engine/src/host_lifecycle.rs rust-engine/crates/dh-engine/src/worker_protocol.rs rust-engine/crates/dh-engine/src/bridge.rs rust-engine/crates/dh-engine/src/host_commands.rs rust-engine/crates/dh-engine/src/main.rs rust-engine/crates/dh-engine/tests/host_contract_cli_test.rs
git commit -m "feat: add rust-hosted dh run"
```

Expected: commit succeeds.

## Self-Review

Spec coverage:

- CLI command, flags, text/JSON rendering: Tasks 5 and 10.
- Event stream: Tasks 1 and 2.
- Worker body and provider flow: Tasks 3 and 4.
- Rust lifecycle authority: Tasks 6, 7, and 8.
- Parity/doctor truth: Task 9.

Placeholder scan:

- No TBD/TODO placeholders remain. Every task has concrete files, tests, implementation snippets, and verification commands.

Type consistency:

- Shared report type is `RunDirectReport`.
- Event type property is `type`; persistence uses `eventType`.
- CLI input uses `agentId`; CLI flag remains `--agent`.
- Rust method name is `session.runDirect`.
