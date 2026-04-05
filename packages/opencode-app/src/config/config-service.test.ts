import { describe, it, expect, afterEach } from "vitest";
import { createConfigService } from "./config-service.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { runEmbeddingPipeline, reembedAllChunks, createEmbeddingProvider } from "../../../retrieval/src/semantic/embedding-pipeline.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-cfg-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("ConfigService", () => {
  describe("semantic mode", () => {
    it("defaults to always", () => {
      const svc = createConfigService(makeTmpRepo());
      expect(svc.getSemanticMode()).toBe("always");
    });

    it("can set and read semantic mode", () => {
      const repo = makeTmpRepo();
      const svc = createConfigService(repo);
      svc.setSemanticMode("off");
      // Re-create to confirm persistence (same cached DB)
      const svc2 = createConfigService(repo);
      expect(svc2.getSemanticMode()).toBe("off");
    });

    it("cycles through all valid modes", () => {
      const repo = makeTmpRepo();
      const svc = createConfigService(repo);
      for (const mode of ["always", "auto", "off"] as const) {
        svc.setSemanticMode(mode);
        expect(svc.getSemanticMode()).toBe(mode);
      }
    });
  });

  describe("embedding config", () => {
    it("returns default config when nothing is stored", () => {
      const svc = createConfigService(makeTmpRepo());
      const cfg = svc.getEmbeddingConfig();
      expect(cfg.providerId).toBe("openai");
      expect(cfg.modelName).toBe("text-embedding-3-small");
      expect(cfg.dimensions).toBe(1536);
    });

    it("merges partial overrides with defaults", () => {
      const repo = makeTmpRepo();
      const svc = createConfigService(repo);
      svc.setEmbeddingConfig({ modelName: "text-embedding-3-large", dimensions: 3072 });

      const svc2 = createConfigService(repo);
      const cfg = svc2.getEmbeddingConfig();
      expect(cfg.modelName).toBe("text-embedding-3-large");
      expect(cfg.dimensions).toBe(3072);
      // Defaults preserved
      expect(cfg.providerId).toBe("openai");
      expect(cfg.apiKeyEnvVar).toBe("OPENAI_API_KEY");
    });

    it("preserves previous overrides when setting new partial config", () => {
      const repo = makeTmpRepo();
      const svc = createConfigService(repo);

      svc.setEmbeddingConfig({ modelName: "custom-model" });
      svc.setEmbeddingConfig({ dimensions: 768 });

      const cfg = svc.getEmbeddingConfig();
      expect(cfg.modelName).toBe("custom-model"); // kept from first write
      expect(cfg.dimensions).toBe(768); // from second write
      expect(cfg.providerId).toBe("openai"); // default
    });
  });

  describe("embedding model change reembed workflow", () => {
    it("reembeds all chunks when model changes", async () => {
      const original = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const repo = makeTmpRepo();
      const svc = createConfigService(repo);

      // Seed some chunks and embeddings with the default model
      const provider = createEmbeddingProvider();
      await runEmbeddingPipeline(repo, [
        { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 5, content: "const x = 1;", language: "typescript" },
        { fileId: "f2", filePath: "b.ts", lineStart: 1, lineEnd: 5, content: "const y = 2;", language: "typescript" },
      ], provider);

      const embRepo = new EmbeddingsRepo(repo);
      const chunksRepo = new ChunksRepo(repo);
      expect(embRepo.countByModel("text-embedding-3-small")).toBe(2);
      expect(chunksRepo.count()).toBe(2);

      // Simulate model change: update config, then reembed
      const oldModel = svc.getEmbeddingConfig().modelName;
      svc.setEmbeddingConfig({ modelName: "text-embedding-3-large", dimensions: 3072 });

      const newConfig = svc.getEmbeddingConfig();
      const newProvider = createEmbeddingProvider(newConfig);
      const result = await reembedAllChunks(repo, newProvider, oldModel);

      // Old model embeddings should be gone, new ones present
      expect(result.embeddingsStored).toBe(2);
      expect(embRepo.countByModel("text-embedding-3-small")).toBe(0);
      // Note: mock provider's modelName comes from the config, but embeddings are stored
      // with the model name from the provider config
      expect(embRepo.countByModel("text-embedding-3-large")).toBe(2);

      // Chunks should be unchanged
      expect(chunksRepo.count()).toBe(2);

      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    });
  });
});
