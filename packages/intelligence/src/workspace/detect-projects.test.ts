import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectProjects } from "./detect-projects.js";

function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dh-detect-projects-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  return root;
}

describe("detectProjects", () => {
  it("detects node workspace from marker file", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "package.json"), "{\"name\":\"demo\"}\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n", "utf8");

    const [workspace] = await detectProjects(repo);
    expect(workspace).toBeDefined();
    expect(workspace!.type).toBe("node");
    expect(workspace!.markers?.hasPackageJson).toBe(true);
  });

  it("marks scan as partial when max files budget is reached", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "b.ts"), "export const b = 1;\n", "utf8");

    const [workspace] = await detectProjects(repo, { maxFiles: 1 });
    expect(workspace).toBeDefined();
    expect(workspace!.scanMeta?.partial).toBe(true);
    expect(workspace!.diagnostics?.stopReason).toBe("max_files_reached");
  });

  it("does not follow symlink by default", async () => {
    const repo = makeRepo();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "dh-detect-projects-outside-"));
    fs.writeFileSync(path.join(outside, "outside.ts"), "export const z = 1;\n", "utf8");
    fs.symlinkSync(outside, path.join(repo, "linked-outside"), "dir");
    fs.writeFileSync(path.join(repo, "src", "inside.ts"), "export const y = 1;\n", "utf8");

    const [workspace] = await detectProjects(repo);
    const paths = workspace!.files.map((file) => file.path);

    expect(paths).toContain("src/inside.ts");
    expect(paths.some((p) => p.includes("outside.ts"))).toBe(false);
  });

  it("returns canonical relative paths in scan output", async () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, "src", "nested"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "nested", "a.ts"), "export const a = 1;\n", "utf8");

    const [workspace] = await detectProjects(repo);
    expect(workspace!.files[0]?.path).toBe("src/nested/a.ts");
    expect(workspace!.root.includes("\\")).toBe(false);
  });

  it("marks partial scan when max depth is reached", async () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, "src", "a", "b", "c"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "a", "b", "c", "deep.ts"), "export const deep = 1;\n", "utf8");

    const [workspace] = await detectProjects(repo, { maxDepth: 1 });
    expect(workspace!.scanMeta?.partial).toBe(true);
    expect(workspace!.diagnostics?.stopReason).toBe("max_depth_reached");
  });

  it("marks partial scan when max file size is reached", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "src", "huge.ts"), "x".repeat(128), "utf8");

    const [workspace] = await detectProjects(repo, { maxFileSizeBytes: 8 });
    expect(workspace!.scanMeta?.partial).toBe(true);
    expect(workspace!.diagnostics?.stopReason).toBe("max_file_size_scan_stopped");
  });
});
