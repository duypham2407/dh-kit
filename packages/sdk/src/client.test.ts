import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { SessionState } from "../../shared/src/types/session.js";
import { closeDhDatabase } from "../../storage/src/sqlite/db.js";
import { SessionsRepo } from "../../storage/src/sqlite/repositories/sessions-repo.js";
import { startDhServer } from "../../server/src/server.js";
import { DhClient } from "./client.js";

let repos: string[] = [];
let servers: Server[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-sdk-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string, overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-1",
    repoRoot,
    lane: overrides.lane ?? "quick",
    laneLocked: true,
    currentStage: overrides.currentStage ?? "quick_plan",
    status: overrides.status ?? "in_progress",
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: overrides.activeWorkItemIds ?? [],
    semanticMode: overrides.semanticMode ?? "auto",
    toolEnforcementLevel: overrides.toolEnforcementLevel ?? "very-hard",
  };
}

afterEach(async () => {
  for (const server of servers) await new Promise<void>((resolve) => server.close(() => resolve()));
  servers = [];
  for (const repo of repos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos = [];
});

describe("DhClient", () => {
  it("reads health and runs commands", async () => {
    const started = await startDhServer({
      repoRoot: makeRepo(),
      host: "127.0.0.1",
      port: 0,
      runDirect: async (input) => ({
        exitCode: 0,
        command: "run",
        sessionId: "s1",
        model: "openai/gpt-5",
        agentId: "quick-agent",
        text: input.message,
        events: [],
        files: [],
        runtimeAuthority: "typescript_worker",
        finalStatus: "clean_success",
        degradedReason: null,
      }),
    });
    servers.push(started.server);
    const client = new DhClient({ baseUrl: started.url });

    await expect(client.health()).resolves.toMatchObject({ ok: true });
    await expect(client.sessions()).resolves.toEqual({ sessions: [] });
    await expect(client.run({ message: "hello", repoRoot: "/ignored" })).resolves.toMatchObject({ text: "hello" });
  });

  it("streams run events from the server", async () => {
    const started = await startDhServer({
      repoRoot: makeRepo(),
      host: "127.0.0.1",
      port: 0,
      runDirect: async () => ({
        exitCode: 0,
        command: "run",
        sessionId: "s1",
        model: "openai/gpt-5",
        agentId: "quick-agent",
        text: "hello",
        events: [
          {
            type: "text.delta",
            sessionId: "s1",
            sequence: 1,
            timestamp: "2026-05-10T00:00:00.000Z",
            payload: { text: "hello" },
          },
          {
            type: "tool.started",
            sessionId: "s1",
            sequence: 2,
            timestamp: "2026-05-10T00:00:00.001Z",
            payload: { tool: "read" },
          },
        ],
        files: [],
        runtimeAuthority: "typescript_worker",
        finalStatus: "clean_success",
        degradedReason: null,
      }),
    });
    servers.push(started.server);
    const client = new DhClient({ baseUrl: started.url });

    const events = [];
    for await (const event of client.runStream({ message: "hello" })) events.push(event);

    expect(events).toEqual([
      expect.objectContaining({ type: "text.delta", payload: { text: "hello" } }),
      expect.objectContaining({ type: "tool.started", payload: { tool: "read" } }),
    ]);
  });

  it("sends permission responses", async () => {
    const started = await startDhServer({ repoRoot: makeRepo(), host: "127.0.0.1", port: 0 });
    servers.push(started.server);
    const client = new DhClient({ baseUrl: started.url });

    await expect(client.respondPermission({
      sessionId: "s1",
      tool: "write",
      decision: "allow",
    })).resolves.toEqual({
      sessionId: "s1",
      tool: "write",
      decision: "allow",
      recorded: true,
    });
  });

  it("manages session lifecycle endpoints", async () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-1" }));
    const started = await startDhServer({ repoRoot: repo, host: "127.0.0.1", port: 0 });
    servers.push(started.server);
    const client = new DhClient({ baseUrl: started.url });

    await expect(client.sessions()).resolves.toMatchObject({
      sessions: [{ id: "session-1", title: "quick quick_plan", status: "in_progress" }],
    });

    const forked = await client.forkSession({ sessionId: "session-1", title: "Forked work" });
    expect(forked.sourceSessionId).toBe("session-1");
    expect(forked.sessionId).toMatch(/^session-/);

    await expect(client.deleteSession(forked.sessionId)).resolves.toMatchObject({
      sessionId: forked.sessionId,
      deleted: { session: 1 },
    });
  });

  it("lists model and agent options", async () => {
    const started = await startDhServer({ repoRoot: makeRepo(), host: "127.0.0.1", port: 0 });
    servers.push(started.server);
    const client = new DhClient({ baseUrl: started.url });

    await expect(client.agents()).resolves.toMatchObject({
      agents: expect.arrayContaining([
        expect.objectContaining({ id: "build", displayName: "Build", role: "implementer", permission: "builder" }),
      ]),
    });
    await expect(client.models()).resolves.toMatchObject({
      models: expect.arrayContaining([
        expect.objectContaining({ id: "openai/gpt-5-codex", name: "gpt-5-codex", providerId: "openai", modelId: "gpt-5-codex" }),
      ]),
    });
  });

  it("inspects context through the server", async () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n");
    const started = await startDhServer({ repoRoot: repo, host: "127.0.0.1", port: 0 });
    servers.push(started.server);
    const client = new DhClient({ baseUrl: started.url });

    const report = await client.inspectContext({ query: "auth login", semanticMode: "off" });

    expect(report.ledger.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ filePath: "src/auth.ts" }),
    ]));
    expect(report.coverage.included).toBeGreaterThan(0);
  });
});
