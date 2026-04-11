import { describe, expect, it } from "vitest";
import { parseKnowledgeCommandArgs } from "./knowledge-command-args.js";

describe("parseKnowledgeCommandArgs", () => {
  it("parses json + resume-session + query safely", () => {
    const parsed = parseKnowledgeCommandArgs(["--json", "--resume-session", "knowledge-session-1", "how", "auth", "works"]);
    expect(parsed.wantsJson).toBe(true);
    expect(parsed.resumeSessionId).toBe("knowledge-session-1");
    expect(parsed.queryInput).toBe("how auth works");
    expect(parsed.error).toBeUndefined();
  });

  it("fails when resume-session value is missing", () => {
    const parsed = parseKnowledgeCommandArgs(["--resume-session"]);
    expect(parsed.error).toContain("Missing value");
  });

  it("fails when resume-session value looks like another flag", () => {
    const parsed = parseKnowledgeCommandArgs(["--resume-session", "--json", "query"]);
    expect(parsed.error).toContain("Invalid --resume-session value");
  });
});
