import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { closeDhDatabase } from "../../storage/src/sqlite/db.js";
import { createDhServer, startDhServer } from "./server.js";

let repos: string[] = [];
let servers: Server[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-server-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(async () => {
  for (const server of servers) await closeServer(server);
  servers = [];
  for (const repo of repos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos = [];
});

describe("DH server", () => {
  it("serves health on localhost", async () => {
    const started = await startDhServer({ repoRoot: makeRepo(), host: "127.0.0.1", port: 0 });
    servers.push(started.server);

    const response = await fetch(`${started.url}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, product: "dh" });
  });

  it("routes run commands through injected runtime", async () => {
    const started = await startDhServer({
      repoRoot: makeRepo(),
      host: "127.0.0.1",
      port: 0,
      runDirect: async (input) => ({
        exitCode: 0,
        command: "run",
        sessionId: "s1",
        model: input.model ?? "openai/gpt-5",
        agentId: input.agentId ?? "quick-agent",
        text: `ran ${input.message}`,
        events: [],
        files: [],
        runtimeAuthority: "typescript_worker",
        finalStatus: "clean_success",
        degradedReason: null,
      }),
    });
    servers.push(started.server);

    const response = await fetch(`${started.url}/command/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ text: "ran hello", sessionId: "s1" });
  });

  it("streams run events as newline-delimited JSON", async () => {
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
        text: `ran ${input.message}`,
        events: [
          {
            type: "message.started",
            sessionId: "s1",
            sequence: 1,
            timestamp: "2026-05-10T00:00:00.000Z",
            payload: {},
          },
          {
            type: "text.delta",
            sessionId: "s1",
            sequence: 2,
            timestamp: "2026-05-10T00:00:00.001Z",
            payload: { text: "ran hello" },
          },
          {
            type: "message.finished",
            sessionId: "s1",
            sequence: 3,
            timestamp: "2026-05-10T00:00:00.002Z",
            payload: { finalStatus: "clean_success" },
          },
        ],
        files: [],
        runtimeAuthority: "typescript_worker",
        finalStatus: "clean_success",
        degradedReason: null,
      }),
    });
    servers.push(started.server);

    const response = await fetch(`${started.url}/command/run/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual([
      expect.objectContaining({ type: "message.started", sequence: 1 }),
      expect.objectContaining({ type: "text.delta", sequence: 2, payload: { text: "ran hello" } }),
      expect.objectContaining({ type: "message.finished", sequence: 3 }),
    ]);
  });

  it("records permission responses", async () => {
    const started = await startDhServer({ repoRoot: makeRepo(), host: "127.0.0.1", port: 0 });
    servers.push(started.server);

    const response = await fetch(`${started.url}/permission/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "s1",
        tool: "write",
        decision: "deny",
        reason: "not needed",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sessionId: "s1",
      tool: "write",
      decision: "deny",
      reason: "not needed",
      recorded: true,
    });
  });

  it("requires a password for non-localhost bind", () => {
    expect(() => createDhServer({ repoRoot: makeRepo(), host: "0.0.0.0" }))
      .toThrow("dh serve requires --password when binding outside localhost.");
  });
});
