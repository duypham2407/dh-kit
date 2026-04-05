import { openDhDatabase } from "../db.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import { createId } from "../../../../shared/src/utils/ids.js";

export type ChunkRow = {
  id: string;
  fileId: string;
  filePath: string;
  symbolId: string | undefined;
  lineStart: number;
  lineEnd: number;
  content: string;
  contentHash: string;
  tokenEstimate: number;
  language: string;
  createdAt: string;
};

type RawChunkRow = {
  id: string;
  file_id: string;
  file_path: string;
  symbol_id: string | null;
  line_start: number;
  line_end: number;
  content: string;
  content_hash: string;
  token_estimate: number;
  language: string;
  created_at: string;
};

function toChunkRow(raw: RawChunkRow): ChunkRow {
  return {
    id: raw.id,
    fileId: raw.file_id,
    filePath: raw.file_path,
    symbolId: raw.symbol_id ?? undefined,
    lineStart: raw.line_start,
    lineEnd: raw.line_end,
    content: raw.content,
    contentHash: raw.content_hash,
    tokenEstimate: raw.token_estimate,
    language: raw.language,
    createdAt: raw.created_at,
  };
}

export class ChunksRepo {
  constructor(private readonly repoRoot: string) {}

  save(input: Omit<ChunkRow, "id" | "createdAt">): ChunkRow {
    const database = openDhDatabase(this.repoRoot);
    const id = createId("chunk");
    const createdAt = nowIso();
    database.prepare(`
      INSERT INTO chunks (id, file_id, file_path, symbol_id, line_start, line_end, content, content_hash, token_estimate, language, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        content_hash = excluded.content_hash,
        token_estimate = excluded.token_estimate
    `).run(id, input.fileId, input.filePath, input.symbolId ?? null, input.lineStart, input.lineEnd, input.content, input.contentHash, input.tokenEstimate, input.language, createdAt);
    return { id, createdAt, ...input };
  }

  saveBatch(inputs: Array<Omit<ChunkRow, "id" | "createdAt">>): ChunkRow[] {
    const database = openDhDatabase(this.repoRoot);
    const createdAt = nowIso();
    const stmt = database.prepare(`
      INSERT INTO chunks (id, file_id, file_path, symbol_id, line_start, line_end, content, content_hash, token_estimate, language, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        content_hash = excluded.content_hash,
        token_estimate = excluded.token_estimate
    `);
    const rows: ChunkRow[] = [];
    for (const input of inputs) {
      const id = createId("chunk");
      stmt.run(id, input.fileId, input.filePath, input.symbolId ?? null, input.lineStart, input.lineEnd, input.content, input.contentHash, input.tokenEstimate, input.language, createdAt);
      rows.push({ id, createdAt, ...input });
    }
    return rows;
  }

  findById(id: string): ChunkRow | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare("SELECT * FROM chunks WHERE id = ?").get(id) as RawChunkRow | undefined;
    return row ? toChunkRow(row) : undefined;
  }

  findByFileId(fileId: string): ChunkRow[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare("SELECT * FROM chunks WHERE file_id = ?").all(fileId) as RawChunkRow[];
    return rows.map(toChunkRow);
  }

  findByContentHash(contentHash: string): ChunkRow | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare("SELECT * FROM chunks WHERE content_hash = ? LIMIT 1").get(contentHash) as RawChunkRow | undefined;
    return row ? toChunkRow(row) : undefined;
  }

  findContentHashesByFileId(fileId: string): string[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare("SELECT content_hash FROM chunks WHERE file_id = ? ORDER BY line_start ASC").all(fileId) as Array<{ content_hash: string }>;
    return rows.map((row) => row.content_hash);
  }

  listAll(): ChunkRow[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare("SELECT * FROM chunks ORDER BY created_at DESC").all() as RawChunkRow[];
    return rows.map(toChunkRow);
  }

  deleteByFileId(fileId: string): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
  }

  /**
   * Find IDs of all chunks for a given file without loading content.
   * Used to batch-delete associated embeddings before deleting chunks.
   */
  findIdsByFileId(fileId: string): string[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare("SELECT id FROM chunks WHERE file_id = ?").all(fileId) as { id: string }[];
    return rows.map((r) => r.id);
  }

  count(): number {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare("SELECT COUNT(*) as count FROM chunks").get() as { count: number };
    return row.count;
  }
}
