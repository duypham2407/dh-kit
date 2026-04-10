import type { HookDecisionInput } from "./decision-writer.js";
import type { BridgeResult } from "../protocol/error-envelope.js";

export interface BridgeIpcClient {
  sendDecision(input: HookDecisionInput): Promise<BridgeResult<{ id: string }>>;
}

export class NotImplementedIpcClient implements BridgeIpcClient {
  async sendDecision(_input: HookDecisionInput): Promise<BridgeResult<{ id: string }>> {
    return {
      ok: false,
      error: {
        code: "bridge.ipc.not_implemented",
        message: "IPC transport is not implemented in bridge protocol v1",
      },
    };
  }
}
