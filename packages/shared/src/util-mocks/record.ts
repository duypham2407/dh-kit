export const isRecord = (v: any): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
