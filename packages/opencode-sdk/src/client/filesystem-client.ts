import type { BridgeResult } from "../protocol/error-envelope.js";

export type FilesystemMirrorPayload = {
  sessionPath: string;
  envelopePath?: string;
  payload: Record<string, unknown>;
};

export function buildFilesystemMirrorPayload(input: FilesystemMirrorPayload): BridgeResult<FilesystemMirrorPayload> {
  if (!input.sessionPath) {
    return {
      ok: false,
      error: {
        code: "bridge.filesystem.invalid_path",
        message: "sessionPath is required for filesystem mirror payload",
      },
    };
  }

  return { ok: true, value: input };
}
