package agent

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"

	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/hooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/message"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

func TestPreAnswerBridgeIntegrationAllowFromDB(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	reader := newPreAnswerReader(t)
	defer reader.Close()

	registry := hooks.NewRegistryWithDecisionReader(reader)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			envelope := types.ExecutionEnvelope{SessionID: sessionID, EnvelopeID: envelopeID}
			return registry.PreAnswer(envelope, intent, toolsUsed, evidenceScore)
		},
	})

	msg := message.Message{ID: "env-allow", Parts: []message.ContentPart{message.TextContent{Text: "answer"}}}
	result, err := evaluatePreAnswerPolicy(context.Background(), "sess-1", msg, preAnswerContext{intent: "codebase_query", toolsUsed: []string{"glob"}, evidenceScore: 0.8})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.allow {
		t.Fatalf("expected allow=true, got %#v", result)
	}
}

func TestPreAnswerBridgeIntegrationRetryFromDB(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	reader := newPreAnswerReader(t)
	defer reader.Close()

	registry := hooks.NewRegistryWithDecisionReader(reader)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			envelope := types.ExecutionEnvelope{SessionID: sessionID, EnvelopeID: envelopeID}
			return registry.PreAnswer(envelope, intent, toolsUsed, evidenceScore)
		},
	})

	msg := message.Message{ID: "env-retry", Parts: []message.ContentPart{message.TextContent{Text: "answer"}}}
	result, err := evaluatePreAnswerPolicy(context.Background(), "sess-1", msg, preAnswerContext{intent: "verification", toolsUsed: []string{"glob", "grep"}, evidenceScore: 0.4})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.allow {
		t.Fatal("expected allow=false for retry decision")
	}
	if result.outcome != preAnswerOutcomeRetry {
		t.Fatalf("expected retry outcome, got %v", result.outcome)
	}
}

func TestPreAnswerBridgeIntegrationDegradeFromDB(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	reader := newPreAnswerReader(t)
	defer reader.Close()

	registry := hooks.NewRegistryWithDecisionReader(reader)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			envelope := types.ExecutionEnvelope{SessionID: sessionID, EnvelopeID: envelopeID}
			return registry.PreAnswer(envelope, intent, toolsUsed, evidenceScore)
		},
	})

	msg := message.Message{ID: "env-degrade", Parts: []message.ContentPart{message.TextContent{Text: "answer"}}}
	result, err := evaluatePreAnswerPolicy(context.Background(), "sess-1", msg, preAnswerContext{intent: "code_change", toolsUsed: []string{"bash"}, evidenceScore: 0.2})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.allow {
		t.Fatal("expected allow=false for degrade decision")
	}
	if result.outcome != preAnswerOutcomeRespond {
		t.Fatalf("expected respond outcome, got %v", result.outcome)
	}
	if result.event.Type != AgentEventTypeResponse || !result.event.Done {
		t.Fatalf("unexpected response event: %#v", result.event)
	}
}

func TestPreAnswerBridgeIntegrationBlockFromDB(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	reader := newPreAnswerReader(t)
	defer reader.Close()

	registry := hooks.NewRegistryWithDecisionReader(reader)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			envelope := types.ExecutionEnvelope{SessionID: sessionID, EnvelopeID: envelopeID}
			return registry.PreAnswer(envelope, intent, toolsUsed, evidenceScore)
		},
	})

	msg := message.Message{ID: "env-block", Parts: []message.ContentPart{message.TextContent{Text: "answer"}}}
	result, err := evaluatePreAnswerPolicy(context.Background(), "sess-1", msg, preAnswerContext{intent: "code_change", toolsUsed: []string{"bash"}, evidenceScore: 0.1})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.allow {
		t.Fatal("expected allow=false for block decision")
	}
	if result.outcome != preAnswerOutcomeError {
		t.Fatalf("expected error outcome, got %v", result.outcome)
	}
	if result.event.Type != AgentEventTypeError || result.event.Error == nil {
		t.Fatalf("unexpected error event: %#v", result.event)
	}
}

func newPreAnswerReader(t *testing.T) bridge.DecisionReader {
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
		('1', 'sess-1', 'env-allow',   'pre_answer', '{}', '{}', 'allow', 'approved', 1, '2026-04-05T10:00:00Z'),
		('2', 'sess-1', 'env-retry',   'pre_answer', '{}', '{}', 'block', 'retry_with_more_evidence', 1, '2026-04-05T10:01:00Z'),
		('3', 'sess-1', 'env-degrade', 'pre_answer', '{}', '{}', 'block', 'degrade_insufficient_evidence', 1, '2026-04-05T10:02:00Z'),
		('4', 'sess-1', 'env-block',   'pre_answer', '{}', '{}', 'block', 'blocked_by_policy', 1, '2026-04-05T10:03:00Z');
	`); err != nil {
		t.Fatalf("insert rows: %v", err)
	}

	reader, err := bridge.NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	return reader
}
