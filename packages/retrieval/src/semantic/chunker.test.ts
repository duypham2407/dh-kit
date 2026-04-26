import { describe, it, expect } from "vitest";
import { estimateTokens, contentHash, chunkFile, chunkFiles } from "./chunker.js";
import type { IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

function makeFile(overrides?: Partial<IndexedFile>): IndexedFile {
  return {
    id: "file-1",
    path: "src/example.ts",
    extension: ".ts",
    language: "typescript",
    sizeBytes: 100,
    status: "indexed",
    ...overrides,
  };
}

function makeSymbol(overrides?: Partial<IndexedSymbol>): IndexedSymbol {
  return {
    id: "sym-1",
    fileId: "file-1",
    name: "myFunction",
    kind: "function",
    lineStart: 3,
    lineEnd: 10,
    ...overrides,
  };
}

describe("estimateTokens", () => {
  it("returns roughly text.length / 4", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });
});

describe("contentHash", () => {
  it("returns a 16-char hex string", () => {
    const hash = contentHash("hello world");
    expect(hash).toHaveLength(16);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("is deterministic", () => {
    expect(contentHash("foo")).toBe(contentHash("foo"));
  });

  it("differs for different content", () => {
    expect(contentHash("foo")).not.toBe(contentHash("bar"));
  });
});

describe("chunkFile", () => {
  let tmpDir: string;

  async function writeTestFile(name: string, content: string) {
    await fs.writeFile(path.join(tmpDir, "src", name), content, "utf8");
  }

  async function setup() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dh-chunk-test-"));
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  }

  it("chunks by sliding window when no symbols", async () => {
    await setup();
    const lines = Array.from({ length: 120 }, (_, i) => `// line ${i + 1}`);
    await writeTestFile("example.ts", lines.join("\n"));

    const file = makeFile({ path: "src/example.ts" });
    const chunks = await chunkFile(tmpDir, file, [], { maxLines: 60, overlapLines: 8 });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk starts at line 1
    expect(chunks[0]!.lineStart).toBe(1);
    expect(chunks[0]!.lineEnd).toBe(60);
    // Second chunk overlaps
    expect(chunks[1]!.lineStart).toBe(53); // 60 - 8 + 1
    expect(chunks.every((chunk) => chunk.filePath === "src/example.ts")).toBe(true);
  });

  it("chunks by symbol when symbols available", async () => {
    await setup();
    const lines = [
      "// header",
      "import foo from 'bar';",
      "export function myFunction() {",
      "  return 1;",
      "  return 2;",
      "  return 3;",
      "  return 4;",
      "  return 5;",
      "  return 6;",
      "}",
      "// trailing",
    ];
    await writeTestFile("example.ts", lines.join("\n"));

    const file = makeFile({ path: "src/example.ts" });
    const sym = makeSymbol({ lineStart: 3, lineEnd: 10 });

    const chunks = await chunkFile(tmpDir, file, [sym]);

    // Should produce: gap before symbol, symbol chunk, trailing
    expect(chunks.length).toBe(3);

    // Gap chunk: lines 1-2
    expect(chunks[0]!.lineStart).toBe(1);
    expect(chunks[0]!.lineEnd).toBe(2);
    expect(chunks[0]!.symbolId).toBeUndefined();

    // Symbol chunk: lines 3-10
    expect(chunks[1]!.lineStart).toBe(3);
    expect(chunks[1]!.lineEnd).toBe(10);
    expect(chunks[1]!.symbolId).toBe("sym-1");

    // Trailing: line 11
    expect(chunks[2]!.lineStart).toBe(11);
    expect(chunks.every((chunk) => chunk.filePath === "src/example.ts")).toBe(true);
  });

  it("writes canonical repo-relative filePath for segmented workspace files", async () => {
    await setup();
    const workspaceRoot = path.join(tmpDir, "packages", "api");
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const file = makeFile({
      id: "workspace-file",
      path: "src/auth.ts",
      workspaceRoot,
    });

    const chunks = await chunkFile(tmpDir, file, []);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.filePath === "packages/api/src/auth.ts")).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes("login"))).toBe(true);
  });

  it("returns empty for missing file", async () => {
    await setup();
    const file = makeFile({ path: "src/does-not-exist.ts" });
    const chunks = await chunkFile(tmpDir, file, []);
    expect(chunks).toEqual([]);
  });
});

describe("chunkFiles", () => {
  it("flattens results from multiple files", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dh-chunk-multi-"));
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });

    await fs.writeFile(path.join(tmpDir, "src", "a.ts"), "const a = 1;\nconst b = 2;\n", "utf8");
    await fs.writeFile(path.join(tmpDir, "src", "b.ts"), "const c = 3;\n", "utf8");

    const files: IndexedFile[] = [
      makeFile({ id: "f1", path: "src/a.ts" }),
      makeFile({ id: "f2", path: "src/b.ts" }),
    ];
    const chunks = await chunkFiles(tmpDir, files, []);

    expect(chunks.length).toBe(2);
    expect(chunks[0]!.fileId).toBe("f1");
    expect(chunks[1]!.fileId).toBe("f2");
  });
});
