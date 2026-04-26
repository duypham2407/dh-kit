import { describe, it, expect } from "vitest";
import { extractSymbolsFromFileAST, extractSymbolsFromFilesAST } from "./ast-symbol-extractor.js";
import { isSupportedLanguage, listSupportedLanguages } from "./tree-sitter-init.js";
import type { IndexedFile } from "../../../shared/src/types/indexing.js";
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

describe("isSupportedLanguage", () => {
  it("returns true for typescript", () => {
    expect(isSupportedLanguage("typescript")).toBe(true);
  });

  it("returns true for javascript", () => {
    expect(isSupportedLanguage("javascript")).toBe(true);
  });

  it("returns true for python", () => {
    expect(isSupportedLanguage("python")).toBe(true);
  });

  it("returns false for unsupported", () => {
    expect(isSupportedLanguage("brainfuck")).toBe(false);
  });
});

describe("listSupportedLanguages", () => {
  it("returns a non-empty list", () => {
    const langs = listSupportedLanguages();
    expect(langs.length).toBeGreaterThan(10);
    expect(langs).toContain("typescript");
    expect(langs).toContain("javascript");
    expect(langs).toContain("python");
  });
});

describe("extractSymbolsFromFileAST", () => {
  let tmpDir: string;

  async function setup() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dh-parser-test-"));
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  }

  async function writeFile(name: string, content: string) {
    await fs.writeFile(path.join(tmpDir, "src", name), content, "utf8");
  }

  it("extracts function declarations", async () => {
    await setup();
    await writeFile("funcs.ts", [
      "export function greet(name: string): string {",
      "  return `Hello ${name}`;",
      "}",
      "",
      "function helper() {",
      "  return 42;",
      "}",
    ].join("\n"));

    const file = makeFile({ path: "src/funcs.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("greet");
    expect(names).toContain("helper");

    const greet = symbols.find((s) => s.name === "greet");
    expect(greet!.kind).toBe("function");
    expect(greet!.lineStart).toBe(1);
    expect(greet!.lineEnd).toBe(3);
  });

  it("extracts class declarations", async () => {
    await setup();
    await writeFile("classes.ts", [
      "export class MyService {",
      "  private name: string;",
      "",
      "  constructor(name: string) {",
      "    this.name = name;",
      "  }",
      "",
      "  getName() {",
      "    return this.name;",
      "  }",
      "}",
    ].join("\n"));

    const file = makeFile({ path: "src/classes.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("MyService");

    const cls = symbols.find((s) => s.name === "MyService");
    expect(cls!.kind).toBe("class");
    expect(cls!.lineStart).toBe(1);
    expect(cls!.lineEnd).toBe(11);

    // Methods should also be extracted
    expect(names).toContain("getName");
    const method = symbols.find((s) => s.name === "getName");
    expect(method!.kind).toBe("method");
  });

  it("extracts interfaces and types", async () => {
    await setup();
    await writeFile("types.ts", [
      "export interface Config {",
      "  host: string;",
      "  port: number;",
      "}",
      "",
      "export type Status = 'active' | 'inactive';",
    ].join("\n"));

    const file = makeFile({ path: "src/types.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("Config");
    expect(names).toContain("Status");

    expect(symbols.find((s) => s.name === "Config")!.kind).toBe("interface");
    expect(symbols.find((s) => s.name === "Status")!.kind).toBe("type");
  });

  it("extracts arrow functions assigned to const", async () => {
    await setup();
    await writeFile("arrows.ts", [
      "export const add = (a: number, b: number) => a + b;",
      "",
      "const multiply = (a: number, b: number) => {",
      "  return a * b;",
      "};",
    ].join("\n"));

    const file = makeFile({ path: "src/arrows.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("add");
    expect(names).toContain("multiply");
  });

  it("returns empty for unsupported language", async () => {
    await setup();
    await writeFile("data.txt", "hello world");

    const file = makeFile({ path: "src/data.txt", language: "plaintext" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);
    expect(symbols).toEqual([]);
  });

  it("returns empty for missing file", async () => {
    await setup();
    const file = makeFile({ path: "src/missing.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);
    expect(symbols).toEqual([]);
  });

  it("extracts export default function", async () => {
    await setup();
    await writeFile("default-fn.ts", "export default function main() { return 0; }\n");

    const file = makeFile({ path: "src/default-fn.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("main");
    expect(symbols.find((s) => s.name === "main")!.kind).toBe("function");
  });

  it("extracts export default class", async () => {
    await setup();
    await writeFile("default-cls.ts", "export default class Handler {}\n");

    const file = makeFile({ path: "src/default-cls.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("Handler");
    expect(symbols.find((s) => s.name === "Handler")!.kind).toBe("class");
  });

  it("extracts enum declarations", async () => {
    await setup();
    await writeFile("enums.ts", "export enum Color { Red, Green, Blue }\n");

    const file = makeFile({ path: "src/enums.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("Color");
    expect(symbols.find((s) => s.name === "Color")!.kind).toBe("type");
  });

  it("extracts namespace declarations", async () => {
    await setup();
    await writeFile("ns.ts", [
      "export namespace Utils {",
      "  export function helper() {}",
      "}",
    ].join("\n"));

    const file = makeFile({ path: "src/ns.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("Utils");
    expect(symbols.find((s) => s.name === "Utils")!.kind).toBe("namespace");
    // helper inside namespace should also be visible
    expect(names).toContain("helper");
  });

  it("extracts class methods including constructor", async () => {
    await setup();
    await writeFile("service.ts", [
      "export class UserService {",
      "  constructor(private db: any) {}",
      "  async getUser(id: string) { return null; }",
      "  static create() { return new UserService(null); }",
      "}",
    ].join("\n"));

    const file = makeFile({ path: "src/service.ts" });
    const symbols = await extractSymbolsFromFileAST(tmpDir, file);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("UserService");
    expect(names).toContain("constructor");
    expect(names).toContain("getUser");
    expect(names).toContain("create");
  });
});

describe("extractSymbolsFromFilesAST", () => {
  it("extracts symbols from multiple files", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dh-parser-multi-"));
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });

    await fs.writeFile(path.join(tmpDir, "src", "a.ts"), "export function alpha() { return 1; }\n", "utf8");
    await fs.writeFile(path.join(tmpDir, "src", "b.ts"), "export function beta() { return 2; }\n", "utf8");

    const files: IndexedFile[] = [
      makeFile({ id: "f1", path: "src/a.ts" }),
      makeFile({ id: "f2", path: "src/b.ts" }),
    ];
    const symbols = await extractSymbolsFromFilesAST(tmpDir, files);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
    expect(symbols.find((s) => s.name === "alpha")!.fileId).toBe("f1");
    expect(symbols.find((s) => s.name === "beta")!.fileId).toBe("f2");
  });

  it("extracts symbols from segmented files using workspaceRoot", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dh-parser-segmented-"));
    const workspaceRoot = path.join(tmpDir, "packages", "app");
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "a.ts"), "export function alpha() { return 1; }\n", "utf8");

    const symbols = await extractSymbolsFromFilesAST(tmpDir, [
      makeFile({ id: "f1", path: "src/a.ts", workspaceRoot }),
    ]);

    expect(symbols.find((s) => s.name === "alpha")?.fileId).toBe("f1");
  });
});
