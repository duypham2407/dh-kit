import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LspClient } from "./lsp-client.js";
import { LspService } from "./lsp-service.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-lsp-service-"));
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "app.ts"), "const x: string = 1;\n");
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("LspService", () => {
  it("returns diagnostics from an injected client", async () => {
    const repo = makeRepo();
    const client: LspClient = {
      async diagnostics(filePath) {
        return [{
          path: filePath,
          severity: "error",
          message: "Type number is not assignable to string",
          range: { startLine: 1, startCharacter: 18, endLine: 1, endCharacter: 19 },
          source: "tsserver",
        }];
      },
    };

    const report = await new LspService({ repoRoot: repo, enablement: "manual", client }).diagnostics("src/app.ts");

    expect(report).toMatchObject({
      available: true,
      file: "src/app.ts",
      serverId: "typescript-language-server",
      diagnostics: [{ severity: "error", source: "tsserver" }],
    });
  });

  it("reports unavailable when no client is configured", async () => {
    const repo = makeRepo();

    const report = await new LspService({ repoRoot: repo, enablement: "manual" }).diagnostics("src/app.ts");

    expect(report).toMatchObject({
      available: false,
      reason: "LSP client is not configured.",
      diagnostics: [],
    });
  });

  it("rejects files outside the repository", async () => {
    const repo = makeRepo();

    await expect(new LspService({ repoRoot: repo, enablement: "manual" }).diagnostics("../x.ts"))
      .rejects.toThrow("outside the repository");
  });
});
