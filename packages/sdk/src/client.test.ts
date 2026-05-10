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
    await expect(client.run({ message: "hello", repoRoot: "/ignored" })).resolves.toMatchObject({ text: "hello" });
  });
});
