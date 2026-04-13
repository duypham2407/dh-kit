package hooks

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"

	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

func TestBridgeSkillActivationIntegrationUsesExactEnvelope(t *testing.T) {
	reader := newSkillMcpReader(t)
	defer reader.Close()

	registry := NewRegistryWithDecisionReader(reader)
	envelope := types.ExecutionEnvelope{SessionID: "sess-1", EnvelopeID: "env-skill-exact", Lane: "quick"}

	skills, err := registry.SkillActivation(envelope)
	if err != nil {
		t.Fatalf("skill activation: %v", err)
	}
	if len(skills) != 2 || skills[0] != "tdd" || skills[1] != "debugging" {
		t.Fatalf("unexpected skills: %#v", skills)
	}
}

func TestBridgeSkillActivationIntegrationFallsBackToSessionScope(t *testing.T) {
	reader := newSkillMcpReader(t)
	defer reader.Close()

	registry := NewRegistryWithDecisionReader(reader)
	envelope := types.ExecutionEnvelope{SessionID: "sess-1", EnvelopeID: "env-missing", Lane: "delivery"}

	skills, err := registry.SkillActivation(envelope)
	if err != nil {
		t.Fatalf("skill activation: %v", err)
	}
	if len(skills) != 1 || skills[0] != "using-skills" {
		t.Fatalf("unexpected fallback skills: %#v", skills)
	}
}

func TestBridgeSkillActivationIntegrationFallsBackToDefaultWhenNoDBRows(t *testing.T) {
	reader := newSkillMcpReader(t)
	defer reader.Close()

	registry := NewRegistryWithDecisionReader(reader)
	envelope := types.ExecutionEnvelope{SessionID: "sess-no-row", EnvelopeID: "env-no-row", Lane: "quick"}

	skills, err := registry.SkillActivation(envelope)
	if err != nil {
		t.Fatalf("skill activation: %v", err)
	}
	if len(skills) != 1 || skills[0] != "using-skills" {
		t.Fatalf("unexpected default skills: %#v", skills)
	}
}

func TestBridgeMcpRoutingIntegrationUsesExactEnvelope(t *testing.T) {
	reader := newSkillMcpReader(t)
	defer reader.Close()

	registry := NewRegistryWithDecisionReader(reader)
	envelope := types.ExecutionEnvelope{SessionID: "sess-1", EnvelopeID: "env-mcp-exact", Lane: "delivery"}

	mcps, blocked, err := registry.McpRouting(envelope, "codebase")
	if err != nil {
		t.Fatalf("mcp routing: %v", err)
	}
	if len(blocked) != 1 || blocked[0] != "playwright" {
		t.Fatalf("expected blocked list from payload, got %#v", blocked)
	}
	if len(mcps) != 2 || mcps[0] != "context7" || mcps[1] != "augment_context_engine" {
		t.Fatalf("unexpected mcps: %#v", mcps)
	}
}

func TestBridgeMcpRoutingIntegrationFallsBackToSessionScope(t *testing.T) {
	reader := newSkillMcpReader(t)
	defer reader.Close()

	registry := NewRegistryWithDecisionReader(reader)
	envelope := types.ExecutionEnvelope{SessionID: "sess-1", EnvelopeID: "env-missing", Lane: "delivery"}

	mcps, blocked, err := registry.McpRouting(envelope, "codebase")
	if err != nil {
		t.Fatalf("mcp routing: %v", err)
	}
	if len(blocked) != 1 || blocked[0] != "chrome-devtools" {
		t.Fatalf("expected blocked list from payload, got %#v", blocked)
	}
	if len(mcps) != 1 || mcps[0] != "augment_context_engine" {
		t.Fatalf("unexpected fallback mcps: %#v", mcps)
	}
}

func TestBridgeMcpRoutingIntegrationFallsBackToDefaultWhenNoDBRows(t *testing.T) {
	reader := newSkillMcpReader(t)
	defer reader.Close()

	registry := NewRegistryWithDecisionReader(reader)
	envelope := types.ExecutionEnvelope{SessionID: "sess-no-row", EnvelopeID: "env-no-row", Lane: "quick"}

	mcps, blocked, err := registry.McpRouting(envelope, "browser")
	if err != nil {
		t.Fatalf("mcp routing: %v", err)
	}
	if len(blocked) != 0 {
		t.Fatalf("expected empty blocked list, got %#v", blocked)
	}
	if len(mcps) != 2 || mcps[0] != "chrome-devtools" || mcps[1] != "playwright" {
		t.Fatalf("unexpected default mcps: %#v", mcps)
	}
}

func newSkillMcpReader(t *testing.T) bridge.DecisionReader {
	t.Helper()

	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}

	dbPath := filepath.Join(repoRoot, bridge.DBPathTemplate)
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE hook_invocation_logs (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			envelope_id TEXT NOT NULL,
			hook_name TEXT NOT NULL,
			input_json TEXT NOT NULL,
			output_json TEXT NOT NULL,
			decision TEXT NOT NULL,
			reason TEXT NOT NULL,
			duration_ms REAL NOT NULL,
			timestamp TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO hook_invocation_logs (id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, timestamp)
		VALUES
		('s1', 'sess-1', 'sess-1',         'skill_activation', '{}', '{"skills":["using-skills"]}', 'modify', 'session', 1, '2026-04-05T10:00:00Z'),
		('s2', 'sess-1', 'env-skill-exact','skill_activation', '{}', '{"skills":["tdd","debugging"]}', 'modify', 'exact', 1, '2026-04-05T10:01:00Z'),
		('m1', 'sess-1', 'sess-1',         'mcp_routing',      '{}', '{"mcps":["augment_context_engine"],"blocked":["chrome-devtools"]}', 'modify', 'session', 1, '2026-04-05T10:02:00Z'),
		('m2', 'sess-1', 'env-mcp-exact',  'mcp_routing',      '{}', '{"mcps":["context7","augment_context_engine"],"blocked":["playwright"]}', 'modify', 'exact', 1, '2026-04-05T10:03:00Z');
	`); err != nil {
		t.Fatalf("insert rows: %v", err)
	}

	reader, err := bridge.NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	return reader
}
