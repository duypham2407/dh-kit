import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const repoRoot = path.resolve(import.meta.dirname, "..")
const controllerPath = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "kits",
  "openkit",
  ".opencode",
  "lib",
  "workflow-state-controller.js",
)
const workflowStateCliPath = path.join(repoRoot, ".opencode", "workflow-state.js")
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openkit-closeout-summary-"))
const statePath = path.join(tempRoot, ".opencode", "workflow-state.json")

const timestamp = "2026-04-24T00:00:00.000Z"
const makeIssue = (issueId, currentStatus) => ({
  issue_id: issueId,
  title: `${issueId} ${currentStatus}`,
  type: "bug",
  severity: "medium",
  rooted_in: "implementation",
  recommended_owner: "FullstackAgent",
  evidence: "regression fixture",
  artifact_refs: [],
  current_status: currentStatus,
  opened_at: timestamp,
  last_updated_at: timestamp,
  reopen_count: 0,
  repeat_count: 0,
  blocked_since: null,
})

const makeState = (issues) => ({
  work_item_id: "closeout-fixture",
  feature_id: "CLOSEOUT-FIXTURE",
  feature_slug: "closeout-fixture",
  mode: "quick",
  mode_reason: "Regression fixture for closeout-summary issue filtering.",
  lane_source: "orchestrator_routed",
  routing_profile: {
    work_intent: "maintenance",
    behavior_delta: "preserve",
    dominant_uncertainty: "low_local",
    scope_shape: "local",
    selection_reason: "Regression fixture for closeout-summary issue filtering.",
  },
  migration_context: {
    baseline_summary: null,
    target_outcome: null,
    preserved_invariants: [],
    allowed_behavior_changes: [],
    compatibility_hotspots: [],
    baseline_evidence_refs: [],
    rollback_checkpoints: [],
  },
  parallelization: {
    parallel_mode: "none",
    why: null,
    safe_parallel_zones: [],
    sequential_constraints: [],
    integration_checkpoint: null,
    max_active_execution_tracks: null,
  },
  current_stage: "quick_done",
  status: "done",
  current_owner: "QuickAgent",
  artifacts: {
    task_card: null,
    scope_package: null,
    solution_package: null,
    migration_report: null,
    qa_report: null,
    adr: [],
  },
  approvals: {
    quick_verified: {
      status: "approved",
      approved_by: "RegressionTest",
      approved_at: timestamp,
      notes: "Fixture approval.",
    },
  },
  issues,
  verification_evidence: [],
  retry_count: 0,
  escalated_from: null,
  escalation_reason: null,
  last_auto_scaffold: null,
  updated_at: timestamp,
})

const writeFixture = (issues) => {
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, `${JSON.stringify(makeState(issues), null, 2)}\n`, "utf8")
  fs.rmSync(path.join(tempRoot, ".opencode", "work-items"), { recursive: true, force: true })
}

const runCloseoutSummary = () => {
  try {
    return {
      status: 0,
      output: execFileSync(
        process.execPath,
        [workflowStateCliPath, "--state", statePath, "closeout-summary", "closeout-fixture"],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            OPENKIT_PROJECT_ROOT: repoRoot,
          },
          encoding: "utf8",
        },
      ),
    }
  } catch (error) {
    return {
      status: error.status,
      output: error.stdout,
    }
  }
}

const { getWorkItemCloseoutSummary } = await import(controllerPath)

writeFixture([makeIssue("RESOLVED-001", "resolved"), makeIssue("CLOSED-001", "closed")])
const resolvedClosedSummary = getWorkItemCloseoutSummary("closeout-fixture", statePath)
assert.equal(resolvedClosedSummary.unresolvedIssues.length, 0)
assert.equal(resolvedClosedSummary.readyToClose, true)

const resolvedClosedCli = runCloseoutSummary()
assert.equal(resolvedClosedCli.status, 0)
assert.match(resolvedClosedCli.output, /ready to close: yes/)
assert.doesNotMatch(resolvedClosedCli.output, /unresolved issues:/)

writeFixture([makeIssue("OPEN-001", "open"), makeIssue("IN-PROGRESS-001", "in_progress")])
const activeIssueSummary = getWorkItemCloseoutSummary("closeout-fixture", statePath)
assert.equal(activeIssueSummary.unresolvedIssues.length, 2)
assert.equal(activeIssueSummary.readyToClose, false)

const activeIssueCli = runCloseoutSummary()
assert.equal(activeIssueCli.status, 1)
assert.match(activeIssueCli.output, /ready to close: no/)
assert.match(activeIssueCli.output, /unresolved issues: 2/)

fs.rmSync(tempRoot, { recursive: true, force: true })
