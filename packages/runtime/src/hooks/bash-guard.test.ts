import { describe, expect, it } from "vitest";
import { evaluateBashCommand, evaluateShellPermission } from "./bash-guard.js";

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

  it.each(["npm test", "cargo test", "go test ./...", "pytest", "yarn test", "bun test", "eslint ."])(
    "explicitly allows verification command '%s' on strict",
    (command) => {
      const result = evaluateBashCommand(command, "strict");
      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.reason).toContain("Allowed command prefix");
    },
  );

  it("denies shell when permission level is deny", () => {
    const result = evaluateShellPermission("git status", "deny");
    expect(result.allowed).toBe(false);
    expect(result.requiresPermission).toBe(false);
    expect(result.reason).toContain("denied");
  });

  it("requests permission when permission level is ask", () => {
    const result = evaluateShellPermission("git status", "ask");
    expect(result.allowed).toBe(false);
    expect(result.requiresPermission).toBe(true);
    expect(result.reason).toContain("requires permission");
  });

  it("allows explicit shell permission without strict auto policy", () => {
    const result = evaluateShellPermission("grep -r alpha src", "allow");
    expect(result.allowed).toBe(true);
    expect(result.requiresPermission).toBe(false);
    expect(result.suggestion).toContain("Grep tool");
  });

  it("blocks substitution-rule commands for automatic approval", () => {
    const result = evaluateShellPermission("grep -r alpha src", "auto_approve_with_policy");
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("Blocked by bash guard");
  });
});
