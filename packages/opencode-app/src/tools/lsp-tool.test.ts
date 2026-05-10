import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LspClient } from "../lsp/lsp-client.js";
import { LspService } from "../lsp/lsp-service.js";
import { executeLspDiagnosticsTool, executeLspHoverTool } from "./lsp-tool.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-lsp-tool-"));
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "app.ts"), "const x = 1;\n");
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("lsp tool wrappers", () => {
  it("returns diagnostics as a tool result", async () => {
    const repo = makeRepo();
    const client: LspClient = {
      async diagnostics(filePath) {
        return [{
          path: filePath,
          severity: "warning",
          message: "unused",
          range: { startLine: 1, startCharacter: 6, endLine: 1, endCharacter: 7 },
          source: "tsserver",
        }];
      },
    };

    const result = await executeLspDiagnosticsTool({
      service: new LspService({ repoRoot: repo, enablement: "manual", client }),
      input: { path: "src/app.ts" },
    });

    expect(result).toMatchObject({
      toolName: "lsp_diagnostics",
      status: "succeeded",
      output: { diagnostics: [{ severity: "warning" }] },
    });
  });

  it("returns unsupported when hover has no configured client method", async () => {
    const repo = makeRepo();

    const result = await executeLspHoverTool({
      service: new LspService({ repoRoot: repo, enablement: "manual" }),
      input: { path: "src/app.ts", line: 1, character: 1 },
    });

    expect(result).toMatchObject({
      toolName: "lsp_hover",
      status: "unsupported",
      error: "LSP client is not configured.",
    });
  });
});
