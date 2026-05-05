import { describe, it } from "vitest";

const legacyBaselineEnvVars = [
  "RGA_07A_GENERATE_BASELINE",
  "RGA_07A_COLLECT_RUST_COUNTS",
  "RGA_07A_NORMALIZE_PARITY",
];

const describeLegacyBaselineTool = legacyBaselineEnvVars.some((name) => process.env[name] === "1")
  ? describe
  : describe.skip;

describeLegacyBaselineTool("RGA-07A legacy baseline evidence tooling", () => {
  it("is tombstoned after RGA-08A legacy TypeScript graph deletion", () => {
    throw new Error(
      "RGA-07A baseline regeneration is disabled because RGA-08A deleted the legacy TypeScript graph extraction implementation. Preserve the existing generated RGA-07A artifacts as historical evidence instead of regenerating them.",
    );
  });
});
