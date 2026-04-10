import { normalizePayloadKeys } from "../protocol/key-normalization.js";

export function normalizeToSnakeCase(payload: Record<string, unknown>): Record<string, unknown> {
  return normalizePayloadKeys(payload, "snake_case");
}

export function normalizeToCamelCase(payload: Record<string, unknown>): Record<string, unknown> {
  return normalizePayloadKeys(payload, "camelCase");
}
