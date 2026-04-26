import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectProjects } from "./detect-projects.js";
import { resolveIndexedFileAbsolutePath } from "./scan-paths.js";

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

  it("falls back to single-root workspace when no markers are present", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n", "utf8");

    const workspaces = await detectProjects(repo);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]!.root).toBe(path.resolve(repo).replace(/\\/g, "/"));
    expect(workspaces[0]!.type).toBe("unknown");
  });

  it("emits segmented workspaces for marker roots and keeps leaf roots only", async () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, "packages", "a", "src"), { recursive: true });
    fs.mkdirSync(path.join(repo, "packages", "a", "nested", "src"), { recursive: true });
    fs.mkdirSync(path.join(repo, "services", "api", "src"), { recursive: true });

    fs.writeFileSync(path.join(repo, "packages", "a", "package.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(repo, "packages", "a", "nested", "Cargo.toml"), "[package]\nname = \"nested\"\n", "utf8");
    fs.writeFileSync(path.join(repo, "services", "api", "Cargo.toml"), "[package]\nname = \"api\"\n", "utf8");

    fs.writeFileSync(path.join(repo, "packages", "a", "src", "parent.ts"), "export const parent = 1;\n", "utf8");
    fs.writeFileSync(path.join(repo, "packages", "a", "nested", "src", "leaf.ts"), "export const leaf = 1;\n", "utf8");
    fs.writeFileSync(path.join(repo, "services", "api", "src", "svc.ts"), "export const svc = 1;\n", "utf8");

    const workspaces = await detectProjects(repo);
    const roots = workspaces.map((workspace) => workspace.root).sort();

    expect(roots).toEqual([
      path.resolve(repo, "packages", "a", "nested").replace(/\\/g, "/"),
      path.resolve(repo, "services", "api").replace(/\\/g, "/"),
    ]);

    const nestedWorkspace = workspaces.find((workspace) => workspace.root.endsWith("packages/a/nested"));
    expect(nestedWorkspace).toBeDefined();
    expect(nestedWorkspace!.files.every((file) => file.workspaceRoot === nestedWorkspace!.root)).toBe(true);
    expect(nestedWorkspace!.files.map((file) => file.path)).toContain("src/leaf.ts");
    expect(nestedWorkspace!.files.map((file) => file.path)).not.toContain("src/parent.ts");
  });

  it("resolves indexed files from workspaceRoot, preserves single-root fallback, and rejects escapes", () => {
    const repo = makeRepo();
    const workspaceRoot = path.join(repo, "packages", "app");

    expect(resolveIndexedFileAbsolutePath(repo, {
      id: "child",
      path: "src/a.ts",
      extension: ".ts",
      language: "typescript",
      sizeBytes: 1,
      status: "indexed",
      workspaceRoot,
    })).toBe(path.resolve(workspaceRoot, "src", "a.ts").replace(/\\/g, "/"));

    expect(resolveIndexedFileAbsolutePath(repo, {
      id: "legacy",
      path: "src/a.ts",
      extension: ".ts",
      language: "typescript",
      sizeBytes: 1,
      status: "indexed",
    })).toBe(path.resolve(repo, "src", "a.ts").replace(/\\/g, "/"));

    expect(resolveIndexedFileAbsolutePath(repo, {
      id: "escape",
      path: "../outside.ts",
      extension: ".ts",
      language: "typescript",
      sizeBytes: 1,
      status: "indexed",
      workspaceRoot,
    })).toBeNull();
  });
});
