import { describe, it, expect, afterEach } from "vitest";
import { ChunksRepo } from "./chunks-repo.js";
import { EmbeddingsRepo } from "./embeddings-repo.js";
import { HookInvocationLogsRepo } from "./hook-invocation-logs-repo.js";
import { ToolUsageAuditRepo } from "./tool-usage-audit-repo.js";
import { SkillActivationAuditRepo } from "./skill-activation-audit-repo.js";
import { McpRouteAuditRepo } from "./mcp-route-audit-repo.js";
import { closeDhDatabase, openDhDatabase } from "../db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-repo-test-"));
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

describe("ChunksRepo", () => {
  it("save and findById", () => {
    const repo = new ChunksRepo(makeTmpRepo());
    const row = repo.save({
      fileId: "f1",
      filePath: "src/a.ts",
      symbolId: "sym-1",
      lineStart: 1,
      lineEnd: 20,
      content: "const x = 1;",
      contentHash: "abc123",
      tokenEstimate: 4,
      language: "typescript",
    });

    expect(row.id).toMatch(/^chunk-/);
    expect(row.fileId).toBe("f1");
    expect(row.symbolId).toBe("sym-1");

    const found = repo.findById(row.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(row.id);
    expect(found!.content).toBe("const x = 1;");
  });

  it("findByFileId returns all chunks for a file", () => {
    const repoRoot = makeTmpRepo();
    const repo = new ChunksRepo(repoRoot);
    repo.save({ fileId: "f1", filePath: "a.ts", symbolId: undefined, lineStart: 1, lineEnd: 10, content: "chunk1", contentHash: "h1", tokenEstimate: 2, language: "ts" });
    repo.save({ fileId: "f1", filePath: "a.ts", symbolId: undefined, lineStart: 11, lineEnd: 20, content: "chunk2", contentHash: "h2", tokenEstimate: 2, language: "ts" });
    repo.save({ fileId: "f2", filePath: "b.ts", symbolId: undefined, lineStart: 1, lineEnd: 5, content: "chunk3", contentHash: "h3", tokenEstimate: 2, language: "ts" });

    const f1Chunks = repo.findByFileId("f1");
    expect(f1Chunks).toHaveLength(2);

    const f2Chunks = repo.findByFileId("f2");
    expect(f2Chunks).toHaveLength(1);
  });

  it("findByContentHash returns match or undefined", () => {
    const repoRoot = makeTmpRepo();
    const repo = new ChunksRepo(repoRoot);
    repo.save({ fileId: "f1", filePath: "a.ts", symbolId: undefined, lineStart: 1, lineEnd: 10, content: "hello", contentHash: "unique-hash", tokenEstimate: 2, language: "ts" });

    expect(repo.findByContentHash("unique-hash")).toBeDefined();
    expect(repo.findByContentHash("missing")).toBeUndefined();
  });

  it("saveBatch stores multiple chunks", () => {
    const repoRoot = makeTmpRepo();
    const repo = new ChunksRepo(repoRoot);
    const rows = repo.saveBatch([
      { fileId: "f1", filePath: "a.ts", symbolId: undefined, lineStart: 1, lineEnd: 5, content: "a", contentHash: "ha", tokenEstimate: 1, language: "ts" },
      { fileId: "f1", filePath: "a.ts", symbolId: undefined, lineStart: 6, lineEnd: 10, content: "b", contentHash: "hb", tokenEstimate: 1, language: "ts" },
    ]);
    expect(rows).toHaveLength(2);
    expect(repo.listAll()).toHaveLength(2);
  });

  it("deleteByFileId removes only that file's chunks", () => {
    const repoRoot = makeTmpRepo();
    const repo = new ChunksRepo(repoRoot);
    repo.save({ fileId: "f1", filePath: "a.ts", symbolId: undefined, lineStart: 1, lineEnd: 10, content: "a", contentHash: "ha", tokenEstimate: 1, language: "ts" });
    repo.save({ fileId: "f2", filePath: "b.ts", symbolId: undefined, lineStart: 1, lineEnd: 10, content: "b", contentHash: "hb", tokenEstimate: 1, language: "ts" });

    repo.deleteByFileId("f1");
    expect(repo.listAll()).toHaveLength(1);
    expect(repo.listAll()[0]!.fileId).toBe("f2");
  });

  it("listPathInventory returns lightweight path rows", () => {
    const repoRoot = makeTmpRepo();
    const repo = new ChunksRepo(repoRoot);
    const saved = repo.save({
      fileId: "f1",
      filePath: "src/a.ts",
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 10,
      content: "a",
      contentHash: "h-a",
      tokenEstimate: 1,
      language: "ts",
    });

    const inventory = repo.listPathInventory();
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      id: saved.id,
      fileId: "f1",
      filePath: "src/a.ts",
    });
  });

  it("updateFilePathsByChunkId updates only provided rows", () => {
    const repoRoot = makeTmpRepo();
    const repo = new ChunksRepo(repoRoot);
    const c1 = repo.save({ fileId: "f1", filePath: "./src/a.ts", symbolId: undefined, lineStart: 1, lineEnd: 10, content: "a", contentHash: "ha-1", tokenEstimate: 1, language: "ts" });
    const c2 = repo.save({ fileId: "f2", filePath: "src/b.ts", symbolId: undefined, lineStart: 1, lineEnd: 10, content: "b", contentHash: "ha-2", tokenEstimate: 1, language: "ts" });

    const updated = repo.updateFilePathsByChunkId([{ chunkId: c1.id, filePath: "src/a.ts" }]);
    expect(updated).toBe(1);
    expect(repo.findById(c1.id)!.filePath).toBe("src/a.ts");
    expect(repo.findById(c2.id)!.filePath).toBe("src/b.ts");
  });
});

describe("EmbeddingsRepo", () => {
  function saveChunk(repoRoot: string, chunkId: string) {
    const chunksRepo = new ChunksRepo(repoRoot);
    return chunksRepo.save({
      fileId: "f1",
      filePath: "a.ts",
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 10,
      content: `content-${chunkId}`,
      contentHash: `hash-${chunkId}`,
      tokenEstimate: 5,
      language: "ts",
    });
  }

  it("save and findByChunkId", () => {
    const repoRoot = makeTmpRepo();
    const chunk = saveChunk(repoRoot, "c1");
    const repo = new EmbeddingsRepo(repoRoot);
    const row = repo.save({
      chunkId: chunk.id,
      modelName: "text-embedding-3-small",
      vector: [0.1, 0.2, 0.3],
      vectorDim: 3,
    });

    expect(row.id).toMatch(/^emb-/);
    expect(row.vectorDim).toBe(3);

    const found = repo.findByChunkId(chunk.id);
    expect(found).toBeDefined();
    expect(found!.vector).toEqual([0.1, 0.2, 0.3]);
  });

  it("findByChunkIds returns multiple", () => {
    const repoRoot = makeTmpRepo();
    const c1 = saveChunk(repoRoot, "c1");
    const c2 = saveChunk(repoRoot, "c2");
    const c3 = saveChunk(repoRoot, "c3");
    const repo = new EmbeddingsRepo(repoRoot);
    repo.save({ chunkId: c1.id, modelName: "m", vector: [1], vectorDim: 1 });
    repo.save({ chunkId: c2.id, modelName: "m", vector: [2], vectorDim: 1 });
    repo.save({ chunkId: c3.id, modelName: "m", vector: [3], vectorDim: 1 });

    const found = repo.findByChunkIds([c1.id, c3.id]);
    expect(found).toHaveLength(2);
  });

  it("listByModel filters by model", () => {
    const repoRoot = makeTmpRepo();
    const c1 = saveChunk(repoRoot, "c1");
    const c2 = saveChunk(repoRoot, "c2");
    const repo = new EmbeddingsRepo(repoRoot);
    repo.save({ chunkId: c1.id, modelName: "model-a", vector: [1], vectorDim: 1 });
    repo.save({ chunkId: c2.id, modelName: "model-b", vector: [2], vectorDim: 1 });

    expect(repo.listByModel("model-a")).toHaveLength(1);
    expect(repo.listByModel("model-b")).toHaveLength(1);
    expect(repo.listByModel("model-c")).toHaveLength(0);
  });

  it("countByModel returns correct count", () => {
    const repoRoot = makeTmpRepo();
    const c1 = saveChunk(repoRoot, "c1");
    const c2 = saveChunk(repoRoot, "c2");
    const repo = new EmbeddingsRepo(repoRoot);
    repo.save({ chunkId: c1.id, modelName: "m", vector: [1], vectorDim: 1 });
    repo.save({ chunkId: c2.id, modelName: "m", vector: [2], vectorDim: 1 });

    expect(repo.countByModel("m")).toBe(2);
    expect(repo.countByModel("other")).toBe(0);
  });

  it("deleteByChunkId removes embedding", () => {
    const repoRoot = makeTmpRepo();
    const c1 = saveChunk(repoRoot, "c1");
    const c2 = saveChunk(repoRoot, "c2");
    const repo = new EmbeddingsRepo(repoRoot);
    repo.save({ chunkId: c1.id, modelName: "m", vector: [1], vectorDim: 1 });
    repo.save({ chunkId: c2.id, modelName: "m", vector: [2], vectorDim: 1 });

    repo.deleteByChunkId(c1.id);
    expect(repo.countByModel("m")).toBe(1);
    expect(repo.findByChunkId(c1.id)).toBeUndefined();
  });

  it("saveBatch stores multiple embeddings", () => {
    const repoRoot = makeTmpRepo();
    const c1 = saveChunk(repoRoot, "c1");
    const c2 = saveChunk(repoRoot, "c2");
    const repo = new EmbeddingsRepo(repoRoot);
    const rows = repo.saveBatch([
      { chunkId: c1.id, modelName: "m", vector: [1, 2], vectorDim: 2 },
      { chunkId: c2.id, modelName: "m", vector: [3, 4], vectorDim: 2 },
    ]);
    expect(rows).toHaveLength(2);
    expect(repo.countByModel("m")).toBe(2);
  });

  it("countOrphaned tracks orphan rows before and after cleanup", () => {
    const repoRoot = makeTmpRepo();
    const c1 = saveChunk(repoRoot, "c1");
    const c2 = saveChunk(repoRoot, "c2");
    const database = openDhDatabase(repoRoot);
    const repo = new EmbeddingsRepo(repoRoot);
    repo.save({ chunkId: c1.id, modelName: "m", vector: [1], vectorDim: 1 });
    repo.save({ chunkId: c2.id, modelName: "m", vector: [2], vectorDim: 1 });

    database.exec("PRAGMA foreign_keys = OFF");
    database.prepare("DELETE FROM chunks WHERE id = ?").run(c1.id);
    database.prepare("DELETE FROM chunks WHERE id = ?").run(c2.id);
    database.exec("PRAGMA foreign_keys = ON");

    expect(repo.countOrphaned()).toBe(2);
    expect(repo.deleteOrphaned()).toBe(2);
    expect(repo.countOrphaned()).toBe(0);
  });
});

describe("HookInvocationLogsRepo", () => {
  it("save and findLatestDecision", () => {
    const repoRoot = makeTmpRepo();
    const repo = new HookInvocationLogsRepo(repoRoot);

    const log = {
      id: "hook-1",
      sessionId: "sess-1",
      envelopeId: "env-1",
      hookName: "pre_tool_exec" as const,
      input: { toolName: "grep" },
      output: { allow: false },
      decision: "block" as const,
      reason: "grep is blocked",
      durationMs: 2,
      timestamp: new Date().toISOString(),
    };

    repo.save(log);

    const found = repo.findLatestDecision("sess-1", "env-1", "pre_tool_exec");
    expect(found).toBeDefined();
    expect(found!.decision).toBe("block");
    expect(found!.reason).toBe("grep is blocked");
  });

  it("findLatestDecision returns undefined when no entry exists", () => {
    const repoRoot = makeTmpRepo();
    const repo = new HookInvocationLogsRepo(repoRoot);

    const result = repo.findLatestDecision("no-such-session", "no-such-env", "pre_tool_exec");
    expect(result).toBeUndefined();
  });

  it("listBySession returns logs newest-first", () => {
    const repoRoot = makeTmpRepo();
    const repo = new HookInvocationLogsRepo(repoRoot);

    for (let i = 0; i < 3; i++) {
      repo.save({
        id: `hook-${i}`,
        sessionId: "sess-1",
        envelopeId: "env-1",
        hookName: "pre_answer" as const,
        input: {},
        output: {},
        decision: "allow" as const,
        reason: `reason-${i}`,
        durationMs: i,
        timestamp: new Date(2000 + i, 0, 1).toISOString(),
      });
    }

    const logs = repo.listBySession("sess-1");
    expect(logs).toHaveLength(3);
    // Newest first
    expect(logs[0]!.timestamp > logs[1]!.timestamp).toBe(true);
  });
});

describe("Audit repos query filters", () => {
  it("ToolUsageAuditRepo filters by session, role, envelope, and time-range", () => {
    const repoRoot = makeTmpRepo();
    const repo = new ToolUsageAuditRepo(repoRoot);

    repo.save({
      id: "tool-1",
      sessionId: "sess-1",
      envelopeId: "env-1",
      role: "implementer",
      intent: "read",
      toolName: "Read",
      status: "succeeded",
      timestamp: "2026-04-12T10:00:00.000Z",
    });
    repo.save({
      id: "tool-2",
      sessionId: "sess-1",
      envelopeId: "env-2",
      role: "reviewer",
      intent: "scan",
      toolName: "Grep",
      status: "failed",
      timestamp: "2026-04-12T11:00:00.000Z",
    });
    repo.save({
      id: "tool-3",
      sessionId: "sess-2",
      envelopeId: "env-3",
      role: "implementer",
      intent: "query",
      toolName: "SQL",
      status: "called",
      timestamp: "2026-04-12T12:00:00.000Z",
    });

    const sess1 = repo.list({ sessionId: "sess-1" });
    expect(sess1).toHaveLength(2);

    const reviewerOnly = repo.list({ role: "reviewer" });
    expect(reviewerOnly).toHaveLength(1);
    expect(reviewerOnly[0]!.id).toBe("tool-2");

    const env2 = repo.list({ envelopeId: "env-2" });
    expect(env2).toHaveLength(1);
    expect(env2[0]!.id).toBe("tool-2");

    const timeRange = repo.list({ fromTimestamp: "2026-04-12T10:30:00.000Z", toTimestamp: "2026-04-12T11:30:00.000Z" });
    expect(timeRange).toHaveLength(1);
    expect(timeRange[0]!.id).toBe("tool-2");
  });

  it("SkillActivationAuditRepo applies newest-first with bounded limit", () => {
    const repoRoot = makeTmpRepo();
    const repo = new SkillActivationAuditRepo(repoRoot);

    repo.save({
      id: "skill-1",
      sessionId: "sess-1",
      envelopeId: "env-1",
      role: "implementer",
      skillName: "s1",
      activationReason: "r1",
      timestamp: "2026-04-12T10:00:00.000Z",
    });
    repo.save({
      id: "skill-2",
      sessionId: "sess-1",
      envelopeId: "env-2",
      role: "implementer",
      skillName: "s2",
      activationReason: "r2",
      timestamp: "2026-04-12T11:00:00.000Z",
    });

    const limited = repo.list({ sessionId: "sess-1", limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]!.id).toBe("skill-2");
  });

  it("McpRouteAuditRepo applies max limit clamp and empty-result behavior", () => {
    const repoRoot = makeTmpRepo();
    const repo = new McpRouteAuditRepo(repoRoot);

    for (let i = 0; i < 3; i++) {
      repo.save({
        id: `mcp-${i}`,
        sessionId: "sess-1",
        envelopeId: `env-${i}`,
        role: "analyst",
        mcpName: "context7",
        routeReason: "reason",
        timestamp: `2026-04-12T1${i}:00:00.000Z`,
      });
    }

    const none = repo.list({ sessionId: "missing" });
    expect(none).toEqual([]);

    const clamped = repo.list({ sessionId: "sess-1", limit: 9999 });
    expect(clamped).toHaveLength(3);
  });
});
