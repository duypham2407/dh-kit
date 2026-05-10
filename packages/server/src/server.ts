import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AgentConfigService } from "../../opencode-app/src/agent/agent-config-service.js";
import { runDirectCommand } from "../../opencode-app/src/workflows/run-direct-command.js";
import type { AgentPublicEntry } from "../../shared/src/types/agent.js";
import type { RunDirectInput, RunDirectReport } from "../../shared/src/types/run.js";
import type { SessionState } from "../../shared/src/types/session.js";
import { deleteSession } from "../../runtime/src/session/session-delete.js";
import { forkSession } from "../../runtime/src/session/session-fork.js";
import { listSessions } from "../../runtime/src/session/session-query.js";

export type DhServerOptions = {
  repoRoot: string;
  host?: string;
  port?: number;
  password?: string;
  runDirect?: (input: RunDirectInput) => Promise<RunDirectReport>;
};

export type StartedDhServer = {
  server: Server;
  url: string;
};

export function createDhServer(options: DhServerOptions): Server {
  const host = options.host ?? "127.0.0.1";
  if (!isLocalHost(host) && !options.password) {
    throw new Error("dh serve requires --password when binding outside localhost.");
  }
  const runDirect = options.runDirect ?? runDirectCommand;

  return http.createServer(async (request, response) => {
    try {
      if (options.password && !isAuthorized(request, options.password)) {
        writeJson(response, 401, { error: "unauthorized" });
        return;
      }
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true, product: "dh" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/command/run") {
        const body = await readJsonBody(request);
        const message = typeof body["message"] === "string" ? body["message"] : "";
        const report = await runDirect({
          ...body,
          message,
          repoRoot: options.repoRoot,
        } as RunDirectInput);
        writeJson(response, 200, report);
        return;
      }
      if (request.method === "POST" && url.pathname === "/command/run/stream") {
        const body = await readJsonBody(request);
        const message = typeof body["message"] === "string" ? body["message"] : "";
        const report = await runDirect({
          ...body,
          message,
          repoRoot: options.repoRoot,
        } as RunDirectInput);
        writeNdjson(response, 200, report.events);
        return;
      }
      if (request.method === "GET" && url.pathname === "/sessions") {
        const report = listSessions(options.repoRoot, { limit: 50 });
        writeJson(response, 200, { sessions: report.sessions.map(toSessionSummary) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/agents") {
        const report = new AgentConfigService(options.repoRoot).listAgents();
        writeJson(response, 200, { agents: report.agents.map(toAgentOption) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/models") {
        const report = new AgentConfigService(options.repoRoot).listAgents();
        writeJson(response, 200, { models: toModelOptions(report.agents) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/session/fork") {
        const body = await readJsonBody(request);
        const sessionId = readRequiredString(body, "sessionId");
        const title = typeof body["title"] === "string" ? body["title"] : undefined;
        writeJson(response, 200, forkSession(options.repoRoot, sessionId, { title }));
        return;
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/session/")) {
        const sessionId = decodeURIComponent(url.pathname.slice("/session/".length));
        if (!sessionId) throw new Error("session id is required.");
        writeJson(response, 200, deleteSession(options.repoRoot, sessionId));
        return;
      }
      if (request.method === "POST" && url.pathname === "/permission/respond") {
        const body = await readJsonBody(request);
        const sessionId = readRequiredString(body, "sessionId");
        const tool = readRequiredString(body, "tool");
        const decision = readPermissionDecision(body);
        const reason = typeof body["reason"] === "string" ? body["reason"] : undefined;
        writeJson(response, 200, {
          sessionId,
          tool,
          decision,
          ...(reason ? { reason } : {}),
          recorded: true,
        });
        return;
      }
      writeJson(response, 404, { error: "not_found" });
    } catch (error) {
      writeJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export async function startDhServer(options: DhServerOptions): Promise<StartedDhServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const server = createDhServer({ ...options, host, port });
  await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return { server, url: `http://${host}:${actualPort}` };
}

function isLocalHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function isAuthorized(request: IncomingMessage, password: string): boolean {
  const header = request.headers.authorization;
  return header === `Bearer ${password}` || header === `Basic ${Buffer.from(`dh:${password}`).toString("base64")}`;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function writeNdjson(response: ServerResponse, statusCode: number, payloads: unknown[]): void {
  response.writeHead(statusCode, { "content-type": "application/x-ndjson" });
  for (const payload of payloads) response.write(`${JSON.stringify(payload)}\n`);
  response.end();
}

function toSessionSummary(session: SessionState): {
  id: string;
  title: string;
  status: SessionState["status"];
  stage: SessionState["currentStage"];
  updatedAt: string;
} {
  return {
    id: session.sessionId,
    title: `${session.lane} ${session.currentStage}`,
    status: session.status,
    stage: session.currentStage,
    updatedAt: session.updatedAt,
  };
}

function toAgentOption(agent: AgentPublicEntry): {
  id: string;
  displayName: string;
  role: AgentPublicEntry["role"];
  permission: AgentPublicEntry["permission"];
  defaultProvider?: string;
  defaultModel?: string;
} {
  return {
    id: agent.agentId,
    displayName: agent.displayName,
    role: agent.role,
    permission: agent.permission,
    defaultProvider: agent.defaultProvider,
    defaultModel: agent.defaultModel,
  };
}

function toModelOptions(agents: AgentPublicEntry[]): Array<{ id: string; name: string; providerId: string; modelId: string }> {
  const seen = new Set<string>();
  const models: Array<{ id: string; name: string; providerId: string; modelId: string }> = [];
  for (const agent of agents) {
    if (!agent.defaultProvider || !agent.defaultModel) continue;
    const id = `${agent.defaultProvider}/${agent.defaultModel}`;
    if (seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      name: agent.defaultModel,
      providerId: agent.defaultProvider,
      modelId: agent.defaultModel,
    });
  }
  return models;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} is required.`);
  return value;
}

function readPermissionDecision(body: Record<string, unknown>): "allow" | "deny" {
  const value = body["decision"];
  if (value === "allow" || value === "deny") return value;
  throw new Error("decision must be allow or deny.");
}
