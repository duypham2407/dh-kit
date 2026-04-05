/**
 * HNSW (Hierarchical Navigable Small World) ANN index.
 *
 * Replaces the previous flat-file JSON cache + linear scan with an
 * approximate nearest-neighbor graph search. Search complexity drops from
 * O(N) to O(log N), making semantic retrieval practical at production scale
 * (100k+ embeddings) without any external binary dependencies.
 *
 * Algorithm reference: Malkov & Yashunin 2018, "Efficient and robust
 * approximate nearest neighbor search using Hierarchical Navigable Small
 * World graphs."
 *
 * Serialization: the index is persisted as a single JSON file at
 * `.dh/cache/hnsw-<modelName>.json` and loaded lazily on first query.
 * A flat fallback list is also stored so that `writeAnnIndex` /
 * `readAnnIndex` remain backward-compatible with the rest of the codebase.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { EmbeddingRow } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { resolveDhPaths } from "../../../shared/src/utils/path.js";

// ---------------------------------------------------------------------------
// Public types (kept backward-compatible with existing callers)
// ---------------------------------------------------------------------------

export type AnnIndexEntry = {
  chunkId: string;
  modelName: string;
  vector: number[];
};

/** @deprecated Use HnswIndex directly for search. Kept for compatibility. */
export type AnnIndex = {
  modelName: string;
  entries: AnnIndexEntry[];
};

// ---------------------------------------------------------------------------
// HNSW parameters
// ---------------------------------------------------------------------------

/** Tunable HNSW hyper-parameters. */
export type HnswConfig = {
  /** Maximum bidirectional connections per node per layer. Default 16. */
  m: number;
  /** Dynamic candidate list size during construction. Default 200. */
  efConstruction: number;
  /** Default search-time beam width. Larger = more accurate, slower. Default 50. */
  efSearch: number;
};

export const DEFAULT_HNSW_CONFIG: HnswConfig = {
  m: 16,
  efConstruction: 200,
  efSearch: 50,
};

// ---------------------------------------------------------------------------
// Core math
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

/** Distance = 1 - cosine similarity (0 is identical, 2 is opposite). */
function distance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

// ---------------------------------------------------------------------------
// Min-heap for candidate priority queue  (keyed by distance, ascending)
// ---------------------------------------------------------------------------

type HeapItem = { id: number; dist: number };

class MinHeap {
  private data: HeapItem[] = [];

  get size(): number { return this.data.length; }

  push(item: HeapItem): void {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): HeapItem | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  peek(): HeapItem | undefined { return this.data[0]; }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent]!.dist <= this.data[i]!.dist) break;
      [this.data[parent], this.data[i]] = [this.data[i]!, this.data[parent]!];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.data.length;
    for (;;) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l]!.dist < this.data[smallest]!.dist) smallest = l;
      if (r < n && this.data[r]!.dist < this.data[smallest]!.dist) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i]!, this.data[smallest]!];
      i = smallest;
    }
  }
}

// Max-heap variant (largest distance on top) for result pruning
class MaxHeap {
  private data: HeapItem[] = [];

  get size(): number { return this.data.length; }

  push(item: HeapItem): void {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): HeapItem | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  peek(): HeapItem | undefined { return this.data[0]; }

  toSortedAsc(): HeapItem[] {
    return [...this.data].sort((a, b) => a.dist - b.dist);
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent]!.dist >= this.data[i]!.dist) break;
      [this.data[parent], this.data[i]] = [this.data[i]!, this.data[parent]!];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.data.length;
    for (;;) {
      let largest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l]!.dist > this.data[largest]!.dist) largest = l;
      if (r < n && this.data[r]!.dist > this.data[largest]!.dist) largest = r;
      if (largest === i) break;
      [this.data[largest], this.data[i]] = [this.data[i]!, this.data[largest]!];
      i = largest;
    }
  }
}

// ---------------------------------------------------------------------------
// Serialized format
// ---------------------------------------------------------------------------

type HnswSerialNode = {
  id: number;
  chunkId: string;
  vector: number[];
  /** neighbors[layer] = array of neighbor node ids */
  neighbors: number[][];
};

type HnswSerial = {
  version: number;
  modelName: string;
  M: number;
  efConstruction: number;
  entryPointId: number;
  maxLayer: number;
  nodes: HnswSerialNode[];
};

// ---------------------------------------------------------------------------
// HnswIndex
// ---------------------------------------------------------------------------

export class HnswIndex {
  private nodes: Map<number, { chunkId: string; vector: number[]; neighbors: number[][] }> = new Map();
  private entryPointId = -1;
  private maxLayer = 0;
  private nextId = 0;
  readonly modelName: string;
  readonly config: HnswConfig;

  constructor(modelName: string, config?: Partial<HnswConfig>) {
    this.modelName = modelName;
    this.config = { ...DEFAULT_HNSW_CONFIG, ...config };
  }

  get size(): number { return this.nodes.size; }

  // ── Build ────────────────────────────────────────────────────────────────

  /**
   * Insert all entries into the index. Call once with the full dataset.
   * For incremental updates call insertOne per new entry.
   */
  buildFromEntries(entries: AnnIndexEntry[]): void {
    for (const entry of entries) {
      this.insertOne(entry.chunkId, entry.vector);
    }
  }

  insertOne(chunkId: string, vector: number[]): void {
    if (vector.length === 0) return;

    const id = this.nextId++;
    const nodeLayer = this._randomLayer();

    this.nodes.set(id, { chunkId, vector, neighbors: Array.from({ length: nodeLayer + 1 }, () => []) });

    if (this.entryPointId === -1) {
      this.entryPointId = id;
      this.maxLayer = nodeLayer;
      return;
    }

    let currentEntry = this.entryPointId;

    // Greedy descent from maxLayer down to nodeLayer + 1
    for (let lc = this.maxLayer; lc > nodeLayer; lc--) {
      const closest = this._searchLayer(vector, currentEntry, 1, lc);
      if (closest.length > 0) currentEntry = closest[0]!.id;
    }

    // Insert at layers 0..nodeLayer
    for (let lc = Math.min(nodeLayer, this.maxLayer); lc >= 0; lc--) {
      const candidates = this._searchLayer(vector, currentEntry, this.config.efConstruction, lc);
      const selected = this._selectNeighbors(vector, candidates, this.config.m);

      const node = this.nodes.get(id)!;
      if (lc < node.neighbors.length) {
        node.neighbors[lc] = selected.map((c) => c.id);
      }

      // Bidirectional connections
      for (const neighbor of selected) {
        const neighborNode = this.nodes.get(neighbor.id)!;
        if (lc < neighborNode.neighbors.length) {
          neighborNode.neighbors[lc]!.push(id);
          if (neighborNode.neighbors[lc]!.length > this.config.m * 2) {
            neighborNode.neighbors[lc] = this._pruneConnections(
              neighborNode.vector,
              neighborNode.neighbors[lc]!,
              this.config.m,
            );
          }
        }
      }

      if (candidates.length > 0) currentEntry = candidates[0]!.id;
    }

    if (nodeLayer > this.maxLayer) {
      this.maxLayer = nodeLayer;
      this.entryPointId = id;
    }
  }

  // ── Search ───────────────────────────────────────────────────────────────

  /**
   * Find the k nearest neighbors to a query vector.
   * Returns entries sorted by similarity descending (closest first).
   */
  search(queryVector: number[], k: number, ef = this.config.efSearch): Array<{ chunkId: string; similarity: number }> {
    if (this.entryPointId === -1 || this.nodes.size === 0) return [];

    let currentEntry = this.entryPointId;

    // Greedy descent to layer 1
    for (let lc = this.maxLayer; lc >= 1; lc--) {
      const closest = this._searchLayer(queryVector, currentEntry, 1, lc);
      if (closest.length > 0) currentEntry = closest[0]!.id;
    }

    // Search at layer 0 with full ef
    const candidates = this._searchLayer(queryVector, currentEntry, Math.max(ef, k), 0);

    return candidates
      .slice(0, k)
      .map((c) => {
        const node = this.nodes.get(c.id)!;
        return { chunkId: node.chunkId, similarity: 1 - c.dist };
      });
  }

  // ── Serialization ────────────────────────────────────────────────────────

  serialize(): HnswSerial {
    const nodeList: HnswSerialNode[] = [];
    for (const [id, node] of this.nodes) {
      nodeList.push({ id, chunkId: node.chunkId, vector: node.vector, neighbors: node.neighbors });
    }
    return {
      version: 1,
      modelName: this.modelName,
      M: this.config.m,
      efConstruction: this.config.efConstruction,
      entryPointId: this.entryPointId,
      maxLayer: this.maxLayer,
      nodes: nodeList,
    };
  }

  static deserialize(serial: HnswSerial): HnswIndex {
    const idx = new HnswIndex(serial.modelName, {
      m: serial.M,
      efConstruction: serial.efConstruction,
    });
    idx.entryPointId = serial.entryPointId;
    idx.maxLayer = serial.maxLayer;
    idx.nextId = 0;
    for (const sn of serial.nodes) {
      idx.nodes.set(sn.id, { chunkId: sn.chunkId, vector: sn.vector, neighbors: sn.neighbors });
      if (sn.id >= idx.nextId) idx.nextId = sn.id + 1;
    }
    return idx;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _randomLayer(): number {
    // Exponential distribution: P(layer = k) ~ (1/m)^k
    let level = 0;
    while (Math.random() < 1 / this.config.m && level < 16) level++;
    return level;
  }

  private _searchLayer(
    queryVector: number[],
    entryId: number,
    ef: number,
    layer: number,
  ): HeapItem[] {
    const entryNode = this.nodes.get(entryId);
    if (!entryNode) return [];

    const visited = new Set<number>([entryId]);
    const entryDist = distance(queryVector, entryNode.vector);

    const candidates = new MinHeap(); // min-dist on top
    const results = new MaxHeap();   // max-dist on top (worst result at top for pruning)

    candidates.push({ id: entryId, dist: entryDist });
    results.push({ id: entryId, dist: entryDist });

    while (candidates.size > 0) {
      const current = candidates.pop()!;

      // If the best candidate is worse than worst result, stop
      if (results.size >= ef && current.dist > results.peek()!.dist) break;

      const node = this.nodes.get(current.id);
      if (!node || layer >= node.neighbors.length) continue;

      for (const neighborId of node.neighbors[layer]!) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborNode = this.nodes.get(neighborId);
        if (!neighborNode) continue;

        const dist = distance(queryVector, neighborNode.vector);

        if (results.size < ef || dist < results.peek()!.dist) {
          candidates.push({ id: neighborId, dist });
          results.push({ id: neighborId, dist });
          if (results.size > ef) results.pop();
        }
      }
    }

    return results.toSortedAsc();
  }

  private _selectNeighbors(queryVector: number[], candidates: HeapItem[], m: number): HeapItem[] {
    // Simple heuristic: take the m closest candidates
    return candidates.slice(0, m);
  }

  private _pruneConnections(nodeVector: number[], neighborIds: number[], m: number): number[] {
    const scored = neighborIds
      .map((id) => {
        const n = this.nodes.get(id);
        return n ? { id, dist: distance(nodeVector, n.vector) } : null;
      })
      .filter((x): x is HeapItem => x !== null)
      .sort((a, b) => a.dist - b.dist);
    return scored.slice(0, m).map((s) => s.id);
  }
}

// ---------------------------------------------------------------------------
// File persistence helpers
// ---------------------------------------------------------------------------

function projectCacheDir(repoRoot: string): string {
  return path.join(resolveDhPaths(repoRoot).projectDhDir, "cache");
}

function hnswFilePath(repoRoot: string, modelName: string): string {
  return path.join(projectCacheDir(repoRoot), `hnsw-${modelName}.json`);
}

/** Write HNSW index to disk (async). */
export async function writeHnswIndex(repoRoot: string, index: HnswIndex): Promise<string> {
  const cacheDir = projectCacheDir(repoRoot);
  await fs.mkdir(cacheDir, { recursive: true });
  const filePath = hnswFilePath(repoRoot, index.modelName);
  const serial = index.serialize();
  await fs.writeFile(filePath, JSON.stringify(serial), "utf8");
  return filePath;
}

/** Read HNSW index from disk. Returns undefined if file missing or corrupt. */
export async function readHnswIndex(repoRoot: string, modelName: string): Promise<HnswIndex | undefined> {
  const filePath = hnswFilePath(repoRoot, modelName);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const serial = JSON.parse(raw) as HnswSerial;
    if (serial.version !== 1) return undefined;
    return HnswIndex.deserialize(serial);
  } catch {
    return undefined;
  }
}

/** Synchronous variant used in hot search paths. Returns undefined on failure. */
export function readHnswIndexSync(repoRoot: string, modelName: string): HnswIndex | undefined {
  const filePath = hnswFilePath(repoRoot, modelName);
  try {
    const raw = fsSync.readFileSync(filePath, "utf8");
    const serial = JSON.parse(raw) as HnswSerial;
    if (serial.version !== 1) return undefined;
    return HnswIndex.deserialize(serial);
  } catch {
    return undefined;
  }
}

/** Build a new HNSW index from a list of embedding rows and write it to disk. */
export async function buildAndWriteHnswIndex(
  repoRoot: string,
  modelName: string,
  embeddings: EmbeddingRow[],
  hnswConfig?: Partial<HnswConfig>,
): Promise<HnswIndex> {
  const index = new HnswIndex(modelName, hnswConfig);
  index.buildFromEntries(
    embeddings.map((e) => ({ chunkId: e.chunkId, modelName: e.modelName, vector: e.vector })),
  );
  await writeHnswIndex(repoRoot, index);
  return index;
}

// ---------------------------------------------------------------------------
// Backward-compatible flat ANN cache helpers (kept for existing callers)
// ---------------------------------------------------------------------------

/** @deprecated Prefer buildAndWriteHnswIndex. Writes both flat cache and HNSW. */
export async function writeAnnIndex(repoRoot: string, modelName: string, embeddings: EmbeddingRow[]): Promise<string> {
  // Write flat cache (legacy) — project-local
  const cacheDir = projectCacheDir(repoRoot);
  await fs.mkdir(cacheDir, { recursive: true });
  const flatPath = path.join(cacheDir, `ann-${modelName}.json`);
  const payload: AnnIndex = {
    modelName,
    entries: embeddings.map((e) => ({ chunkId: e.chunkId, modelName: e.modelName, vector: e.vector })),
  };
  await fs.writeFile(flatPath, `${JSON.stringify(payload)}\n`, "utf8");

  // Also build HNSW
  await buildAndWriteHnswIndex(repoRoot, modelName, embeddings);

  return flatPath;
}

/** @deprecated Prefer readHnswIndex. Reads flat cache for backward compat. */
export async function readAnnIndex(repoRoot: string, modelName: string): Promise<AnnIndex | undefined> {
  const filePath = path.join(projectCacheDir(repoRoot), `ann-${modelName}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as AnnIndex;
  } catch {
    return undefined;
  }
}
