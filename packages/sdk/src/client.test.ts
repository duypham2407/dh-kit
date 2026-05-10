import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { closeDhDatabase } from "../../storage/src/sqlite/db.js";
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
});
