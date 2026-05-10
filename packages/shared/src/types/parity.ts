export const PARITY_CATEGORIES = [
  "runtime",
  "cli",
  "session",
  "provider",
  "mcp",
  "tool",
  "agent",
  "lsp",
  "plugin",
  "server",
  "tui",
  "github",
  "packaging",
] as const;

export type ParityCategory = typeof PARITY_CATEGORIES[number];

export const PARITY_STATUSES = [
  "supported",
  "partial",
  "planned",
  "deferred",
  "out_of_scope",
] as const;

export type ParityStatus = typeof PARITY_STATUSES[number];

export type ParityPriority = "P0" | "P1" | "P2" | "P3";

export type ParityFeature = {
  category: ParityCategory;
  surface: string;
  opencodeSurface: string[];
  dhSurface: string[];
  status: ParityStatus;
  priority: ParityPriority;
  missingCommandSurfaces: string[];
  missingRuntimeCapabilities: string[];
  nextMilestone: string;
  notes: string[];
};

export type ParitySummary = {
  total: number;
  byStatus: Record<ParityStatus, number>;
  byCategory: Record<ParityCategory, ParityStatus>;
  missingCommandSurfaces: string[];
  missingRuntimeCapabilities: string[];
  recommendedNextMilestone: string;
};

export type ParityReport = {
  source: "opencode-gap-roadmap";
  baseline: {
    dh: string;
    opencode: string;
  };
  categories: readonly ParityCategory[];
  statuses: readonly ParityStatus[];
  features: ParityFeature[];
  summary: ParitySummary;
};
