import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { ToolUsageAuditRepo } from "../../../storage/src/sqlite/repositories/tool-usage-audit-repo.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { runTester } from "./tester.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-tester-verify-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

/** Write a package.json whose `test` script exits with the given code via the node binary. */
function writePackageJsonWithTestExit(repo: string, exitCode: number): void {
  const script = `${JSON.stringify(process.execPath)} -e "process.exit(${exitCode})"`;
  fs.writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: script } }),
    "utf8",
  );
}

function makeEnvelope(): ExecutionEnvelopeState {
  return {
    id: "env-verify-1",
    sessionId: "session-verify-1",
    lane: "delivery",
    role: "tester",
    agentId: "tester-agent",
    stage: "delivery_verify",
    resolvedModel: { providerId: "openai", modelId: "gpt-5", variantId: "default" },
    activeSkills: [],
    activeMcps: [],
    requiredTools: [],
    semanticMode: "auto",
    evidencePolicy: "strict",
    createdAt: new Date().toISOString(),
  };
}

afterEach(() => {
  for (const repo of repos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos = [];
});

describe("runTester real verification", () => {
  it("returns PASS when the repo's test command exits 0", async () => {
    const repo = makeRepo();
    writePackageJsonWithTestExit(repo, 0);

    const tester = await runTester({ repoRoot: repo, envelope: makeEnvelope() });

    expect(tester.status).toBe("PASS");
    expect(tester.nextAction).toBe("complete");
    // Evidence is grounded in a real run, not a hardcoded string.
    expect(tester.evidence.join("\n")).toContain("npm test passed (exit 0)");
    expect(tester.evidence.join("\n")).not.toContain("npm run check passed");
  });

  it("returns FAIL and routes to implementer when the test command exits non-zero", async () => {
    const repo = makeRepo();
    writePackageJsonWithTestExit(repo, 1);

    const tester = await runTester({ repoRoot: repo, envelope: makeEnvelope() });

    expect(tester.status).toBe("FAIL");
    expect(tester.nextAction).toBe("implementer");
    expect(tester.unmetCriteria.length).toBeGreaterThan(0);
  });

  it("audits the shell run in the tool usage log", async () => {
    const repo = makeRepo();
    writePackageJsonWithTestExit(repo, 0);

    await runTester({ repoRoot: repo, envelope: makeEnvelope() });

    const audited = new ToolUsageAuditRepo(repo)
      .listBySession("session-verify-1")
      .map((record) => record.toolName);
    expect(audited).toContain("shell");
  });

  it("returns PARTIAL with a clear limitation when no verify command is detected", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "README.md"), "# nothing to verify\n", "utf8");

    const tester = await runTester({ repoRoot: repo, envelope: makeEnvelope() });

    expect(tester.status).toBe("PARTIAL");
    expect(tester.limitations.join("\n")).toContain("No verification command detected");
  });
});
