import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runRetrieval } from "./run-retrieval.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";

const originalOpenAiKey = process.env.OPENAI_API_KEY;
let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-retrieval-run-test-"));
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  tmpDirs.push(repo);
  return repo;
}

afterEach(() => {
  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("runRetrieval", () => {
  it("returns retrieval evidence with semantic mode off", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "find login definition",
      mode: "ask",
      semanticMode: "off",
    });

    expect(result.plan.semanticMode).toBe("off");
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.evidencePackets.length).toBeGreaterThan(0);
    expect(result.scanMeta.reducedCoverage).toBe(false);
  });

  it("runs semantic retrieval path in always mode", async () => {
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "ui.ts"), "export function renderUI() { return 'ui'; }\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "frontend ui render",
      mode: "explain",
      semanticMode: "always",
    });

    expect(result.plan.semanticMode).toBe("always");
    expect(result.embeddingStats).toBeDefined();
    expect(result.evidencePackets.length).toBeGreaterThan(0);
  });

  it("surfaces reduced coverage metadata when scan is partial", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "b.ts"), "export const b = 1;\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "find a",
      mode: "ask",
      semanticMode: "off",
      scanOptions: { maxFiles: 1 },
    });

    expect(result.scanMeta.reducedCoverage).toBe(true);
    expect(result.scanMeta.stopReasons).toContain("max_files_reached");
  });
});
