import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../../packages/storage/src/sqlite/db.js";
import { ChunksRepo } from "../../../../packages/storage/src/sqlite/repositories/chunks-repo.js";
import { runSemanticCleanupCommand } from "./semantic-cleanup.js";
import { recordTelemetry } from "../../../../packages/retrieval/src/semantic/telemetry-collector.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-cli-semantic-cleanup-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "auth.ts"), "export function auth() {}\n", "utf8");
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("runSemanticCleanupCommand", () => {
  it("prints dry-run JSON report", async () => {
    const repoRoot = makeTmpRepo();
    const chunks = new ChunksRepo(repoRoot);
    const row = chunks.save({
      fileId: "f1",
      filePath: path.join(repoRoot, "src", "auth.ts"),
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 1,
      content: "auth",
      contentHash: "h-cli-1",
      tokenEstimate: 1,
      language: "ts",
    });
    recordTelemetry(repoRoot, {
      kind: "semantic_path_unresolved",
      details: {
        chunkId: row.id,
        filePath: path.join(repoRoot, "src", "auth.ts"),
        originalFilePath: path.join(repoRoot, "src", "auth.ts"),
      },
    });

    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runSemanticCleanupCommand(["--mode", "dry-run", "--json"], repoRoot);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0] ?? "{}"));
    expect(payload.meta.mode).toBe("dry-run");
    expect(payload.storageBefore.deterministicConvertibleRows).toBe(1);
    expect(payload.updatedRows).toBe(0);
  });

  it("returns error when mode is missing", async () => {
    const repoRoot = makeTmpRepo();
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const exitCode = await runSemanticCleanupCommand([], repoRoot);
    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0] ?? "")).toContain("Missing required --mode argument");
  });
});
