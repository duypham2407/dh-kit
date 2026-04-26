import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveModuleSpecifier, resolveModuleSpecifierDetailed } from "./module-resolver.js";

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
    expect(resolveModuleSpecifierDetailed("react", fromFile).status).toBe("external");
  });

  it("reports alias-like import without readable config as unresolved missing alias config", () => {
    const { root, fromFile } = makeRepo();

    const result = resolveModuleSpecifierDetailed("@/foo", fromFile, root);

    expect(result.status).toBe("unresolved");
    expect(result.reason).toBe("alias_config_missing");
    expect(result.resolvedAbsPath).toBeUndefined();
  });

  it("returns null when resolved target escapes workspace root", () => {
    const { root, fromFile } = makeRepo();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "dh-module-resolve-outside-"));
    const target = path.join(outside, "secret.ts");
    fs.writeFileSync(target, "export const y = 2;\n", "utf8");

    expect(resolveModuleSpecifier("../../../../secret", fromFile, root)).toBeNull();
  });

  it("resolves bounded TS/JS paths alias with extension fallback", () => {
    const { root, fromFile } = makeRepo();
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }), "utf8");
    const target = path.join(root, "src", "aliased.tsx");
    fs.writeFileSync(target, "export const y = 2;\n", "utf8");

    const result = resolveModuleSpecifierDetailed("@/aliased", fromFile, root);
    expect(result.status).toBe("resolved");
    expect(result.reason).toBe("alias_target_found");
    expect(result.resolutionKind).toBe("alias");
    expect(result.resolvedAbsPath).toBe(target);
  });

  it("resolves alias directory index fallback", () => {
    const { root, fromFile } = makeRepo();
    fs.writeFileSync(path.join(root, "jsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "~/*": ["src/*"] } } }), "utf8");
    fs.mkdirSync(path.join(root, "src", "feature"), { recursive: true });
    const target = path.join(root, "src", "feature", "index.ts");
    fs.writeFileSync(target, "export const y = 2;\n", "utf8");

    expect(resolveModuleSpecifierDetailed("~/feature", fromFile, root).resolvedAbsPath).toBe(target);
  });

  it("marks ambiguous aliases instead of choosing arbitrary targets", () => {
    const { root, fromFile } = makeRepo();
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*", "alt/*"] } } }), "utf8");
    fs.mkdirSync(path.join(root, "alt"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "shared.ts"), "export const y = 1;\n", "utf8");
    fs.writeFileSync(path.join(root, "alt", "shared.ts"), "export const y = 2;\n", "utf8");

    const result = resolveModuleSpecifierDetailed("@/shared", fromFile, root);
    expect(result.status).toBe("ambiguous");
    expect(result.reason).toBe("multiple_targets");
  });

  it("rejects alias targets outside workspace root", () => {
    const { root, fromFile } = makeRepo();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "dh-module-resolve-alias-outside-"));
    fs.writeFileSync(path.join(outside, "secret.ts"), "export const y = 2;\n", "utf8");
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@secret": [path.join(outside, "secret")] } } }), "utf8");

    const result = resolveModuleSpecifierDetailed("@secret", fromFile, root);
    expect(result.status).toBe("unsafe");
    expect(result.reason).toBe("target_outside_workspace");
  });

  it("reports invalid config as degraded without crashing", () => {
    const { root, fromFile } = makeRepo();
    fs.writeFileSync(path.join(root, "tsconfig.json"), "{ invalid", "utf8");

    const result = resolveModuleSpecifierDetailed("@/missing", fromFile, root);
    expect(result.status).toBe("degraded");
    expect(result.reason).toBe("config_parse_error");
  });

  it("merges bounded local extends chains for baseUrl and paths", () => {
    const { root, fromFile } = makeRepo();
    fs.writeFileSync(path.join(root, "base.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@base/*": ["src/base/*"] } } }), "utf8");
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ extends: "./base.json", compilerOptions: { paths: { "@/*": ["src/*"] } } }), "utf8");
    fs.mkdirSync(path.join(root, "src", "base"), { recursive: true });
    const target = path.join(root, "src", "base", "item.ts");
    fs.writeFileSync(target, "export const y = 2;\n", "utf8");

    expect(resolveModuleSpecifierDetailed("@base/item", fromFile, root).resolvedAbsPath).toBe(target);
  });
});
