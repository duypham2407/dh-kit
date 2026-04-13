import type { HookDecisionRecord } from "./hook-decision.js";
import type { TransportMode } from "./transport-mode.js";
import { BRIDGE_PROTOCOL_VERSION } from "../protocol/versioning.js";

export type OpenCodeBridgeMessage =
  | {
      type: "decision.write";
      transportMode: TransportMode;
      protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
      payload: HookDecisionRecord;
    }
  | {
      type: "decision.read.latest";
      transportMode: TransportMode;
      protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
      payload: {
        sessionId: string;
        envelopeId: string;
        hookName: HookDecisionRecord["hookName"];
      };
    }
  | {
      type: "session.mirror";
      transportMode: TransportMode;
      protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
      payload: Record<string, unknown>;
    }
  | {
      type: "cli.delegated";
      transportMode: TransportMode;
      protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
      payload: {
        command: string;
        args: string[];
      };
    }
  | {
      type: "ipc.stub";
      transportMode: "ipc";
      protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
      payload: {
        note: "not implemented in v1";
      };
    };
