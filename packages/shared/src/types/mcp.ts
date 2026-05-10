export type McpLifecycleStatus = "available" | "needs_auth" | "degraded" | "unavailable";

export type McpServerSource = "default" | "local";

export type McpServerRecord = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastFailure?: string;
  capabilities?: {
    tools?: string[];
    resources?: string[];
    prompts?: string[];
  };
};

export type McpAuthRecord = {
  name: string;
  status: McpLifecycleStatus;
  serverIdentity?: string;
  observedAt?: string;
  lastFailure?: string;
};

export type McpServerPublicRecord = {
  name: string;
  source: McpServerSource;
  command?: string;
  args: string[];
  env: Record<string, "[REDACTED_SECRET]">;
  enabled: boolean;
  authStatus: McpLifecycleStatus;
  description?: string;
  requiresAuth?: boolean;
  capabilities: string[];
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  lastFailure?: string;
};

export type McpAuthPublicRecord = {
  name: string;
  status: McpLifecycleStatus;
  serverIdentity?: string;
  observedAt?: string;
  lastFailure?: string;
};

export type McpAddServerInput = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
};

export type McpLogoutReport = {
  name: string;
  removed: boolean;
};

export type McpListReport = {
  servers: McpServerPublicRecord[];
};

export type McpAuthListReport = {
  auth: McpAuthPublicRecord[];
};
