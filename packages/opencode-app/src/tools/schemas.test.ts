import { describe, expect, it } from "vitest";
import { parseToolInput } from "./schemas.js";

describe("tool schemas", () => {
  it("parses valid tool inputs", () => {
    expect(parseToolInput("read", { path: "README.md", offset: 2, limit: 10 })).toMatchObject({
      ok: true,
      value: { path: "README.md", offset: 2, limit: 10 },
    });
    expect(parseToolInput("shell", { command: "npm test -- tool-registry" })).toMatchObject({
      ok: true,
      value: { command: "npm test -- tool-registry" },
    });
    expect(parseToolInput("grep", { pattern: "ToolRunner", include: "packages/**/*.ts" })).toMatchObject({
      ok: true,
      value: { pattern: "ToolRunner", include: "packages/**/*.ts" },
    });
    expect(parseToolInput("write", { path: "tmp/out.txt", content: "hello" })).toMatchObject({
      ok: true,
      value: { path: "tmp/out.txt", content: "hello" },
    });
  });

  it("rejects invalid input before execution", () => {
    expect(parseToolInput("read", { path: "" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("read input is invalid"),
    });
    expect(parseToolInput("shell", {})).toMatchObject({
      ok: false,
      error: expect.stringContaining("shell input is invalid"),
    });
    expect(parseToolInput("grep", { pattern: "" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("grep input is invalid"),
    });
    expect(parseToolInput("write", { path: "a.txt" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("write input is invalid"),
    });
  });

  it("rejects unknown tool names", () => {
    expect(parseToolInput("webfetch", {})).toMatchObject({
      ok: false,
      error: "Unknown tool 'webfetch'.",
    });
  });
});
