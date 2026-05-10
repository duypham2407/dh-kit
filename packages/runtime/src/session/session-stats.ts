import type { SessionRuntimeEventRecord } from "../../../shared/src/types/session-runtime.js";
import type { SessionState, SessionStatsBucket, SessionStatsReport } from "../../../shared/src/types/session.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function buildSessionStats(
  repoRoot: string,
  input: { days?: number; models?: number; tools?: number } = {},
): SessionStatsReport {
  const sessions = filterByDays(new SessionsRepo(repoRoot).list({ limit: 10_000 }), input.days);
  const eventsRepo = new SessionRuntimeEventsRepo(repoRoot);
  const events = sessions.flatMap((session) => eventsRepo.listBySession(session.sessionId));

  return {
    generatedAt: new Date().toISOString(),
    days: input.days,
    totalSessions: sessions.length,
    sessionsByLane: buckets(sessions.map((session) => session.lane)),
    sessionsByStatus: buckets(sessions.map((session) => session.status)),
    runtimeEventsByType: buckets(events.map((event) => event.eventType)),
    topModels: buckets(events.flatMap(readModel)).slice(0, input.models ?? 5),
    topTools: buckets(events.flatMap(readTool)).slice(0, input.tools ?? 5),
    tokenUsage: "unavailable",
    costUsd: "unavailable",
  };
}

function filterByDays(sessions: SessionState[], days: number | undefined): SessionState[] {
  if (!days) return sessions;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return sessions.filter((session) => Date.parse(session.updatedAt) >= cutoff);
}

function buckets(values: string[]): SessionStatsBucket[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function readModel(event: SessionRuntimeEventRecord): string[] {
  if (event.eventType !== "message.started") return [];
  const payload = readPayload(event);
  return typeof payload.model === "string" ? [payload.model] : [];
}

function readTool(event: SessionRuntimeEventRecord): string[] {
  if (event.eventType !== "tool.started") return [];
  const payload = readPayload(event);
  const tool = payload.toolName ?? payload.name;
  return typeof tool === "string" ? [tool] : [];
}

function readPayload(event: SessionRuntimeEventRecord): Record<string, unknown> {
  const payload = event.eventJson.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : event.eventJson;
}
