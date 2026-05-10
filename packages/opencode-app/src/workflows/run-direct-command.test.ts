import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";
import { runDirectCommand } from "./run-direct-command.js";

let repos: string[] = [];
const originalXdgDataHome = process.env.XDG_DATA_HOME;

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-run-direct-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  process.env.XDG_DATA_HOME = path.join(repo, ".xdg-data");
  repos.push(repo);
  return repo;
}

afterEach(() => {
  if (originalXdgDataHome === undefined) {
    delete process.env.XDG_DATA_HOME;
  } else {
    process.env.XDG_DATA_HOME = originalXdgDataHome;
  }
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
});
