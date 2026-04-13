function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function normalizeValue(value: unknown, target: "camelCase" | "snake_case"): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry, target));
  }

  if (value && typeof value === "object") {
    const inputRecord = value as Record<string, unknown>;
    const outputRecord: Record<string, unknown> = {};

    for (const [key, keyValue] of Object.entries(inputRecord)) {
      const normalizedKey = target === "snake_case" ? toSnakeCase(key) : toCamelCase(key);
      outputRecord[normalizedKey] = normalizeValue(keyValue, target);
    }

    return outputRecord;
  }

  return value;
}

export function normalizePayloadKeys<T extends Record<string, unknown>>(
  payload: T,
  target: "camelCase" | "snake_case",
): Record<string, unknown> {
  return normalizeValue(payload, target) as Record<string, unknown>;
}
