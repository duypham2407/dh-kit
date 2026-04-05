import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import { SessionManager } from "../../../runtime/src/session/session-manager.js";
import { createConfigService } from "./config-service.js";

export type ConfiguredModelVerificationResult = {
  ok: boolean;
  summary: string;
};

export async function verifyConfiguredModelForLane(input: {
  repoRoot: string;
  lane: WorkflowLane;
}): Promise<ConfiguredModelVerificationResult> {
  const configService = createConfigService(input.repoRoot);
  const agent = DEFAULT_AGENT_REGISTRY.find((entry) => entry.lanes.includes(input.lane));
  if (!agent) {
    return {
      ok: false,
      summary: `No agent is registered for lane '${input.lane}'.`,
    };
  }

  const assignment = await configService.getAssignment(agent.agentId);
  const sessionManager = new SessionManager(input.repoRoot);
  const bootstrap = await sessionManager.createSession(input.lane, agent);
  const resolved = bootstrap.envelope.resolvedModel;
  const assignmentSummary = assignment
    ? `${assignment.providerId}/${assignment.modelId}/${assignment.variantId}`
    : "fallback-default";
  const resolvedSummary = `${resolved.providerId}/${resolved.modelId}/${resolved.variantId}`;

  return {
    ok: !assignment || assignmentSummary === resolvedSummary,
    summary: [
      `lane: ${input.lane}`,
      `agent: ${agent.displayName}`,
      `assignment: ${assignmentSummary}`,
      `resolved: ${resolvedSummary}`,
      `session: ${bootstrap.session.sessionId}`,
      `verification: ${!assignment || assignmentSummary === resolvedSummary ? "pass" : "fail"}`,
    ].join("\n"),
  };
}
