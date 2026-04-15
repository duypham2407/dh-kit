import { describe, it, expect } from "vitest";
import {
  getLanguageSupportStatus,
  listLanguageSupportBoundaries,
} from "./extract-symbols.js";

describe("language support boundaries", () => {
  it("classifies supported languages", () => {
    expect(getLanguageSupportStatus("typescript")).toBe("supported");
    expect(getLanguageSupportStatus("javascript")).toBe("supported");
  });

  it("classifies limited languages", () => {
    expect(getLanguageSupportStatus("python")).toBe("limited");
    expect(getLanguageSupportStatus("go")).toBe("limited");
    expect(getLanguageSupportStatus("rust")).toBe("limited");
  });

  it("classifies unknown surfaces as fallback-only", () => {
    expect(getLanguageSupportStatus("brainfuck")).toBe("fallback-only");
  });

  it("returns support boundaries including all three status classes", () => {
    const boundaries = listLanguageSupportBoundaries();
    expect(boundaries.length).toBeGreaterThan(0);

    const statuses = new Set(boundaries.map((boundary) => boundary.status));
    expect(statuses.has("supported")).toBe(true);
    expect(statuses.has("limited")).toBe(true);
    expect(statuses.has("fallback-only")).toBe(true);
  });
});
