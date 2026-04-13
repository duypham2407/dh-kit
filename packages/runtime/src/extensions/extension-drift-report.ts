import type { ExtensionRuntimeState } from "../../../opencode-sdk/src/index.js";
import { ExtensionRuntimeStateStoreFile, createEmptyStore } from "./extension-runtime-state-store.js";
import { nowIso } from "../../../shared/src/utils/time.js";

export type ExtensionRuntimeStateMap = Record<string, { state: ExtensionRuntimeState; fingerprint: string }>;

export type ExtensionStateDriftEntry = {
  extensionId: string;
  fingerprint: string;
  state?: ExtensionRuntimeState;
  lastSeenAt?: string;
  loadCount?: number;
};

export type ExtensionStateDriftSummary = {
  generatedAt: string;
  persistedExtensionCount: number;
  classifiedExtensionCount: number;
  firstCount: number;
  sameCount: number;
  updatedCount: number;
  driftedExtensionIds: string[];
};

export type ExtensionStateDriftReport = {
  summary: ExtensionStateDriftSummary;
  extensions: ExtensionStateDriftEntry[];
  warnings: string[];
};

export function buildExtensionStateDriftReport(input: {
  repoRoot: string;
  runtimeStates?: ExtensionRuntimeStateMap;
}): ExtensionStateDriftReport {
  const warnings: string[] = [];
  const storeFile = new ExtensionRuntimeStateStoreFile(input.repoRoot);
  const readResult = storeFile.read();
  const store = readResult.ok ? readResult.store : createEmptyStore();

  if (!readResult.ok) {
    warnings.push(`Extension runtime-state drift report degraded: ${readResult.reason}`);
  }

  const runtimeStates = input.runtimeStates ?? {};
  const runtimeStateIds = Object.keys(runtimeStates).sort((left, right) => left.localeCompare(right));
  const persistedIds = Object.keys(store.records).sort((left, right) => left.localeCompare(right));
  const allIds = Array.from(new Set([...persistedIds, ...runtimeStateIds])).sort((left, right) => left.localeCompare(right));

  const extensions = allIds.map<ExtensionStateDriftEntry>((extensionId) => {
    const persisted = store.records[extensionId];
    const runtimeState = runtimeStates[extensionId];
    return {
      extensionId,
      fingerprint: runtimeState?.fingerprint ?? persisted?.fingerprint ?? "",
      state: runtimeState?.state,
      lastSeenAt: persisted?.lastSeenAt,
      loadCount: persisted?.loadCount,
    };
  });

  const firstCount = runtimeStateIds.filter((id) => runtimeStates[id]?.state === "first").length;
  const sameCount = runtimeStateIds.filter((id) => runtimeStates[id]?.state === "same").length;
  const updatedCount = runtimeStateIds.filter((id) => runtimeStates[id]?.state === "updated").length;
  const driftedExtensionIds = runtimeStateIds.filter((id) => runtimeStates[id]?.state === "updated");

  return {
    summary: {
      generatedAt: nowIso(),
      persistedExtensionCount: persistedIds.length,
      classifiedExtensionCount: runtimeStateIds.length,
      firstCount,
      sameCount,
      updatedCount,
      driftedExtensionIds,
    },
    extensions,
    warnings,
  };
}
