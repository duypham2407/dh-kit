import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { inspectContext } from "./context-planner.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-context-planner-"));
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n");
  fs.writeFileSync(path.join(repo, "src", "billing.ts"), "export function charge() { return 'ok'; }\n");
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos.length = 0;
});

describe("context planner", () => {
  it("builds an auditable evidence ledger from retrieval, symbols, and file mentions", async () => {
    const repo = makeRepo();

    const report = await inspectContext({
      repoRoot: repo,
      query: "auth login src/auth.ts",
      semanticMode: "off",
    });

    expect(report.query).toBe("auth login src/auth.ts");
    expect(report.ledger.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: "src/auth.ts",
        lineRange: expect.any(Array),
        reason: expect.any(String),
        score: expect.any(Number),
        source: expect.any(String),
      }),
    ]));
    expect(report.coverage.included).toBeGreaterThan(0);
    expect(report.coverage.skipped).toBeGreaterThanOrEqual(0);
    expect(report.coverage.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "lsp_unconfigured" }),
    ]));
    expect(fs.existsSync(path.join(repo, ".dh", "context-ledgers", `${report.ledger.id}.json`))).toBe(true);
  });

  it("reports reduced coverage when workspace scanning is truncated", async () => {
    const repo = makeRepo();

    const report = await inspectContext({
      repoRoot: repo,
      query: "billing",
      semanticMode: "off",
      scanOptions: { maxFiles: 1 },
    });

    expect(report.coverage.warnings).toContainEqual(expect.objectContaining({
      code: "reduced_scan_coverage",
    }));
  });
});
