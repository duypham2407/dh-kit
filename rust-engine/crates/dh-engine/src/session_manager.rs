//! Session & Workflow State Machine — Rust-authoritative session lifecycle.
//!
//! The `SessionManager` owns session creation, lane locking, stage transitions,
//! and gate evaluation. It persists all state to SQLite via the storage repositories.

use dh_storage::{
    Database, ExecutionEnvelopeRepository, HookLogRepository, SessionRepository,
    WorkflowStageRepository,
};
use dh_types::{
    AgentRole, ExecutionEnvelope, GateStatus, SessionState, SessionStatus, StageStatus,
    WorkflowLane, WorkflowStageState,
};

use anyhow::{bail, Context, Result};

// ─── Stage Chain Constants ──────────────────────────────────────────────────

pub const QUICK_STAGES: &[&str] = &[
    "quick_intake",
    "quick_plan",
    "quick_execute",
    "quick_verify",
    "quick_complete",
];

pub const DELIVERY_STAGES: &[&str] = &[
    "delivery_intake",
    "delivery_analysis",
    "delivery_solution",
    "delivery_task_split",
    "delivery_execute",
    "delivery_review",
    "delivery_verify",
    "delivery_complete",
];

pub const MIGRATION_STAGES: &[&str] = &[
    "migration_intake",
    "migration_baseline",
    "migration_strategy",
    "migration_task_split",
    "migration_execute",
    "migration_review",
    "migration_verify",
    "migration_complete",
];

/// Returns the valid stage chain for a given lane.
pub fn stage_chain_for(lane: WorkflowLane) -> &'static [&'static str] {
    match lane {
        WorkflowLane::Quick => QUICK_STAGES,
        WorkflowLane::Delivery => DELIVERY_STAGES,
        WorkflowLane::Migration => MIGRATION_STAGES,
    }
}

/// Returns the initial (first) stage for a lane.
fn initial_stage(lane: WorkflowLane) -> &'static str {
    stage_chain_for(lane)[0]
}

/// Checks if `next_stage` is a valid successor to `current_stage` in the given lane.
fn is_valid_transition(lane: WorkflowLane, current_stage: &str, next_stage: &str) -> bool {
    let chain = stage_chain_for(lane);
    let current_idx = chain.iter().position(|s| *s == current_stage);
    let next_idx = chain.iter().position(|s| *s == next_stage);

    match (current_idx, next_idx) {
        (Some(curr), Some(next)) => next == curr + 1,
        _ => false,
    }
}

// ─── Session Manager ────────────────────────────────────────────────────────

/// Manages session lifecycle — the Rust engine is the single source of truth.
pub struct SessionManager<'a> {
    db: &'a Database,
}

impl<'a> SessionManager<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Create a new session with a locked lane. Returns the initial session state.
    pub fn create_session(
        &self,
        session_id: &str,
        repo_root: &str,
        lane: WorkflowLane,
    ) -> Result<SessionState> {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let first_stage = initial_stage(lane);

        let session = SessionState {
            id: session_id.to_string(),
            repo_root: repo_root.to_string(),
            lane,
            lane_locked: true,
            current_stage: first_stage.to_string(),
            status: SessionStatus::Pending,
            semantic_mode: dh_types::SemanticMode::Always,
            tool_enforcement_level: dh_types::ToolEnforcementLevel::VeryHard,
            created_at_unix_ms: now_ms,
            updated_at_unix_ms: now_ms,
        };

        self.db.create_session(&session)
            .context("failed to persist new session")?;

        // Insert initial workflow stage
        let stage_state = WorkflowStageState {
            session_id: session_id.to_string(),
            lane,
            stage: first_stage.to_string(),
            stage_status: StageStatus::Pending,
            previous_stage: None,
            gate_status: GateStatus::Pending,
            updated_at_unix_ms: now_ms,
        };
        self.db.insert_stage(&stage_state)
            .context("failed to persist initial workflow stage")?;

        Ok(session)
    }

    /// Resume an existing session by ID. Returns the current state or None.
    pub fn resume_session(&self, session_id: &str) -> Result<Option<SessionState>> {
        self.db.get_session(session_id)
    }

    /// Activate a pending session (transition to Active status).
    pub fn activate_session(&self, session_id: &str) -> Result<()> {
        let session = self.db.get_session(session_id)?
            .context("session not found")?;

        if session.status != SessionStatus::Pending {
            bail!(
                "cannot activate session in {:?} status, expected Pending",
                session.status
            );
        }

        let now_ms = chrono::Utc::now().timestamp_millis();
        self.db.update_session_status(session_id, SessionStatus::Active, now_ms)?;

        // Also activate the first stage
        let chain = stage_chain_for(session.lane);
        self.db.update_stage_status(
            session_id,
            chain[0],
            StageStatus::InProgress,
            GateStatus::Pending,
            now_ms,
        )?;

        Ok(())
    }

    /// Transition to the next stage in the workflow. Validates:
    /// 1. Session is Active
    /// 2. Lane lock matches
    /// 3. Stage transition is valid per the lane's stage chain
    /// 4. Current stage's gate has passed
    pub fn transition_stage(
        &self,
        session_id: &str,
        next_stage: &str,
    ) -> Result<WorkflowStageState> {
        let session = self.db.get_session(session_id)?
            .context("session not found")?;

        if session.status != SessionStatus::Active {
            bail!(
                "cannot transition stage: session status is {:?}, expected Active",
                session.status
            );
        }

        // Validate transition against the lane's stage chain
        if !is_valid_transition(session.lane, &session.current_stage, next_stage) {
            bail!(
                "invalid stage transition: {:?} -> {:?} for {:?} lane",
                session.current_stage, next_stage, session.lane
            );
        }

        // Check current stage gate
        let current = self.db.get_current_stage(session_id)?;
        if let Some(ref cs) = current {
            if cs.gate_status != GateStatus::Passed && cs.gate_status != GateStatus::Waived {
                bail!(
                    "cannot transition: current stage '{}' gate is {:?}, expected Passed or Waived",
                    cs.stage, cs.gate_status
                );
            }
        }

        let now_ms = chrono::Utc::now().timestamp_millis();

        // Mark current stage as passed
        self.db.update_stage_status(
            session_id,
            &session.current_stage,
            StageStatus::Passed,
            current.map(|c| c.gate_status).unwrap_or(GateStatus::Passed),
            now_ms,
        )?;

        // Insert new stage
        let new_stage = WorkflowStageState {
            session_id: session_id.to_string(),
            lane: session.lane,
            stage: next_stage.to_string(),
            stage_status: StageStatus::InProgress,
            previous_stage: Some(session.current_stage.clone()),
            gate_status: GateStatus::Pending,
            updated_at_unix_ms: now_ms,
        };
        self.db.insert_stage(&new_stage)?;

        // Update session's current_stage pointer
        self.db.update_session_stage(session_id, next_stage, now_ms)?;

        Ok(new_stage)
    }

    /// Pass the gate on the current stage (prerequisite for transitioning).
    pub fn pass_gate(&self, session_id: &str) -> Result<()> {
        let session = self.db.get_session(session_id)?
            .context("session not found")?;

        let now_ms = chrono::Utc::now().timestamp_millis();
        self.db.update_stage_status(
            session_id,
            &session.current_stage,
            StageStatus::InProgress,
            GateStatus::Passed,
            now_ms,
        )?;

        Ok(())
    }

    /// Waive the gate on the current stage (bypass gate check).
    pub fn waive_gate(&self, session_id: &str) -> Result<()> {
        let session = self.db.get_session(session_id)?
            .context("session not found")?;

        let now_ms = chrono::Utc::now().timestamp_millis();
        self.db.update_stage_status(
            session_id,
            &session.current_stage,
            StageStatus::InProgress,
            GateStatus::Waived,
            now_ms,
        )?;

        Ok(())
    }

    /// Complete a session (set status to Completed, mark final stage as Passed).
    pub fn complete_session(&self, session_id: &str) -> Result<()> {
        let session = self.db.get_session(session_id)?
            .context("session not found")?;

        let chain = stage_chain_for(session.lane);
        let final_stage = chain.last().unwrap();

        if session.current_stage != *final_stage {
            bail!(
                "cannot complete session: current stage '{}' is not the final stage '{}'",
                session.current_stage, final_stage
            );
        }

        let now_ms = chrono::Utc::now().timestamp_millis();

        // Mark final stage as passed
        self.db.update_stage_status(
            session_id,
            final_stage,
            StageStatus::Passed,
            GateStatus::Passed,
            now_ms,
        )?;

        // Update session status
        self.db.update_session_status(session_id, SessionStatus::Completed, now_ms)?;

        Ok(())
    }

    /// Fail a session (set status to Failed).
    pub fn fail_session(&self, session_id: &str, reason: &str) -> Result<()> {
        let session = self.db.get_session(session_id)?
            .context("session not found")?;

        let now_ms = chrono::Utc::now().timestamp_millis();

        // Mark current stage as failed
        self.db.update_stage_status(
            session_id,
            &session.current_stage,
            StageStatus::Failed,
            GateStatus::Failed,
            now_ms,
        )?;

        // Update session status
        self.db.update_session_status(session_id, SessionStatus::Failed, now_ms)?;

        Ok(())
    }

    /// Create an execution envelope for a role dispatch within a session.
    pub fn create_envelope(
        &self,
        session_id: &str,
        agent_id: &str,
        role: AgentRole,
        work_item_id: Option<&str>,
    ) -> Result<ExecutionEnvelope> {
        let session = self.db.get_session(session_id)?
            .context("session not found")?;

        let now_ms = chrono::Utc::now().timestamp_millis();
        let envelope_id = format!("env-{}-{}", agent_id, now_ms);

        let envelope = ExecutionEnvelope {
            id: envelope_id,
            session_id: session_id.to_string(),
            lane: session.lane,
            role,
            agent_id: agent_id.to_string(),
            stage: session.current_stage.clone(),
            work_item_id: work_item_id.map(String::from),
            resolved_model: None,
            active_skills: vec![],
            active_mcps: vec![],
            created_at_unix_ms: now_ms,
        };

        self.db.insert_envelope(&envelope)?;

        Ok(envelope)
    }

    /// Get the full stage history for a session.
    pub fn stage_history(&self, session_id: &str) -> Result<Vec<WorkflowStageState>> {
        self.db.list_stages(session_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Database {
        let db = Database::new(":memory:").unwrap();
        db.initialize().unwrap();
        db
    }

    #[test]
    fn create_session_initializes_at_first_stage() {
        let db = setup_db();
        let mgr = SessionManager::new(&db);

        let session = mgr.create_session("s1", "/repo", WorkflowLane::Quick).unwrap();
        assert_eq!(session.current_stage, "quick_intake");
        assert_eq!(session.status, SessionStatus::Pending);
        assert!(session.lane_locked);

        let resumed = mgr.resume_session("s1").unwrap().unwrap();
        assert_eq!(resumed.id, "s1");
    }

    #[test]
    fn activate_and_transition_through_quick_lane() {
        let db = setup_db();
        let mgr = SessionManager::new(&db);

        mgr.create_session("s2", "/repo", WorkflowLane::Quick).unwrap();
        mgr.activate_session("s2").unwrap();

        let session = mgr.resume_session("s2").unwrap().unwrap();
        assert_eq!(session.status, SessionStatus::Active);

        // Must pass gate before transitioning
        mgr.pass_gate("s2").unwrap();
        let next = mgr.transition_stage("s2", "quick_plan").unwrap();
        assert_eq!(next.stage, "quick_plan");
        assert_eq!(next.previous_stage.as_deref(), Some("quick_intake"));
    }

    #[test]
    fn invalid_transition_is_rejected() {
        let db = setup_db();
        let mgr = SessionManager::new(&db);

        mgr.create_session("s3", "/repo", WorkflowLane::Quick).unwrap();
        mgr.activate_session("s3").unwrap();
        mgr.pass_gate("s3").unwrap();

        // Trying to skip to quick_execute (should fail, next valid is quick_plan)
        let result = mgr.transition_stage("s3", "quick_execute");
        assert!(result.is_err());
    }

    #[test]
    fn gate_must_pass_before_transition() {
        let db = setup_db();
        let mgr = SessionManager::new(&db);

        mgr.create_session("s4", "/repo", WorkflowLane::Delivery).unwrap();
        mgr.activate_session("s4").unwrap();

        // Don't pass gate — transition should fail
        let result = mgr.transition_stage("s4", "delivery_analysis");
        assert!(result.is_err());
    }

    #[test]
    fn complete_session_only_from_final_stage() {
        let db = setup_db();
        let mgr = SessionManager::new(&db);

        mgr.create_session("s5", "/repo", WorkflowLane::Quick).unwrap();
        mgr.activate_session("s5").unwrap();

        // Can't complete from first stage
        let result = mgr.complete_session("s5");
        assert!(result.is_err());
    }

    #[test]
    fn full_quick_lane_lifecycle() {
        let db = setup_db();
        let mgr = SessionManager::new(&db);

        mgr.create_session("s6", "/repo", WorkflowLane::Quick).unwrap();
        mgr.activate_session("s6").unwrap();

        // Walk through all stages
        let stages = QUICK_STAGES;
        for i in 0..stages.len() - 1 {
            mgr.pass_gate("s6").unwrap();
            mgr.transition_stage("s6", stages[i + 1]).unwrap();
        }

        // Now at quick_complete — complete the session
        mgr.pass_gate("s6").unwrap();
        mgr.complete_session("s6").unwrap();

        let session = mgr.resume_session("s6").unwrap().unwrap();
        assert_eq!(session.status, SessionStatus::Completed);

        let history = mgr.stage_history("s6").unwrap();
        assert_eq!(history.len(), stages.len());
    }

    #[test]
    fn create_envelope_captures_session_context() {
        let db = setup_db();
        let mgr = SessionManager::new(&db);

        mgr.create_session("s7", "/repo", WorkflowLane::Quick).unwrap();
        mgr.activate_session("s7").unwrap();

        let envelope = mgr.create_envelope("s7", "quick-agent", AgentRole::QuickAgent, None).unwrap();
        assert_eq!(envelope.session_id, "s7");
        assert_eq!(envelope.lane, WorkflowLane::Quick);
        assert_eq!(envelope.role, AgentRole::QuickAgent);
        assert_eq!(envelope.stage, "quick_intake");
    }

    #[test]
    fn fail_session_marks_stage_and_status() {
        let db = setup_db();
        let mgr = SessionManager::new(&db);

        mgr.create_session("s8", "/repo", WorkflowLane::Migration).unwrap();
        mgr.activate_session("s8").unwrap();

        mgr.fail_session("s8", "critical error").unwrap();

        let session = mgr.resume_session("s8").unwrap().unwrap();
        assert_eq!(session.status, SessionStatus::Failed);
    }
}
