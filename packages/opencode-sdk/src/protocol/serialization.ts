export function serializeBridgePayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

export function deserializeBridgePayload(payload: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Bridge payload must decode to an object record");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Malformed bridge payload JSON: ${message}`);
  }
}
