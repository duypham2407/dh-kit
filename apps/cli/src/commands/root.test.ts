import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCli } from "./root.js";
import { closeDhDatabase } from "../../../../packages/storage/src/sqlite/db.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-cli-root-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
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

describe("runCli help", () => {
  it("labels Rust-hosted knowledge commands and legacy workflow compatibility surfaces", async () => {
    const repo = makeTmpRepo();
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const exitCode = await runCli(["--help"], repo);

    expect(exitCode).toBe(0);
    const output = String(stdout.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("ask <question> [--json]     (Rust-hosted first-wave knowledge path)");
    expect(output).toContain("explain <symbol> [--json]   (Rust-hosted first-wave knowledge path)");
    expect(output).toContain("trace <target> [--json]     (Rust-hosted first-wave lifecycle path; trace result may be unsupported)");
    expect(output).toContain("quick <task> [--json]       (TypeScript-hosted workflow compatibility path)");
    expect(output).toContain("Bounded broad ask can use Rust-authored query.buildEvidence only for finite static repository subjects.");
    expect(output).toContain("Legacy retrieval packets and TypeScript-hosted bridge paths are compatibility surfaces, not canonical authority for touched Rust-hosted build-evidence flows.");
    expect(output).toContain("Supported target platforms are Linux and macOS only.");
    expect(output).toContain("No universal repository reasoning, runtime tracing support, daemon mode, worker pool, remote/local socket control plane, Windows platform support, or full workflow-lane parity is claimed.");
    expect(output).toContain("bounded Rust query.buildEvidence when a finite static subject is available");
    expect(output).toContain("TypeScript CLI setup:");
    expect(output).toContain("1. dh --help");
    expect(output).toContain("2. dh index");
    expect(output).toContain("3. dh ask \"how does auth work?\"");
    expect(output).toContain("next: run dh index, then dh ask");
    expect(output).toContain("works: indexing and knowledge commands are available");
    expect(output).not.toContain("2. dh status");
    expect(output).not.toContain("next: run dh status");
    expect(output).not.toContain("next: run dh doctor");
    expect(output).not.toContain("1. dh doctor");
    expect(output).not.toContain("universal understanding");
    expect(output).not.toContain("runtime tracing is supported");
    expect(output).not.toContain("daemon support");
    expect(output).not.toContain("Windows is supported");
  });
});
