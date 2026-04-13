import { createHash } from "node:crypto";
import type { ExtensionSpec } from "../../../opencode-sdk/src/index.js";

export type ExtensionFingerprintPayload = {
  id: string;
  contractVersion: ExtensionSpec["contractVersion"];
  entry: string;
  capabilities: string[];
  priority: number;
  lanes: string[];
  roles: string[];
};

export function toExtensionFingerprintPayload(spec: ExtensionSpec): ExtensionFingerprintPayload {
  return {
    id: spec.id,
    contractVersion: spec.contractVersion,
    entry: spec.entry,
    capabilities: normalizeStringArray(spec.capabilities),
    priority: spec.priority,
    lanes: normalizeStringArray(spec.lanes),
    roles: normalizeStringArray(spec.roles),
  };
}

export function deriveExtensionFingerprint(spec: ExtensionSpec): string {
  const payload = toExtensionFingerprintPayload(spec);
  const canonical = JSON.stringify(payload);
  return createHash("sha256").update(canonical).digest("hex");
}

function normalizeStringArray(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
