import { describe, expect, it } from "vitest";
import { runBrowserVerification } from "./verification.js";

describe("runBrowserVerification", () => {
  it("returns no-op when browser verification is not required", () => {
    const result = runBrowserVerification({
      objective: "refactor backend parser",
      routedMcps: ["augment_context_engine"],
      evidencePolicy: "optional",
    });

    expect(result.required).toBe(false);
    expect(result.executedChecks).toHaveLength(0);
    expect(result.evidence).toHaveLength(0);
  });

  it("routes playwright and chrome-devtools checks when browser objective is present", () => {
    const result = runBrowserVerification({
      objective: "verify browser UI checkout flow",
      routedMcps: ["playwright", "chrome-devtools"],
      evidencePolicy: "required",
    });

    expect(result.required).toBe(true);
    expect(result.executedChecks).toContain("Playwright smoke verification flow");
    expect(result.executedChecks).toContain("Chrome DevTools diagnostics flow");
    expect(result.evidence.some((item) => item.includes("browser verification evidence"))).toBe(true);
  });

  it("emits limitations when required browser MCPs are missing", () => {
    const result = runBrowserVerification({
      objective: "run browser verification",
      routedMcps: ["augment_context_engine"],
      evidencePolicy: "required",
    });

    expect(result.required).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.outcome).toBe("insufficient_evidence");
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.evidence.some((item) => item.includes("browser verification evidence recorded"))).toBe(false);
  });

  it("marks not_required outcome when browser verification is not required", () => {
    const result = runBrowserVerification({
      objective: "backend refactor",
      routedMcps: [],
      evidencePolicy: "optional",
    });

    expect(result.outcome).toBe("not_required");
  });
});
