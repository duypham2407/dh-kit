import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function readDoc(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function extractSection(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  expect(start, `missing section start: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf(endMarker, start + startMarker.length);
  expect(end, `missing section end: ${endMarker}`).toBeGreaterThan(start);
  return text.slice(start, end);
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

  it.each([
    {
      relativePath: ".github/release-notes.md",
      startMarker: "## First Run",
      endMarker: "## Included Artifacts",
      supportedCommands: ["dh --help", "dh status", "dh index", "dh ask"],
    },
    {
      relativePath: "README.md",
      startMarker: "## First-Time Setup",
      endMarker: "## Most Important Commands",
      supportedCommands: ["dh --help", "dh status", "dh index", "dh ask"],
    },
    {
      relativePath: "README.md",
      startMarker: "## Most Important Commands",
      endMarker: "## Version",
      supportedCommands: ["dh --help", "dh status", "dh index", "dh ask"],
    },
    {
      relativePath: "README.md",
      startMarker: "## Full User Walkthrough",
      endMarker: "## More Documentation",
      supportedCommands: ["dh --help", "dh status", "dh index", "dh ask"],
    },
    {
      relativePath: "docs/user-guide.md",
      startMarker: "## Bạn có cần clone source code không?",
      endMarker: "## Cài đặt trên macOS/Linux",
      supportedCommands: ["dh --help", "dh status", "dh index", "dh ask"],
    },
    {
      relativePath: "docs/user-guide.md",
      startMarker: "## Bắt đầu dùng trên một project",
      endMarker: "## Ý nghĩa các lệnh cơ bản",
      supportedCommands: ["dh --help", "dh status", "dh index", "dh ask"],
    },
    {
      relativePath: "docs/user-guide.md",
      startMarker: "## Khuyến nghị sử dụng hằng ngày",
      endMarker: "## Lệnh mẫu",
      supportedCommands: ["dh status", "dh index", "dh ask"],
    },
    {
      relativePath: "docs/operations/release-and-install.md",
      startMarker: "## Upgrade from release directory",
      endMarker: "## Install direct binary",
      supportedCommands: ["dh --version", "dh --help", "dh status"],
    },
  ])(
    "keeps current first-run guidance in $relativePath on supported commands",
    ({ relativePath, startMarker, endMarker, supportedCommands }) => {
      const section = extractSection(readDoc(relativePath), startMarker, endMarker);

      for (const command of supportedCommands) {
        expect(section).toContain(command);
      }
      expect(section).not.toContain("dh doctor");
    },
  );

  it.each([
    "scripts/install.sh",
    "scripts/upgrade.sh",
    "scripts/install-from-release.sh",
    "scripts/upgrade-from-release.sh",
    "scripts/install-github-release.sh",
    "scripts/upgrade-github-release.sh",
  ])("keeps %s lifecycle next/limited wording on shipped commands", (relativePath) => {
    const text = readDoc(relativePath);

    expect(text).toMatch(/--help|status|index|ask/);
    expect(text).not.toContain("dh doctor");
    expect(text).not.toMatch(/run ['"]dh doctor|\$target doctor|\$TARGET_PATH doctor|\$INSTALL_DIR\/dh doctor|\(or 'dh doctor'\)/);
  });

  it.each([
    ".github/release-notes.md",
    "README.md",
    "docs/user-guide.md",
    "docs/troubleshooting.md",
  ])("keeps %s current first-run/user guidance off dh doctor", (relativePath) => {
    const text = readDoc(relativePath);

    expect(text).toMatch(/dh --help|dh status|dh index|dh ask/);
    expect(text).not.toContain("dh doctor");
  });

  it("keeps README dh status wording scoped to workspace/index state", () => {
    const text = readDoc("README.md");
    const firstRunSection = extractSection(text, "## First-Time Setup", "## Most Important Commands");
    const commonProblemsSection = extractSection(text, "## Common Problems", "## Upgrade");

    expect(firstRunSection).toContain("workspace/index/database/index");
    expect(firstRunSection).toContain("không phải install readiness");
    expect(firstRunSection).toContain("provider config readiness");
    expect(firstRunSection).toContain("embedding-key readiness check");
    expect(firstRunSection).not.toContain("product/install/workspace/index");
    expect(firstRunSection).not.toContain("semantic config đã set chưa");
    expect(firstRunSection).not.toContain("embedding key có thiếu không");

    expect(commonProblemsSection).toContain("Embedding key không thuộc boundary của `dh status`");
    expect(commonProblemsSection).toContain("dh ask");
    expect(commonProblemsSection).not.toContain("### `status` báo thiếu embedding key");
  });
});
