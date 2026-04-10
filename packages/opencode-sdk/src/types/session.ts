export type DhSessionStateBridge = {
  // TS-side context identity for bridge writes.
  // Go sqlite_reader.go uses function argument `sessionID` and does not read
  // `sessionId/session_id` from output_json for LatestSessionState.
  sessionId: string;
  lane: string;
  laneLocked: boolean;
  currentStage: string;
  semanticMode: string;
  toolEnforcementLevel: string;
  activeWorkItemIds: string[];
};

export type DhSessionStateBridgeSnakeCase = {
  session_id: string;
  lane: string;
  lane_locked: boolean;
  current_stage: string;
  semantic_mode: string;
  tool_enforcement_level: string;
  active_work_item_ids: string[];
};
