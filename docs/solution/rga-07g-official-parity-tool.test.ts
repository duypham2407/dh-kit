import { describe, it } from "vitest";

const describeOfficialParityTool = process.env.RGA_07G_GENERATE_OFFICIAL_PARITY === "1" ? describe : describe.skip;

describeOfficialParityTool("RGA-07G official corpus parity evidence tooling", () => {
  it("is tombstoned after RGA-08A legacy TypeScript graph deletion", () => {
    throw new Error(
      "RGA-07G TypeScript-baseline parity regeneration is disabled because RGA-08A deleted the legacy TypeScript graph extraction implementation. Preserve the existing generated RGA-07G artifacts as historical evidence instead of regenerating them.",
    );
  });
});
