import type { HookName } from "../types/hook-decision.js";

export type BridgeError = {
  code: string;
  message: string;
  hookName?: HookName;
};

export type BridgeResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: BridgeError;
    };
