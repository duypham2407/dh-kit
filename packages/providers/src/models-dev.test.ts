import { afterAll, beforeAll, describe, expect, it } from "vitest";

const originalDisableModelsFetch = process.env.DH_DISABLE_MODELS_FETCH;

beforeAll(() => {
  process.env.DH_DISABLE_MODELS_FETCH = "1";
});

afterAll(() => {
  if (originalDisableModelsFetch === undefined) {
    delete process.env.DH_DISABLE_MODELS_FETCH;
  } else {
    process.env.DH_DISABLE_MODELS_FETCH = originalDisableModelsFetch;
  }
});

describe("models-dev cache metadata", () => {
  it("formats home-relative cache paths", async () => {
    const { formatCachePathForDisplay } = await import("./models-dev.js");

    expect(formatCachePathForDisplay("/Users/test/.dh/cache/models.json", "/Users/test")).toBe(
      "~/.dh/cache/models.json",
    );
  });

  it("returns cache metadata even when cache is absent", async () => {
    const { readModelsCacheMetadata } = await import("./models-dev.js");

    const metadata = await readModelsCacheMetadata("/tmp/does-not-exist-models.json");

    expect(metadata.path).toContain("models.json");
    expect(metadata.ageMs).toBeUndefined();
  });
});
