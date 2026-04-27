//! Runtime Hook System — 6 policy enforcement hooks dispatched by the Rust host.
//!
//! Hooks run synchronously in the Rust process before or after the TS worker
//! processes a request. Every invocation is persisted to the hook_invocation_logs
//! table for auditability.

use dh_types::{
    AgentRole, HookDecision, HookInvocationLog, HookName, SemanticMode,
    SessionState, ToolEnforcementLevel, WorkflowLane,
};
use serde_json::{json, Value};
use std::time::Instant;

// ─── Hook Trait ──────────────────────────────────────────────────────────────

/// Context passed to every hook evaluation. Contains session state and the
/// request-specific input so hooks can make policy decisions.
#[derive(Debug, Clone)]
pub struct HookContext {
    pub session: SessionState,
    pub agent_id: String,
    pub role: AgentRole,
    pub stage: String,
    pub lane: WorkflowLane,
}

/// Result of a hook evaluation — the decision plus any payload mutation.
#[derive(Debug, Clone)]
pub struct HookResult {
    pub decision: HookDecision,
    pub reason: String,
    pub output: Value,
}

impl HookResult {
    fn allow(reason: impl Into<String>) -> Self {
        Self { decision: HookDecision::Allow, reason: reason.into(), output: json!(null) }
    }

    fn block(reason: impl Into<String>) -> Self {
        Self { decision: HookDecision::Block, reason: reason.into(), output: json!(null) }
    }

    fn modify(reason: impl Into<String>, output: Value) -> Self {
        Self { decision: HookDecision::Modify, reason: reason.into(), output }
    }

    fn passthrough(reason: impl Into<String>) -> Self {
        Self { decision: HookDecision::Passthrough, reason: reason.into(), output: json!(null) }
    }
}

/// Every runtime hook implements this trait. Hooks are evaluated synchronously
/// and must be deterministic given the same context and input.
pub trait RuntimeHook: Send + Sync {
    fn name(&self) -> HookName;
    fn evaluate(&self, ctx: &HookContext, input: &Value) -> HookResult;
}

// ─── Concrete Hook Implementations ──────────────────────────────────────────

/// Hook 1: Model Override — resolves which LLM model an agent should use.
pub struct ModelOverrideHook;

impl RuntimeHook for ModelOverrideHook {
    fn name(&self) -> HookName { HookName::ModelOverride }

    fn evaluate(&self, _ctx: &HookContext, input: &Value) -> HookResult {
        // Default model is in the input; check if session/agent overrides apply.
        let default_model = input.get("default_model").cloned().unwrap_or(json!(null));

        // Agent-specific model overrides could be loaded from config/db.
        // For now, passthrough to the default — the policy layer will expand this.
        if default_model.is_null() {
            return HookResult::passthrough("no model specified, passthrough to worker default");
        }

        HookResult::passthrough("using worker-specified default model")
    }
}

/// Hook 2: Pre-Tool-Exec — gate tool execution based on lane/role/intent.
pub struct PreToolExecHook;

impl RuntimeHook for PreToolExecHook {
    fn name(&self) -> HookName { HookName::PreToolExec }

    fn evaluate(&self, ctx: &HookContext, input: &Value) -> HookResult {
        let tool_name = input.get("tool_name").and_then(Value::as_str).unwrap_or("");
        let enforcement = ctx.session.tool_enforcement_level;

        // OS command blocklist — enforced at `very_hard` and `hard` levels.
        const BLOCKED_OS_COMMANDS: &[&str] = &[
            "grep", "find", "cat", "head", "tail", "sed", "awk", "wc",
        ];

        if matches!(enforcement, ToolEnforcementLevel::VeryHard | ToolEnforcementLevel::Hard) {
            if BLOCKED_OS_COMMANDS.iter().any(|cmd| tool_name.starts_with(cmd)) {
                return HookResult::block(format!(
                    "tool '{}' blocked by tool_enforcement_level={:?} — use built-in tools instead",
                    tool_name, enforcement
                ));
            }
        }

        // Lane-specific restrictions.
        match ctx.lane {
            WorkflowLane::Quick => {
                // Quick lane: block heavy infrastructure tools.
                if tool_name == "deploy" || tool_name == "publish" {
                    return HookResult::block("deploy/publish blocked in quick lane");
                }
            }
            WorkflowLane::Migration => {
                // Migration lane: block new feature creation tools.
                if tool_name == "scaffold" || tool_name == "create_component" {
                    return HookResult::block("new feature scaffolding blocked in migration lane");
                }
            }
            WorkflowLane::Delivery => {
                // Delivery lane: all tools allowed (subject to role gates).
            }
        }

        HookResult::allow("tool execution permitted")
    }
}

/// Hook 3: Pre-Answer — gate answer quality before returning to user.
pub struct PreAnswerHook;

impl RuntimeHook for PreAnswerHook {
    fn name(&self) -> HookName { HookName::PreAnswer }

    fn evaluate(&self, ctx: &HookContext, input: &Value) -> HookResult {
        let evidence_score = input.get("evidence_score").and_then(Value::as_f64).unwrap_or(1.0);
        let has_evidence = input.get("has_evidence").and_then(Value::as_bool).unwrap_or(true);

        // Semantic mode gating.
        match ctx.session.semantic_mode {
            SemanticMode::Always => {
                if !has_evidence && evidence_score < 0.3 {
                    return HookResult::block(
                        "answer blocked: insufficient evidence in semantic_mode=always"
                    );
                }
            }
            SemanticMode::OnDemand => {
                // Only gate when explicitly requested by the input.
                if input.get("require_evidence").and_then(Value::as_bool).unwrap_or(false) {
                    if evidence_score < 0.3 {
                        return HookResult::block(
                            "answer blocked: evidence below threshold (on_demand mode)"
                        );
                    }
                }
            }
            SemanticMode::Off => {
                // No evidence gating.
            }
        }

        HookResult::allow("answer quality gate passed")
    }
}

/// Hook 4: Skill Activation — determines which skills are active for a role/stage.
pub struct SkillActivationHook;

impl RuntimeHook for SkillActivationHook {
    fn name(&self) -> HookName { HookName::SkillActivation }

    fn evaluate(&self, ctx: &HookContext, input: &Value) -> HookResult {
        let available_skills: Vec<String> = input.get("available_skills")
            .and_then(Value::as_array)
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        if available_skills.is_empty() {
            return HookResult::passthrough("no skills declared, passthrough");
        }

        // Lane-based skill filtering.
        let activated: Vec<&str> = available_skills.iter().map(|s| s.as_str()).filter(|skill| {
            match ctx.lane {
                WorkflowLane::Quick => {
                    // Quick lane: only allow fast-path skills.
                    !matches!(*skill, "tdd-workflow" | "deployment-procedures" | "parallel-agents")
                }
                WorkflowLane::Migration => {
                    // Migration lane: allow migration-relevant skills.
                    !matches!(*skill, "game-development" | "mcp-builder")
                }
                WorkflowLane::Delivery => true, // All skills available.
            }
        }).collect();

        HookResult::modify(
            format!("activated {}/{} skills for {:?} lane", activated.len(), available_skills.len(), ctx.lane),
            json!({ "activated_skills": activated }),
        )
    }
}

/// Hook 5: MCP Routing — determines which MCP servers a role can access.
pub struct McpRoutingHook;

impl RuntimeHook for McpRoutingHook {
    fn name(&self) -> HookName { HookName::McpRouting }

    fn evaluate(&self, ctx: &HookContext, input: &Value) -> HookResult {
        let available_mcps: Vec<String> = input.get("available_mcps")
            .and_then(Value::as_array)
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        if available_mcps.is_empty() {
            return HookResult::passthrough("no MCPs declared, passthrough");
        }

        // Role-based MCP filtering — only code-facing roles get devtools.
        let routed: Vec<&str> = available_mcps.iter().map(|s| s.as_str()).filter(|mcp| {
            match ctx.role {
                AgentRole::Coordinator | AgentRole::ProductLead => {
                    // Non-code roles: block devtools-type MCPs.
                    !matches!(*mcp, "chrome-devtools-mcp" | "filesystem-mcp")
                }
                _ => true, // Code-facing roles get full access.
            }
        }).collect();

        HookResult::modify(
            format!("routed {}/{} MCPs for {:?}", routed.len(), available_mcps.len(), ctx.role),
            json!({ "routed_mcps": routed }),
        )
    }
}

/// Hook 6: Session State Injection — injects runtime context into worker requests.
pub struct SessionStateInjectionHook;

impl RuntimeHook for SessionStateInjectionHook {
    fn name(&self) -> HookName { HookName::SessionStateInjection }

    fn evaluate(&self, ctx: &HookContext, _input: &Value) -> HookResult {
        let injected = json!({
            "session_id": ctx.session.id,
            "lane": ctx.session.lane.as_str(),
            "lane_locked": ctx.session.lane_locked,
            "current_stage": ctx.session.current_stage,
            "status": format!("{:?}", ctx.session.status),
            "semantic_mode": format!("{:?}", ctx.session.semantic_mode),
            "tool_enforcement_level": format!("{:?}", ctx.session.tool_enforcement_level),
            "agent_id": ctx.agent_id,
            "role": ctx.role.as_str(),
        });

        HookResult::modify("session state injected into worker context", injected)
    }
}

// ─── Hook Dispatcher ────────────────────────────────────────────────────────

/// Dispatches hooks by name, measures execution time, and returns structured
/// invocation logs ready for persistence.
pub struct HookDispatcher {
    hooks: Vec<Box<dyn RuntimeHook>>,
}

impl HookDispatcher {
    /// Create a dispatcher with the standard 6-hook pipeline.
    pub fn new() -> Self {
        Self {
            hooks: vec![
                Box::new(ModelOverrideHook),
                Box::new(PreToolExecHook),
                Box::new(PreAnswerHook),
                Box::new(SkillActivationHook),
                Box::new(McpRoutingHook),
                Box::new(SessionStateInjectionHook),
            ],
        }
    }

    /// Dispatch a single hook by name. Returns the invocation log (for persistence)
    /// and the hook result (for the caller to act on).
    pub fn dispatch(
        &self,
        hook_name: HookName,
        ctx: &HookContext,
        input: &Value,
        session_id: &str,
        envelope_id: Option<&str>,
    ) -> (HookInvocationLog, HookResult) {
        let hook = self.hooks.iter().find(|h| h.name() == hook_name);

        let start = Instant::now();
        let result = match hook {
            Some(h) => h.evaluate(ctx, input),
            None => HookResult::passthrough(format!("no hook registered for {:?}", hook_name)),
        };
        let duration_ms = start.elapsed().as_millis() as u64;

        let now_ms = chrono::Utc::now().timestamp_millis();
        let log_id = format!("hook-{}-{}", hook_name.as_str(), now_ms);

        let log = HookInvocationLog {
            id: log_id,
            session_id: session_id.to_string(),
            envelope_id: envelope_id.map(String::from),
            hook_name,
            input_json: input.clone(),
            output_json: result.output.clone(),
            decision: result.decision,
            reason: result.reason.clone(),
            duration_ms,
            created_at_unix_ms: now_ms,
        };

        (log, result)
    }

    /// Convenience: dispatch all hooks that match a pipeline stage.
    /// Returns all logs and the aggregated decision (first `Block` wins).
    pub fn dispatch_pipeline(
        &self,
        hook_names: &[HookName],
        ctx: &HookContext,
        input: &Value,
        session_id: &str,
        envelope_id: Option<&str>,
    ) -> (Vec<HookInvocationLog>, HookDecision) {
        let mut logs = Vec::with_capacity(hook_names.len());
        let mut final_decision = HookDecision::Passthrough;

        for &name in hook_names {
            let (log, result) = self.dispatch(name, ctx, input, session_id, envelope_id);

            // First Block wins — short-circuit.
            if result.decision == HookDecision::Block {
                logs.push(log);
                return (logs, HookDecision::Block);
            }

            // Escalate: Passthrough → Allow → Modify.
            if matches!(result.decision, HookDecision::Allow | HookDecision::Modify) {
                final_decision = result.decision;
            }

            logs.push(log);
        }

        (logs, final_decision)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dh_types::{SessionStatus, WorkflowLane};

    fn test_context() -> HookContext {
        HookContext {
            session: SessionState {
                id: "test-session-001".to_string(),
                repo_root: "/tmp/test-repo".to_string(),
                lane: WorkflowLane::Quick,
                lane_locked: true,
                current_stage: "quick_execute".to_string(),
                status: SessionStatus::Active,
                semantic_mode: SemanticMode::Always,
                tool_enforcement_level: ToolEnforcementLevel::VeryHard,
                created_at_unix_ms: 1000,
                updated_at_unix_ms: 1000,
            },
            agent_id: "quick-agent".to_string(),
            role: AgentRole::QuickAgent,
            stage: "quick_execute".to_string(),
            lane: WorkflowLane::Quick,
        }
    }

    #[test]
    fn pre_tool_exec_blocks_os_commands() {
        let hook = PreToolExecHook;
        let ctx = test_context();

        let result = hook.evaluate(&ctx, &json!({ "tool_name": "grep" }));
        assert_eq!(result.decision, HookDecision::Block);

        let result = hook.evaluate(&ctx, &json!({ "tool_name": "find" }));
        assert_eq!(result.decision, HookDecision::Block);

        let result = hook.evaluate(&ctx, &json!({ "tool_name": "Read" }));
        assert_eq!(result.decision, HookDecision::Allow);
    }

    #[test]
    fn pre_tool_exec_blocks_deploy_in_quick_lane() {
        let hook = PreToolExecHook;
        let ctx = test_context();

        let result = hook.evaluate(&ctx, &json!({ "tool_name": "deploy" }));
        assert_eq!(result.decision, HookDecision::Block);
    }

    #[test]
    fn pre_answer_blocks_low_evidence() {
        let hook = PreAnswerHook;
        let ctx = test_context();

        let result = hook.evaluate(&ctx, &json!({
            "evidence_score": 0.1,
            "has_evidence": false,
        }));
        assert_eq!(result.decision, HookDecision::Block);
    }

    #[test]
    fn pre_answer_allows_high_evidence() {
        let hook = PreAnswerHook;
        let ctx = test_context();

        let result = hook.evaluate(&ctx, &json!({
            "evidence_score": 0.8,
            "has_evidence": true,
        }));
        assert_eq!(result.decision, HookDecision::Allow);
    }

    #[test]
    fn skill_activation_filters_by_lane() {
        let hook = SkillActivationHook;
        let ctx = test_context();

        let result = hook.evaluate(&ctx, &json!({
            "available_skills": ["clean-code", "tdd-workflow", "brainstorming"]
        }));
        assert_eq!(result.decision, HookDecision::Modify);
        let activated = result.output["activated_skills"].as_array().unwrap();
        assert_eq!(activated.len(), 2); // tdd-workflow filtered out in quick lane
        assert!(activated.contains(&json!("clean-code")));
        assert!(activated.contains(&json!("brainstorming")));
    }

    #[test]
    fn mcp_routing_blocks_devtools_for_coordinator() {
        let hook = McpRoutingHook;
        let mut ctx = test_context();
        ctx.role = AgentRole::Coordinator;

        let result = hook.evaluate(&ctx, &json!({
            "available_mcps": ["chrome-devtools-mcp", "sequential-thinking"]
        }));
        assert_eq!(result.decision, HookDecision::Modify);
        let routed = result.output["routed_mcps"].as_array().unwrap();
        assert_eq!(routed.len(), 1);
        assert!(routed.contains(&json!("sequential-thinking")));
    }

    #[test]
    fn session_state_injection_injects_context() {
        let hook = SessionStateInjectionHook;
        let ctx = test_context();

        let result = hook.evaluate(&ctx, &json!({}));
        assert_eq!(result.decision, HookDecision::Modify);
        assert_eq!(result.output["lane"], "quick");
        assert_eq!(result.output["lane_locked"], true);
        assert_eq!(result.output["session_id"], "test-session-001");
    }

    #[test]
    fn dispatcher_pipeline_short_circuits_on_block() {
        let dispatcher = HookDispatcher::new();
        let ctx = test_context();

        // PreToolExec should block grep, so the pipeline should short-circuit.
        let (logs, decision) = dispatcher.dispatch_pipeline(
            &[HookName::PreToolExec, HookName::PreAnswer],
            &ctx,
            &json!({ "tool_name": "grep" }),
            "test-session-001",
            None,
        );
        assert_eq!(decision, HookDecision::Block);
        assert_eq!(logs.len(), 1); // Short-circuited after first hook.
    }

    #[test]
    fn dispatcher_pipeline_passes_all_hooks() {
        let dispatcher = HookDispatcher::new();
        let ctx = test_context();

        let (logs, decision) = dispatcher.dispatch_pipeline(
            &[HookName::ModelOverride, HookName::SessionStateInjection],
            &ctx,
            &json!({}),
            "test-session-001",
            None,
        );
        assert_ne!(decision, HookDecision::Block);
        assert_eq!(logs.len(), 2);
    }
}
