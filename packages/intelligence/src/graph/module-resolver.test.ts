import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveModuleSpecifier } from "./module-resolver.js";

function makeRepo(): { root: string; fromFile: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dh-module-resolve-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const fromFile = path.join(root, "src", "main.ts");
  fs.writeFileSync(fromFile, "export const x = 1;\n", "utf8");
  return { root, fromFile };
}

describe("resolveModuleSpecifier", () => {
  it("resolves direct extension file", () => {
    const { root, fromFile } = makeRepo();
    const target = path.join(root, "src", "util.ts");
    fs.writeFileSync(target, "export const y = 2;\n", "utf8");
    expect(resolveModuleSpecifier("./util.ts", fromFile)).toBe(target);
  });

  it("resolves extension fallback", () => {
    const { root, fromFile } = makeRepo();
    const target = path.join(root, "src", "util.tsx");
    fs.writeFileSync(target, "export const y = 2;\n", "utf8");
    expect(resolveModuleSpecifier("./util", fromFile)).toBe(target);
  });

  it("resolves index fallback", () => {
    const { root, fromFile } = makeRepo();
    const dir = path.join(root, "src", "lib");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, "index.js");
    fs.writeFileSync(target, "export const y = 2;\n", "utf8");
    expect(resolveModuleSpecifier("./lib", fromFile)).toBe(target);
  });

  it("returns null for bare package specifier", () => {
    const { fromFile } = makeRepo();
    expect(resolveModuleSpecifier("react", fromFile)).toBeNull();
  });
});
