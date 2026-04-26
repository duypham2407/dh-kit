import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  extractSymbolsFromFiles,
  getLanguageSupportStatus,
  listLanguageSupportBoundaries,
} from "./extract-symbols.js";

describe("language support boundaries", () => {
  it("classifies supported languages", () => {
    expect(getLanguageSupportStatus("typescript")).toBe("supported");
    expect(getLanguageSupportStatus("javascript")).toBe("supported");
  });

  it("classifies limited languages", () => {
    expect(getLanguageSupportStatus("python")).toBe("limited");
    expect(getLanguageSupportStatus("go")).toBe("limited");
    expect(getLanguageSupportStatus("rust")).toBe("limited");
  });

  it("classifies unknown surfaces as fallback-only", () => {
    expect(getLanguageSupportStatus("brainfuck")).toBe("fallback-only");
  });

  it("returns support boundaries including all three status classes", () => {
    const boundaries = listLanguageSupportBoundaries();
    expect(boundaries.length).toBeGreaterThan(0);

    const statuses = new Set(boundaries.map((boundary) => boundary.status));
    expect(statuses.has("supported")).toBe(true);
    expect(statuses.has("limited")).toBe(true);
    expect(statuses.has("fallback-only")).toBe(true);
  });

  it("extracts segmented symbols from workspaceRoot-owned content", async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "dh-symbols-segmented-"));
    const workspaceRoot = path.join(repo, "packages", "app");
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "a.ts"), "export function alpha() { return 1; }\n", "utf8");

    const symbols = await extractSymbolsFromFiles(repo, [{
      id: "file-1",
      path: "src/a.ts",
      extension: ".ts",
      language: "typescript",
      sizeBytes: 1,
      status: "indexed",
      workspaceRoot,
    }]);

    expect(symbols.find((symbol) => symbol.name === "alpha")?.fileId).toBe("file-1");
  });
});
