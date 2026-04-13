import { openDhDatabase } from "../db.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import { createId } from "../../../../shared/src/utils/ids.js";

export type EmbeddingRow = {
  id: string;
  chunkId: string;
  modelName: string;
  vector: number[];
  vectorDim: number;
  createdAt: string;
};

type RawEmbeddingRow = {
  id: string;
  chunk_id: string;
  model_name: string;
  vector_json: string;
  vector_dim: number;
  created_at: string;
};

function toEmbeddingRow(raw: RawEmbeddingRow): EmbeddingRow {
  return {
    id: raw.id,
    chunkId: raw.chunk_id,
    modelName: raw.model_name,
    vector: JSON.parse(raw.vector_json) as number[],
    vectorDim: raw.vector_dim,
    createdAt: raw.created_at,
  };
}

export class EmbeddingsRepo {
  constructor(private readonly repoRoot: string) {}

  save(input: Omit<EmbeddingRow, "id" | "createdAt">): EmbeddingRow {
    const database = openDhDatabase(this.repoRoot);
    const id = createId("emb");
    const createdAt = nowIso();
    database.prepare(`
      INSERT INTO embeddings (id, chunk_id, model_name, vector_json, vector_dim, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        vector_json = excluded.vector_json,
        vector_dim = excluded.vector_dim
    `).run(id, input.chunkId, input.modelName, JSON.stringify(input.vector), input.vectorDim, createdAt);
    return { id, createdAt, ...input };
  }

  saveBatch(inputs: Array<Omit<EmbeddingRow, "id" | "createdAt">>): EmbeddingRow[] {
    const database = openDhDatabase(this.repoRoot);
    const createdAt = nowIso();
    const stmt = database.prepare(`
      INSERT INTO embeddings (id, chunk_id, model_name, vector_json, vector_dim, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        vector_json = excluded.vector_json,
        vector_dim = excluded.vector_dim
    `);
    const rows: EmbeddingRow[] = [];
    for (const input of inputs) {
      const id = createId("emb");
      stmt.run(id, input.chunkId, input.modelName, JSON.stringify(input.vector), input.vectorDim, createdAt);
      rows.push({ id, createdAt, ...input });
    }
    return rows;
  }

  findByChunkId(chunkId: string): EmbeddingRow | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare("SELECT * FROM embeddings WHERE chunk_id = ? LIMIT 1").get(chunkId) as RawEmbeddingRow | undefined;
    return row ? toEmbeddingRow(row) : undefined;
  }

  findByChunkIds(chunkIds: string[]): EmbeddingRow[] {
    if (chunkIds.length === 0) return [];
    const database = openDhDatabase(this.repoRoot);
    const placeholders = chunkIds.map(() => "?").join(", ");
    const rows = database.prepare(`SELECT * FROM embeddings WHERE chunk_id IN (${placeholders})`).all(...chunkIds) as RawEmbeddingRow[];
    return rows.map(toEmbeddingRow);
  }

  listByModel(modelName: string): EmbeddingRow[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare("SELECT * FROM embeddings WHERE model_name = ? ORDER BY created_at DESC").all(modelName) as RawEmbeddingRow[];
    return rows.map(toEmbeddingRow);
  }

  deleteByChunkId(chunkId: string): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare("DELETE FROM embeddings WHERE chunk_id = ?").run(chunkId);
  }

  deleteByChunkIds(chunkIds: string[]): void {
    if (chunkIds.length === 0) return;
    const database = openDhDatabase(this.repoRoot);
    const placeholders = chunkIds.map(() => "?").join(", ");
    database.prepare(`DELETE FROM embeddings WHERE chunk_id IN (${placeholders})`).run(...chunkIds);
  }

  deleteByModel(modelName: string): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare("DELETE FROM embeddings WHERE model_name = ?").run(modelName);
  }

  deleteOrphaned(): number {
    const database = openDhDatabase(this.repoRoot);
    const result = database.prepare(
      "DELETE FROM embeddings WHERE chunk_id NOT IN (SELECT id FROM chunks)",
    ).run() as { changes: number };
    return result.changes;
  }

  countOrphaned(): number {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare(
      "SELECT COUNT(*) as count FROM embeddings WHERE chunk_id NOT IN (SELECT id FROM chunks)",
    ).get() as { count: number };
    return row.count;
  }

  countByModel(modelName: string): number {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare("SELECT COUNT(*) as count FROM embeddings WHERE model_name = ?").get(modelName) as { count: number };
    return row.count;
  }
}
