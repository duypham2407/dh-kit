import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function readDoc(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Rust host lifecycle operator wording", () => {
  it.each([
    "README.md",
    "docs/user-guide.md",
    "docs/operations/release-and-install.md",
  ])("keeps %s bounded to first-wave Rust-host knowledge commands", (relativePath) => {
    const text = readDoc(relativePath);

    expect(text).toContain("Rust-host");
    expect(text).toContain("ask");
    expect(text).toContain("explain");
    expect(text).toContain("trace");
    expect(text).toContain("TypeScript");
    expect(text).toContain("legacy/compatibility");
    expect(text).toMatch(/Linux.*macOS|macOS.*Linux/);
    expect(text).toMatch(/full\s+workflow-lane parity/);
    expect(text).not.toContain("universal lifecycle authority");
    expect(text).not.toContain("generic process manager");
  });

  it.each([
    "README.md",
    "docs/user-guide.md",
  ])("keeps %s build-evidence wording bounded and legacy packets non-canonical", (relativePath) => {
    const text = readDoc(relativePath);

    expect(text).toContain("query.buildEvidence");
    expect(text).toMatch(/bounded broad|Bounded broad/);
    expect(text).toMatch(/finite static subject|finite static repository subject/);
    expect(text).toMatch(/legacy retrieval.*non-canonical|non-canonical.*legacy retrieval|compatibility only/si);
    expect(text).not.toContain("universal understanding");
    expect(text).not.toContain("universal repository understanding");
    expect(text).not.toContain("runtime tracing is supported");
    expect(text).not.toContain("daemon support");
    expect(text).not.toContain("remote support");
    expect(text).not.toContain("Windows is supported");
  });
});
