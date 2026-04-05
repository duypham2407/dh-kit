import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeAnnIndex, readAnnIndex } from "./ann-index.js";

describe("ann-index", () => {
  it("writes and reads ANN cache entries", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dh-ann-test-"));
    const filePath = await writeAnnIndex(repoRoot, "test-model", [
      {
        id: "emb-1",
        chunkId: "chunk-1",
        modelName: "test-model",
        vector: [0.1, 0.2],
        vectorDim: 2,
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(fs.existsSync(filePath)).toBe(true);
    const loaded = await readAnnIndex(repoRoot, "test-model");
    expect(loaded?.entries).toHaveLength(1);
    expect(loaded?.entries[0]?.chunkId).toBe("chunk-1");
  });
});
