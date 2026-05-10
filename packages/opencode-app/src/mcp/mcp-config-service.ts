import fs from "node:fs";
import path from "node:path";
import type {
  McpAddServerInput,
  McpAuthListReport,
  McpAuthPublicRecord,
  McpAuthRecord,
  McpLifecycleStatus,
  McpListReport,
  McpLogoutReport,
  McpServerPublicRecord,
  McpServerRecord,
} from "../../../shared/src/types/mcp.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { DEFAULT_MCP_REGISTRY, type McpRegistryEntry } from "../registry/mcp-registry.js";

type McpConfigFile = {
  version: 1;
  servers: Record<string, McpServerRecord>;
  auth: Record<string, McpAuthRecord>;
};

export class McpConfigService {
  constructor(private readonly repoRoot: string) {}

  getPath(): string {
    return path.join(this.repoRoot, ".dh", "mcp", "servers.json");
  }

  addServer(input: McpAddServerInput): McpServerPublicRecord {
    const file = this.readFile();
    const previous = file.servers[input.name];
    const timestamp = nowIso();
    const record: McpServerRecord = {
      name: input.name,
      command: input.command,
      args: input.args ?? [],
      env: input.env ?? {},
      enabled: input.enabled ?? true,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
      lastFailure: previous?.lastFailure,
      capabilities: previous?.capabilities,
    };

    file.servers[input.name] = record;
    if (!file.auth[input.name]) {
      file.auth[input.name] = {
        name: input.name,
        status: "available",
        observedAt: timestamp,
      };
    }
    this.writeFile(file);
    return toPublicLocalServer(record, file.auth[input.name]);
  }

  listServers(): McpServerPublicRecord[] {
    const file = this.readFile();
    const defaults = DEFAULT_MCP_REGISTRY.map((entry) => toPublicDefaultServer(entry, file.auth[entry.id]));
    const locals = Object.values(file.servers).map((server) => toPublicLocalServer(server, file.auth[server.name]));
    const byName = new Map<string, McpServerPublicRecord>();
    for (const server of defaults) byName.set(server.name, server);
    for (const server of locals) byName.set(server.name, server);
    return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  listReport(): McpListReport {
    return { servers: this.listServers() };
  }

  listAuth(): McpAuthPublicRecord[] {
    return Object.values(this.readFile().auth).map(toPublicAuth).sort((left, right) => left.name.localeCompare(right.name));
  }

  authReport(): McpAuthListReport {
    return { auth: this.listAuth() };
  }

  setAuthState(input: McpAuthRecord): McpAuthPublicRecord {
    const file = this.readFile();
    file.auth[input.name] = input;
    this.writeFile(file);
    return toPublicAuth(input);
  }

  logout(name: string): McpLogoutReport {
    const file = this.readFile();
    if (!file.auth[name]) return { name, removed: false };
    delete file.auth[name];
    this.writeFile(file);
    return { name, removed: true };
  }

  getPublicServer(name: string): McpServerPublicRecord | undefined {
    return this.listServers().find((server) => server.name === name);
  }

  private readFile(): McpConfigFile {
    const filepath = this.getPath();
    if (!fs.existsSync(filepath)) return { version: 1, servers: {}, auth: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(filepath, "utf8")) as Partial<McpConfigFile>;
      return {
        version: 1,
        servers: parsed.servers ?? {},
        auth: parsed.auth ?? {},
      };
    } catch (error) {
      throw new Error(`Failed to parse .dh/mcp/servers.json: ${(error as Error).message}`);
    }
  }

  private writeFile(file: McpConfigFile): void {
    const filepath = this.getPath();
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(filepath, 0o600);
    } catch {
      // Some platforms ignore chmod; file remains in local ignored state.
    }
  }
}

function toPublicLocalServer(record: McpServerRecord, auth?: McpAuthRecord): McpServerPublicRecord {
  return {
    name: record.name,
    source: "local",
    command: record.command,
    args: [...record.args],
    env: redactEnv(record.env),
    enabled: record.enabled,
    authStatus: auth?.status ?? "available",
    capabilities: [],
    toolCount: record.capabilities?.tools?.length ?? 0,
    resourceCount: record.capabilities?.resources?.length ?? 0,
    promptCount: record.capabilities?.prompts?.length ?? 0,
    lastFailure: redactSecretString(record.lastFailure),
  };
}

function toPublicDefaultServer(entry: McpRegistryEntry, auth?: McpAuthRecord): McpServerPublicRecord {
  return {
    name: entry.id,
    source: "default",
    args: [],
    env: {},
    enabled: true,
    authStatus: auth?.status ?? defaultAuthStatus(entry),
    description: entry.description,
    requiresAuth: entry.requiresAuth,
    capabilities: [...entry.capabilities],
    toolCount: 0,
    resourceCount: 0,
    promptCount: 0,
    lastFailure: redactSecretString(auth?.lastFailure),
  };
}

function toPublicAuth(record: McpAuthRecord): McpAuthPublicRecord {
  return {
    name: record.name,
    status: record.status,
    serverIdentity: record.serverIdentity,
    observedAt: record.observedAt,
    lastFailure: redactSecretString(record.lastFailure),
  };
}

function defaultAuthStatus(entry: McpRegistryEntry): McpLifecycleStatus {
  return entry.requiresAuth ? "needs_auth" : "available";
}

function redactEnv(env: Record<string, string>): Record<string, "[REDACTED_SECRET]"> {
  return Object.fromEntries(Object.keys(env).sort().map((key) => [key, "[REDACTED_SECRET]"])) as Record<string, "[REDACTED_SECRET]">;
}

function redactSecretString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /bearer\s+[a-z0-9._:-]+|sk-[a-z0-9._:-]+|token[=:][a-z0-9._:-]+/i.test(value)
    ? "[REDACTED_SECRET]"
    : value;
}
