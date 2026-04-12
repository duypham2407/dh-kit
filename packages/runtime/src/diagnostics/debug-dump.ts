import fs from "node:fs/promises";
import type { HookDecisionRecord } from "../../../opencode-sdk/src/index.js";
import type { AuditInspectionProfiles } from "./audit-query-service.js";
import { resolveSqliteDbPath } from "../../../storage/src/sqlite/db.js";
import { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { resolveDhPaths } from "../../../shared/src/utils/path.js";
import { AuditQueryService } from "./audit-query-service.js";

export type DebugDump = {
  repoRoot: string;
  sqlitePath: string;
  semanticMode: string;
  latestSessionHookLogs: HookDecisionRecord[];
  auditInspection: AuditInspectionProfiles;
  diagnostics: {
    chunkCount: number;
    embeddingCount: number;
    latestSessionId: string;
    paths: {
      configHome: string;
      dataHome: string;
      cacheHome: string;
    };
  };
};

export async function createDebugDump(repoRoot: string): Promise<DebugDump> {
  const configRepo = new ConfigRepo(repoRoot);
  const semanticMode = configRepo.read<string>("semantic.mode") ?? "always";
  const latestSessionId = configRepo.read<string>("debug.latest_session_id") ?? "bootstrap";
  const hookLogsRepo = new HookInvocationLogsRepo(repoRoot);
  const latestSessionHookLogs = hookLogsRepo.listBySession(latestSessionId);
  const auditQueryService = new AuditQueryService(repoRoot);
  const auditInspection = auditQueryService.getInspectionProfiles({
    latestSessionId,
    limit: 25,
    recentWindowHours: 24,
  });
  const chunksRepo = new ChunksRepo(repoRoot);
  const embeddingsRepo = new EmbeddingsRepo(repoRoot);
  const paths = resolveDhPaths(repoRoot);
  const chunkCount = chunksRepo.count();
  const embeddingCount = embeddingsRepo.countByModel(configRepo.read<string>("embedding.provider.modelName") ?? "text-embedding-3-small");

  return {
    repoRoot,
    sqlitePath: resolveSqliteDbPath(repoRoot),
    semanticMode,
    latestSessionHookLogs,
    auditInspection,
    diagnostics: {
      chunkCount,
      embeddingCount,
      latestSessionId,
      paths: {
        configHome: paths.configHome,
        dataHome: paths.dataHome,
        cacheHome: paths.cacheHome,
      },
    },
  };
}

export async function writeDebugDump(repoRoot: string, outputPath: string): Promise<string> {
  const dump = await createDebugDump(repoRoot);
  await fs.writeFile(outputPath, `${JSON.stringify(dump, null, 2)}\n`, "utf8");
  return outputPath;
}
