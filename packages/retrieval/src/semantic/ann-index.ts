import fs from "node:fs/promises";
import path from "node:path";
import type { EmbeddingRow } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { resolveDhPaths } from "../../../shared/src/utils/path.js";

export type AnnIndexEntry = {
  chunkId: string;
  modelName: string;
  vector: number[];
};

export type AnnIndex = {
  modelName: string;
  entries: AnnIndexEntry[];
};

export async function writeAnnIndex(repoRoot: string, modelName: string, embeddings: EmbeddingRow[]): Promise<string> {
  const cacheDir = resolveDhPaths(repoRoot).cacheHome;
  await fs.mkdir(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, `ann-${modelName}.json`);
  const payload: AnnIndex = {
    modelName,
    entries: embeddings.map((embedding) => ({
      chunkId: embedding.chunkId,
      modelName: embedding.modelName,
      vector: embedding.vector,
    })),
  };
  await fs.writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  return filePath;
}

export async function readAnnIndex(repoRoot: string, modelName: string): Promise<AnnIndex | undefined> {
  const filePath = path.join(resolveDhPaths(repoRoot).cacheHome, `ann-${modelName}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as AnnIndex;
  } catch {
    return undefined;
  }
}
