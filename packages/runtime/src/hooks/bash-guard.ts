export type BashGuardLevel = "strict" | "advisory";
export type ShellPermissionLevel = "deny" | "ask" | "allow" | "auto_approve_with_policy";

export type BashGuardDecision = {
  allowed: boolean;
  blocked: boolean;
  reason: string;
  suggestion?: string;
  category?: string;
};

export type ShellPermissionDecision = BashGuardDecision & {
  permissionLevel: ShellPermissionLevel;
  requiresPermission: boolean;
};

export type BashSubstitutionRule = {
  pattern: RegExp;
  category: string;
  suggestion: string;
};

export const SUBSTITUTION_RULES: BashSubstitutionRule[] = [
  { pattern: /\bgrep\b/, category: "content-search", suggestion: "Use dh.find-references, dh.find-symbol, or Grep tool." },
  { pattern: /\bcat\b\s+.+\.(ts|tsx|js|jsx|go|py|rs)\b/i, category: "file-read", suggestion: "Use view tool or dh.syntax-outline first." },
  { pattern: /\bfind\b\s+.*-name\b/, category: "file-discovery", suggestion: "Use glob tool or dh.find-symbol." },
  { pattern: /\b(sed|awk)\b/, category: "file-edit", suggestion: "Use edit/patch tools instead of stream editing." },
  { pattern: /\b(head|tail)\b/, category: "partial-read", suggestion: "Use view tool with offset/limit." },
  { pattern: /\bwc\b/, category: "count", suggestion: "Use diagnostics/read-based counting in tooling." },
];

export const ALLOWED_PREFIXES = [
  "git", "npm", "pnpm", "yarn", "bun", "node", "npx", "docker", "make", "cargo", "go", "python", "pip",
  "pytest", "vitest", "tsc", "eslint",
];

export function evaluateBashCommand(command: string, level: BashGuardLevel): BashGuardDecision {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { allowed: true, blocked: false, reason: "empty command" };
  }

  const base = parseBaseCommand(trimmed);
  if (ALLOWED_PREFIXES.some((prefix) => base === prefix || base.startsWith(`${prefix} `))) {
    return {
      allowed: true,
      blocked: false,
      reason: `Allowed command prefix '${base.split(" ")[0]}'.`,
    };
  }

  const match = SUBSTITUTION_RULES.find((rule) => rule.pattern.test(trimmed));
  if (!match) {
    return { allowed: true, blocked: false, reason: "No blocked pattern matched." };
  }

  if (level === "advisory") {
    return {
      allowed: true,
      blocked: false,
      reason: `Advisory: command matched ${match.category}.`,
      suggestion: match.suggestion,
      category: match.category,
    };
  }

  return {
    allowed: false,
    blocked: true,
    reason: `Blocked by bash guard (${match.category}).`,
    suggestion: match.suggestion,
    category: match.category,
  };
}

export function evaluateShellPermission(command: string, permissionLevel: ShellPermissionLevel): ShellPermissionDecision {
  if (permissionLevel === "deny") {
    return {
      allowed: false,
      blocked: true,
      requiresPermission: false,
      permissionLevel,
      reason: "Shell command denied by permission policy.",
    };
  }

  if (permissionLevel === "ask") {
    return {
      allowed: false,
      blocked: false,
      requiresPermission: true,
      permissionLevel,
      reason: "Shell command requires permission before execution.",
    };
  }

  const guard = evaluateBashCommand(
    command,
    permissionLevel === "auto_approve_with_policy" ? "strict" : "advisory",
  );
  return {
    ...guard,
    permissionLevel,
    requiresPermission: false,
  };
}

function parseBaseCommand(command: string): string {
  const splitters = ["&&", ";", "||", "|"];
  let first = command;
  for (const splitter of splitters) {
    const idx = first.indexOf(splitter);
    if (idx >= 0) {
      first = first.slice(0, idx);
    }
  }
  const parts = first.trim().split(/\s+/);
  return parts[0] ?? "";
}
