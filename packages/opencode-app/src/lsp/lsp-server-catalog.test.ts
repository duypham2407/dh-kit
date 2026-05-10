import { describe, expect, it } from "vitest";
import { findLspServerForFile, listLspServers } from "./lsp-server-catalog.js";

describe("lsp server catalog", () => {
  it("lists TypeScript and JavaScript support", () => {
    const servers = listLspServers();

    expect(servers[0]).toMatchObject({
      id: "typescript-language-server",
      languages: expect.arrayContaining(["typescript", "javascript"]),
      mode: "manual",
    });
  });

  it("finds a server by file extension", () => {
    expect(findLspServerForFile("src/app.ts")?.id).toBe("typescript-language-server");
    expect(findLspServerForFile("src/app.jsx")?.id).toBe("typescript-language-server");
    expect(findLspServerForFile("README.md")).toBeUndefined();
  });
});
