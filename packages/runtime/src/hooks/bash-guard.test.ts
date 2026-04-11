import { describe, expect, it } from "vitest";
import { evaluateBashCommand } from "./bash-guard.js";

describe("evaluateBashCommand", () => {
  it("blocks grep on strict", () => {
    const result = evaluateBashCommand("grep -r auth src", "strict");
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.suggestion).toContain("dh.find-references");
  });

  it("allows grep on advisory with suggestion", () => {
    const result = evaluateBashCommand("grep -r auth src", "advisory");
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.suggestion).toBeDefined();
  });

  it("allows git status", () => {
    const result = evaluateBashCommand("git status", "strict");
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
  });
});
