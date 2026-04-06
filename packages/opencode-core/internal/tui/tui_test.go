package tui

import (
	"fmt"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/bubbles/viewport"
	"github.com/duypham93/dh/packages/opencode-core/internal/message"
	"github.com/duypham93/dh/packages/opencode-core/internal/permission"
)

// ── renderMarkdown tests ─────────────────────────────────────────────────

func TestRenderMarkdownEmptyInput(t *testing.T) {
	out := renderMarkdown("", 80)
	if out != "" {
		t.Fatalf("expected empty string, got %q", out)
	}
}

func TestRenderMarkdownPlainText(t *testing.T) {
	out := renderMarkdown("Hello, world!", 80)
	if !strings.Contains(out, "Hello, world!") {
		t.Fatalf("expected plain text in output, got %q", out)
	}
}

func TestRenderMarkdownHeading(t *testing.T) {
	out := renderMarkdown("# Title", 80)
	if !strings.Contains(out, "Title") {
		t.Fatalf("expected heading text in output, got %q", out)
	}
	// Should contain the "#" prefix marker from the renderer
	if !strings.Contains(out, "#") {
		t.Fatalf("expected # marker in heading output, got %q", out)
	}
}

func TestRenderMarkdownH2(t *testing.T) {
	out := renderMarkdown("## Subtitle", 80)
	if !strings.Contains(out, "Subtitle") {
		t.Fatalf("expected heading text in output, got %q", out)
	}
	if !strings.Contains(out, "##") {
		t.Fatalf("expected ## marker in heading output, got %q", out)
	}
}

func TestRenderMarkdownBulletList(t *testing.T) {
	md := `- Alpha
- Beta
- Gamma`
	out := renderMarkdown(md, 80)
	if !strings.Contains(out, "•") {
		t.Fatalf("expected bullet marker in output, got %q", out)
	}
	if !strings.Contains(out, "Alpha") {
		t.Fatalf("expected list item Alpha in output, got %q", out)
	}
	if !strings.Contains(out, "Beta") {
		t.Fatalf("expected list item Beta in output, got %q", out)
	}
	if !strings.Contains(out, "Gamma") {
		t.Fatalf("expected list item Gamma in output, got %q", out)
	}
}

func TestRenderMarkdownOrderedList(t *testing.T) {
	md := `1. First
2. Second
3. Third`
	out := renderMarkdown(md, 80)
	if !strings.Contains(out, "1.") {
		t.Fatalf("expected '1.' in ordered list output, got %q", out)
	}
	if !strings.Contains(out, "2.") {
		t.Fatalf("expected '2.' in ordered list output, got %q", out)
	}
	if !strings.Contains(out, "3.") {
		t.Fatalf("expected '3.' in ordered list output, got %q", out)
	}
	if !strings.Contains(out, "First") {
		t.Fatalf("expected 'First' in output, got %q", out)
	}
}

func TestRenderMarkdownFencedCodeBlock(t *testing.T) {
	md := "```go\nfunc main() {}\n```"
	out := renderMarkdown(md, 80)
	if !strings.Contains(out, "func") || !strings.Contains(out, "main") {
		t.Fatalf("expected code block content in output, got %q", out)
	}
}

func TestRenderMarkdownCodeSpan(t *testing.T) {
	md := "Use the `fmt.Println` function."
	out := renderMarkdown(md, 80)
	if !strings.Contains(out, "fmt.Println") {
		t.Fatalf("expected inline code in output, got %q", out)
	}
}

func TestRenderMarkdownLink(t *testing.T) {
	md := "Visit [example](https://example.com) for more info."
	out := renderMarkdown(md, 80)
	if !strings.Contains(out, "example") {
		t.Fatalf("expected link text in output, got %q", out)
	}
	if !strings.Contains(out, "https://example.com") {
		t.Fatalf("expected URL in output, got %q", out)
	}
}

func TestRenderMarkdownBoldText(t *testing.T) {
	md := "This is **bold** text."
	out := renderMarkdown(md, 80)
	if !strings.Contains(out, "bold") {
		t.Fatalf("expected bold text in output, got %q", out)
	}
}

func TestRenderMarkdownBlockquote(t *testing.T) {
	md := "> This is a quote."
	out := renderMarkdown(md, 80)
	if !strings.Contains(out, "This is a quote") {
		t.Fatalf("expected blockquote text in output, got %q", out)
	}
	if !strings.Contains(out, "│") {
		t.Fatalf("expected blockquote marker in output, got %q", out)
	}
}

func TestRenderMarkdownThematicBreak(t *testing.T) {
	md := "Above\n\n---\n\nBelow"
	out := renderMarkdown(md, 80)
	if !strings.Contains(out, "─") {
		t.Fatalf("expected thematic break (─) in output, got %q", out)
	}
	if !strings.Contains(out, "Above") || !strings.Contains(out, "Below") {
		t.Fatalf("expected content around break, got %q", out)
	}
}

func TestRenderMarkdownGracefulFallback(t *testing.T) {
	// renderMarkdown should not panic even with weird content
	out := renderMarkdown("```\n```\n```", 80)
	// Just verify it doesn't panic and returns something
	if out == "" {
		// Empty fenced blocks might render empty — that's ok
		return
	}
}

func TestRenderMarkdownParagraphSpacing(t *testing.T) {
	md := "First paragraph.\n\nSecond paragraph."
	out := renderMarkdown(md, 80)
	if !strings.Contains(out, "First paragraph.") || !strings.Contains(out, "Second paragraph.") {
		t.Fatalf("expected both paragraphs in output, got %q", out)
	}
	// After our fix, paragraphs should have a newline between them
	idx1 := strings.Index(out, "First paragraph.")
	idx2 := strings.Index(out, "Second paragraph.")
	if idx2 <= idx1 {
		t.Fatalf("second paragraph should appear after first")
	}
	between := out[idx1+len("First paragraph.") : idx2]
	if !strings.Contains(between, "\n") {
		t.Fatalf("expected newline between paragraphs, got %q", between)
	}
}

// ── highlightCode tests ──────────────────────────────────────────────────

func TestHighlightCodeGoSyntax(t *testing.T) {
	code := `func main() {
	fmt.Println("hello")
}`
	out := highlightCode(code, "go")
	if !strings.Contains(out, "func") {
		t.Fatalf("expected 'func' in highlighted output, got %q", out)
	}
	if !strings.Contains(out, "main") {
		t.Fatalf("expected 'main' in highlighted output, got %q", out)
	}
}

func TestHighlightCodeNoLanguageFallback(t *testing.T) {
	code := "hello world"
	out := highlightCode(code, "")
	if !strings.Contains(out, "hello") {
		t.Fatalf("expected 'hello' in output, got %q", out)
	}
}

func TestHighlightCodeUnknownLanguage(t *testing.T) {
	code := "some code"
	out := highlightCode(code, "nosuchlang")
	if !strings.Contains(out, "some code") {
		t.Fatalf("expected code text in output even with unknown language, got %q", out)
	}
}

func TestHighlightCodePython(t *testing.T) {
	code := `def hello():
    print("hi")
`
	out := highlightCode(code, "python")
	if !strings.Contains(out, "def") || !strings.Contains(out, "hello") {
		t.Fatalf("expected Python code in output, got %q", out)
	}
}

func TestHighlightCodeJavaScript(t *testing.T) {
	code := `const x = 42;`
	out := highlightCode(code, "javascript")
	if !strings.Contains(out, "const") || !strings.Contains(out, "42") {
		t.Fatalf("expected JS code in output, got %q", out)
	}
}

func TestHighlightCodeEmptyString(t *testing.T) {
	out := highlightCode("", "go")
	// Should not panic; empty or near-empty output is fine
	_ = out
}

// ── helpText tests ───────────────────────────────────────────────────────

func TestHelpTextContainsAllCommands(t *testing.T) {
	help := helpText()
	commands := []string{
		"/ask", "/quick", "/explain", "/trace", "/attach",
		"/doctor", "/index", "/sessions", "/switch",
		"/summarize", "/model", "/cost", "/clear", "/new", "/quit",
	}
	for _, cmd := range commands {
		if !strings.Contains(help, cmd) {
			t.Errorf("help text missing command %s", cmd)
		}
	}
}

func TestHelpTextContainsModelSubcommands(t *testing.T) {
	help := helpText()
	if !strings.Contains(help, "/model list") {
		t.Error("help text missing /model list")
	}
	if !strings.Contains(help, "/model <id>") {
		t.Error("help text missing /model <id>")
	}
}

// ── chatEntry rendering tests ────────────────────────────────────────────

func TestRefreshViewportEmptyChat(t *testing.T) {
	// Minimal model — no app, just test that refreshViewport doesn't panic
	// with an empty chat and no streaming content
	m := &Model{
		chat:  []chatEntry{},
		width: 80,
	}
	m.viewport = newVP(80, 20)
	m.refreshViewport()
	content := m.viewport.View()
	if content == "" {
		// Empty viewport is fine
		return
	}
}

func TestRefreshViewportWithEntries(t *testing.T) {
	m := &Model{
		chat: []chatEntry{
			{role: "user", content: "hello"},
			{role: "assistant", content: "hi there"},
			{role: "system", content: "session ready"},
			{role: "error", content: "something broke"},
			{role: "tool", content: "running ls"},
		},
		width: 80,
	}
	m.viewport = newVP(80, 20)
	m.refreshViewport()
	content := m.viewport.View()
	if !strings.Contains(content, "hello") {
		t.Errorf("expected user message in viewport")
	}
}

func TestRefreshViewportStreamingContent(t *testing.T) {
	m := &Model{
		chat:             []chatEntry{},
		busy:             true,
		streamingContent: "partial response here",
		width:            80,
	}
	m.viewport = newVP(80, 40)
	m.refreshViewport()
	content := m.viewport.View()
	if !strings.Contains(content, "partial response here") {
		t.Errorf("expected streaming content in viewport, got: %s", content)
	}
}

func TestRefreshViewportBusyNoContent(t *testing.T) {
	m := &Model{
		chat:  []chatEntry{},
		busy:  true,
		width: 80,
	}
	m.viewport = newVP(80, 20)
	m.refreshViewport()
	content := m.viewport.View()
	if !strings.Contains(content, "Thinking") {
		t.Errorf("expected 'Thinking...' in viewport when busy with no content, got: %s", content)
	}
}

// helper to create a viewport model
func newVP(w, h int) viewport.Model {
	vp := viewport.New(w, h)
	return vp
}

// ── Slash command completion tests ───────────────────────────────────────

func TestSlashCommandsAreSorted(t *testing.T) {
	for i := 1; i < len(slashCommands); i++ {
		if slashCommands[i] < slashCommands[i-1] {
			t.Errorf("slashCommands not sorted: %s comes after %s", slashCommands[i], slashCommands[i-1])
		}
	}
}

func TestSlashCommandsAllStartWithSlash(t *testing.T) {
	for _, cmd := range slashCommands {
		if !strings.HasPrefix(cmd, "/") {
			t.Errorf("slash command %q does not start with /", cmd)
		}
	}
}

func TestSlashCommandsNoDuplicates(t *testing.T) {
	seen := make(map[string]bool)
	for _, cmd := range slashCommands {
		if seen[cmd] {
			t.Errorf("duplicate slash command: %s", cmd)
		}
		seen[cmd] = true
	}
}

func TestSlashCommandsIncludeAllHandled(t *testing.T) {
	// All commands from the switch statement in handleSlashCommand should
	// be present in slashCommands for tab completion
	handled := []string{
		"/help", "/quit", "/exit", "/ask", "/quick", "/explain", "/trace",
		"/doctor", "/index", "/sessions", "/switch", "/summarize",
		"/model", "/attach", "/cost", "/clear", "/new",
	}
	for _, cmd := range handled {
		found := false
		for _, sc := range slashCommands {
			if sc == cmd {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("handled command %s not in slashCommands list", cmd)
		}
	}
}

// ── File completion overlay tests ────────────────────────────────────────

func TestFileCompletionMsgSetsOverlay(t *testing.T) {
	m := newTestModel()
	m.fileCompletionQuery = "main"

	// Simulate receiving a fileCompletionMsg with matches
	msg := fileCompletionMsg{
		matches: []string{"main.go", "main_test.go", "cmd/main.go"},
	}
	result, _ := m.Update(msg)
	updated := result.(Model)

	if updated.overlay != overlayFileCompletion {
		t.Errorf("expected overlayFileCompletion, got %d", updated.overlay)
	}
	if len(updated.fileCompletionItems) != 3 {
		t.Errorf("expected 3 file completion items, got %d", len(updated.fileCompletionItems))
	}
	if updated.fileCompletionSelected != 0 {
		t.Errorf("expected selected index 0, got %d", updated.fileCompletionSelected)
	}
}

func TestFileCompletionMsgError(t *testing.T) {
	m := newTestModel()
	m.fileCompletionQuery = "nonexistent"

	msg := fileCompletionMsg{
		err: fmt.Errorf("search failed"),
	}
	result, _ := m.Update(msg)
	updated := result.(Model)

	// Overlay should not be shown on error
	if updated.overlay == overlayFileCompletion {
		t.Error("overlay should not show on error")
	}
	// Should have an error chat entry
	hasError := false
	for _, entry := range updated.chat {
		if entry.role == "error" {
			hasError = true
			break
		}
	}
	if !hasError {
		t.Error("expected an error chat entry when file completion fails")
	}
}

func TestFileCompletionMsgEmpty(t *testing.T) {
	m := newTestModel()
	m.fileCompletionQuery = "zzznomatch"

	msg := fileCompletionMsg{
		matches: []string{},
	}
	result, _ := m.Update(msg)
	updated := result.(Model)

	// No overlay if no matches
	if updated.overlay == overlayFileCompletion {
		t.Error("overlay should not show when there are no matches")
	}
	// Should have a system message about no matches
	hasSystem := false
	for _, entry := range updated.chat {
		if entry.role == "system" && strings.Contains(entry.content, "No matching") {
			hasSystem = true
			break
		}
	}
	if !hasSystem {
		t.Error("expected a system message about no matching files")
	}
}

func TestFileCompletionNavigateDown(t *testing.T) {
	m := newTestModel()
	m.overlay = overlayFileCompletion
	m.fileCompletionItems = []string{"a.go", "b.go", "c.go"}
	m.fileCompletionSelected = 0
	m.height = 40

	// Press down
	result, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	updated := result.(Model)
	if updated.fileCompletionSelected != 1 {
		t.Errorf("expected selected 1 after down, got %d", updated.fileCompletionSelected)
	}

	// Press down again
	result, _ = updated.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	updated = result.(Model)
	if updated.fileCompletionSelected != 2 {
		t.Errorf("expected selected 2 after second down, got %d", updated.fileCompletionSelected)
	}

	// Press down at end — should stay at 2
	result, _ = updated.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	updated = result.(Model)
	if updated.fileCompletionSelected != 2 {
		t.Errorf("expected selected to stay at 2 at end, got %d", updated.fileCompletionSelected)
	}
}

func TestFileCompletionNavigateUp(t *testing.T) {
	m := newTestModel()
	m.overlay = overlayFileCompletion
	m.fileCompletionItems = []string{"a.go", "b.go", "c.go"}
	m.fileCompletionSelected = 2
	m.height = 40

	// Press up
	result, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	updated := result.(Model)
	if updated.fileCompletionSelected != 1 {
		t.Errorf("expected selected 1 after up, got %d", updated.fileCompletionSelected)
	}

	// At top — should stay at 0
	result, _ = updated.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	updated = result.(Model)
	result, _ = updated.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	updated = result.(Model)
	if updated.fileCompletionSelected != 0 {
		t.Errorf("expected selected to stay at 0 at top, got %d", updated.fileCompletionSelected)
	}
}

func TestFileCompletionEscape(t *testing.T) {
	m := newTestModel()
	m.overlay = overlayFileCompletion
	m.fileCompletionItems = []string{"a.go", "b.go"}
	m.fileCompletionSelected = 0
	m.height = 40

	result, _ := m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	updated := result.(Model)
	if updated.overlay != overlayNone {
		t.Errorf("expected overlay to be dismissed on esc, got %d", updated.overlay)
	}
}

func TestRenderFileCompletion(t *testing.T) {
	m := newTestModel()
	m.overlay = overlayFileCompletion
	m.fileCompletionItems = []string{"main.go", "util.go", "test_helper.go"}
	m.fileCompletionSelected = 1
	m.width = 80
	m.height = 40

	out := m.renderFileCompletion()
	if !strings.Contains(out, "Select file to attach") {
		t.Error("expected title in file completion overlay")
	}
	if !strings.Contains(out, "main.go") {
		t.Error("expected first item in output")
	}
	if !strings.Contains(out, "util.go") {
		t.Error("expected second item in output")
	}
	if !strings.Contains(out, ">") {
		t.Error("expected selection marker '>' in output")
	}
}

// ── Session picker overlay tests ─────────────────────────────────────────

func TestSessionPickerNavigateDown(t *testing.T) {
	m := newTestModel()
	m.overlay = overlaySessionPicker
	m.sessionPickerItems = []sessionPickerItem{
		{id: "s1", title: "Session 1", cost: 0.01},
		{id: "s2", title: "Session 2", cost: 0.02},
		{id: "s3", title: "Session 3", cost: 0.03},
	}
	m.sessionPickerSelected = 0
	m.height = 40

	result, _ := m.Update(tea.KeyMsg{Type: tea.KeyDown})
	updated := result.(Model)
	if updated.sessionPickerSelected != 1 {
		t.Errorf("expected selected 1 after down, got %d", updated.sessionPickerSelected)
	}
}

func TestSessionPickerNavigateUp(t *testing.T) {
	m := newTestModel()
	m.overlay = overlaySessionPicker
	m.sessionPickerItems = []sessionPickerItem{
		{id: "s1", title: "Session 1", cost: 0.01},
		{id: "s2", title: "Session 2", cost: 0.02},
	}
	m.sessionPickerSelected = 1
	m.height = 40

	result, _ := m.Update(tea.KeyMsg{Type: tea.KeyUp})
	updated := result.(Model)
	if updated.sessionPickerSelected != 0 {
		t.Errorf("expected selected 0 after up, got %d", updated.sessionPickerSelected)
	}
}

func TestSessionPickerBoundsDown(t *testing.T) {
	m := newTestModel()
	m.overlay = overlaySessionPicker
	m.sessionPickerItems = []sessionPickerItem{
		{id: "s1", title: "Session 1"},
	}
	m.sessionPickerSelected = 0
	m.height = 40

	// Down on single item — should stay at 0
	result, _ := m.Update(tea.KeyMsg{Type: tea.KeyDown})
	updated := result.(Model)
	if updated.sessionPickerSelected != 0 {
		t.Errorf("expected selected to stay at 0, got %d", updated.sessionPickerSelected)
	}
}

func TestSessionPickerBoundsUp(t *testing.T) {
	m := newTestModel()
	m.overlay = overlaySessionPicker
	m.sessionPickerItems = []sessionPickerItem{
		{id: "s1", title: "Session 1"},
	}
	m.sessionPickerSelected = 0
	m.height = 40

	// Up at top — should stay at 0
	result, _ := m.Update(tea.KeyMsg{Type: tea.KeyUp})
	updated := result.(Model)
	if updated.sessionPickerSelected != 0 {
		t.Errorf("expected selected to stay at 0, got %d", updated.sessionPickerSelected)
	}
}

func TestSessionPickerEscape(t *testing.T) {
	m := newTestModel()
	m.overlay = overlaySessionPicker
	m.sessionPickerItems = []sessionPickerItem{
		{id: "s1", title: "Session 1"},
	}
	m.height = 40

	result, _ := m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	updated := result.(Model)
	if updated.overlay != overlayNone {
		t.Errorf("expected overlay to be dismissed on esc, got %d", updated.overlay)
	}
}

func TestSessionPickerQuit(t *testing.T) {
	m := newTestModel()
	m.overlay = overlaySessionPicker
	m.sessionPickerItems = []sessionPickerItem{
		{id: "s1", title: "Session 1"},
	}
	m.height = 40

	result, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'q'}})
	updated := result.(Model)
	if updated.overlay != overlayNone {
		t.Errorf("expected overlay to be dismissed on q, got %d", updated.overlay)
	}
}

func TestRenderSessionPicker(t *testing.T) {
	m := newTestModel()
	m.overlay = overlaySessionPicker
	m.sessionPickerItems = []sessionPickerItem{
		{id: "abc123", title: "My Session", cost: 0.05},
		{id: "def456", title: "Another", cost: 0.10},
	}
	m.sessionPickerSelected = 0
	m.width = 80
	m.height = 40

	out := m.renderSessionPicker()
	if !strings.Contains(out, "Sessions") {
		t.Error("expected Sessions title in session picker")
	}
	if !strings.Contains(out, "My Session") {
		t.Error("expected first session title in output")
	}
	if !strings.Contains(out, "Another") {
		t.Error("expected second session title in output")
	}
	if !strings.Contains(out, ">") {
		t.Error("expected selection marker in output")
	}
}

// ── appendToolResults tests ──────────────────────────────────────────────

func TestAppendToolResultsBasic(t *testing.T) {
	m := newTestModel()

	parts := []message.ContentPart{
		message.ToolCall{
			ID:       "call-1",
			Name:     "bash",
			Input:    `{"command": "ls -la"}`,
			Finished: true,
		},
		message.ToolResult{
			ToolCallID: "call-1",
			Name:       "bash",
			Content:    "file1.go\nfile2.go\n",
			IsError:    false,
		},
	}

	m.appendToolResults(parts)

	// Should have 2 entries: tool header + tool_result
	toolEntries := 0
	toolResultEntries := 0
	for _, entry := range m.chat {
		if entry.role == "tool" {
			toolEntries++
		}
		if entry.role == "tool_result" {
			toolResultEntries++
		}
	}
	if toolEntries != 1 {
		t.Errorf("expected 1 tool entry, got %d", toolEntries)
	}
	if toolResultEntries != 1 {
		t.Errorf("expected 1 tool_result entry, got %d", toolResultEntries)
	}
}

func TestAppendToolResultsError(t *testing.T) {
	m := newTestModel()

	parts := []message.ContentPart{
		message.ToolCall{
			ID:       "call-err",
			Name:     "write_file",
			Input:    `{"path": "/nope"}`,
			Finished: true,
		},
		message.ToolResult{
			ToolCallID: "call-err",
			Name:       "write_file",
			Content:    "permission denied",
			IsError:    true,
		},
	}

	m.appendToolResults(parts)

	// The tool_result entry should exist and contain the error content
	found := false
	for _, entry := range m.chat {
		if entry.role == "tool_result" {
			found = true
			if !strings.Contains(entry.content, "permission denied") {
				t.Errorf("expected error content in tool_result entry, got %q", entry.content)
			}
			if !strings.Contains(entry.content, "write_file") {
				t.Errorf("expected tool name in tool_result entry, got %q", entry.content)
			}
		}
	}
	if !found {
		t.Error("expected a tool_result entry for error result")
	}
}

func TestAppendToolResultsMultipleCalls(t *testing.T) {
	m := newTestModel()

	parts := []message.ContentPart{
		message.ToolCall{
			ID:       "c1",
			Name:     "read_file",
			Input:    `{"path": "go.mod"}`,
			Finished: true,
		},
		message.ToolCall{
			ID:       "c2",
			Name:     "bash",
			Input:    `{"command": "go test"}`,
			Finished: true,
		},
		message.ToolResult{
			ToolCallID: "c1",
			Name:       "read_file",
			Content:    "module example.com/test",
			IsError:    false,
		},
		message.ToolResult{
			ToolCallID: "c2",
			Name:       "bash",
			Content:    "PASS",
			IsError:    false,
		},
	}

	m.appendToolResults(parts)

	toolEntries := 0
	toolResultEntries := 0
	for _, entry := range m.chat {
		if entry.role == "tool" {
			toolEntries++
		}
		if entry.role == "tool_result" {
			toolResultEntries++
		}
	}
	if toolEntries != 2 {
		t.Errorf("expected 2 tool entries, got %d", toolEntries)
	}
	if toolResultEntries != 2 {
		t.Errorf("expected 2 tool_result entries, got %d", toolResultEntries)
	}
}

func TestAppendToolResultsUnfinishedCall(t *testing.T) {
	m := newTestModel()

	parts := []message.ContentPart{
		message.ToolCall{
			ID:       "c-unfin",
			Name:     "bash",
			Input:    `{"command": "sleep 10"}`,
			Finished: false, // not finished — should not show header
		},
		message.ToolResult{
			ToolCallID: "c-unfin",
			Content:    "result data",
		},
	}

	m.appendToolResults(parts)

	// Unfinished calls should not create tool header entries
	toolEntries := 0
	for _, entry := range m.chat {
		if entry.role == "tool" {
			toolEntries++
		}
	}
	if toolEntries != 0 {
		t.Errorf("expected 0 tool entries for unfinished call, got %d", toolEntries)
	}
}

func TestAppendToolResultsTruncatesLongContent(t *testing.T) {
	m := newTestModel()

	longContent := strings.Repeat("x", 3000)
	parts := []message.ContentPart{
		message.ToolCall{
			ID:       "c-long",
			Name:     "bash",
			Finished: true,
		},
		message.ToolResult{
			ToolCallID: "c-long",
			Content:    longContent,
		},
	}

	m.appendToolResults(parts)

	for _, entry := range m.chat {
		if entry.role == "tool_result" {
			if strings.Contains(entry.content, strings.Repeat("x", 2500)) {
				t.Error("tool result content should be truncated to 2000 chars")
			}
			if !strings.Contains(entry.content, "truncated") {
				t.Error("expected truncation indicator in long tool result")
			}
		}
	}
}

func TestAppendToolResultsNoCallName(t *testing.T) {
	// When a ToolResult has no matching ToolCall, it should fall back to its
	// own Name field or "tool"
	m := newTestModel()

	parts := []message.ContentPart{
		message.ToolResult{
			ToolCallID: "orphan-id",
			Name:       "custom_tool",
			Content:    "result",
		},
	}

	m.appendToolResults(parts)

	found := false
	for _, entry := range m.chat {
		if entry.role == "tool_result" {
			found = true
			if !strings.Contains(entry.content, "custom_tool") {
				t.Errorf("expected fallback name 'custom_tool', got %q", entry.content)
			}
		}
	}
	if !found {
		t.Error("expected a tool_result entry")
	}
}

func TestAppendToolResultsFallbackToGenericName(t *testing.T) {
	// When ToolResult has no matching call and no Name, it should use "tool"
	m := newTestModel()

	parts := []message.ContentPart{
		message.ToolResult{
			ToolCallID: "orphan-id-2",
			Name:       "",
			Content:    "some output",
		},
	}

	m.appendToolResults(parts)

	found := false
	for _, entry := range m.chat {
		if entry.role == "tool_result" {
			found = true
			if !strings.Contains(entry.content, "tool") {
				t.Errorf("expected fallback name 'tool', got %q", entry.content)
			}
		}
	}
	if !found {
		t.Error("expected a tool_result entry")
	}
}

// ── Overlay mode tests ───────────────────────────────────────────────────

func TestOverlayModeConstants(t *testing.T) {
	// Verify constants are distinct
	modes := []overlayMode{overlayNone, overlayPermission, overlaySessionPicker, overlayFileCompletion}
	seen := make(map[overlayMode]bool)
	for _, mode := range modes {
		if seen[mode] {
			t.Errorf("duplicate overlay mode value: %d", mode)
		}
		seen[mode] = true
	}
}

// ── Chat helpers tests ───────────────────────────────────────────────────

func TestAppendUserEntry(t *testing.T) {
	m := newTestModel()
	m.appendUser("hello")
	if len(m.chat) != 1 {
		t.Fatalf("expected 1 chat entry, got %d", len(m.chat))
	}
	if m.chat[0].role != "user" || m.chat[0].content != "hello" {
		t.Errorf("unexpected entry: %+v", m.chat[0])
	}
	if m.renderedCacheValid {
		t.Error("cache should be invalidated after append")
	}
}

func TestAppendAssistantEntry(t *testing.T) {
	m := newTestModel()
	m.appendAssistant("response")
	if len(m.chat) != 1 {
		t.Fatalf("expected 1 chat entry, got %d", len(m.chat))
	}
	if m.chat[0].role != "assistant" || m.chat[0].content != "response" {
		t.Errorf("unexpected entry: %+v", m.chat[0])
	}
}

func TestAppendSystemEntry(t *testing.T) {
	m := newTestModel()
	m.appendSystem("info")
	if len(m.chat) != 1 {
		t.Fatalf("expected 1 chat entry, got %d", len(m.chat))
	}
	if m.chat[0].role != "system" {
		t.Errorf("expected system role, got %s", m.chat[0].role)
	}
}

func TestAppendErrorEntry(t *testing.T) {
	m := newTestModel()
	m.appendError("oops")
	if len(m.chat) != 1 {
		t.Fatalf("expected 1 chat entry, got %d", len(m.chat))
	}
	if m.chat[0].role != "error" {
		t.Errorf("expected error role, got %s", m.chat[0].role)
	}
}

func TestAppendReasoningEntry(t *testing.T) {
	m := newTestModel()
	m.appendReasoning("thinking about this...")
	if len(m.chat) != 1 {
		t.Fatalf("expected 1 chat entry, got %d", len(m.chat))
	}
	if m.chat[0].role != "reasoning" {
		t.Errorf("expected reasoning role, got %s", m.chat[0].role)
	}
}

func TestAppendToolResultEntry(t *testing.T) {
	m := newTestModel()
	m.appendToolResult("bash", "file1.txt", false)
	if len(m.chat) != 1 {
		t.Fatalf("expected 1 chat entry, got %d", len(m.chat))
	}
	if m.chat[0].role != "tool_result" {
		t.Errorf("expected tool_result role, got %s", m.chat[0].role)
	}
	if !strings.Contains(m.chat[0].content, "bash") {
		t.Error("expected tool name in content")
	}
	if !strings.Contains(m.chat[0].content, "file1.txt") {
		t.Error("expected tool output in content")
	}
}

func TestAppendToolResultErrorEntry(t *testing.T) {
	m := newTestModel()
	m.appendToolResult("read_file", "not found", true)
	if len(m.chat) != 1 {
		t.Fatalf("expected 1 chat entry, got %d", len(m.chat))
	}
	if m.chat[0].role != "tool_result" {
		t.Errorf("expected tool_result role, got %s", m.chat[0].role)
	}
	if !strings.Contains(m.chat[0].content, "not found") {
		t.Error("expected error text in content")
	}
}

func TestCacheInvalidation(t *testing.T) {
	m := newTestModel()
	m.viewport = newVP(80, 20)

	// Build cache
	m.appendUser("hi")
	m.refreshViewport()
	if !m.renderedCacheValid {
		t.Error("cache should be valid after refreshViewport")
	}

	// Invalidate
	m.appendAssistant("hello")
	if m.renderedCacheValid {
		t.Error("cache should be invalidated after new entry")
	}

	// Rebuild
	m.refreshViewport()
	if !m.renderedCacheValid {
		t.Error("cache should be valid again after refreshViewport")
	}
}

// ── renderChatEntry tests ────────────────────────────────────────────────

func TestRenderChatEntryUser(t *testing.T) {
	m := newTestModel()
	out := m.renderChatEntry(chatEntry{role: "user", content: "testing"})
	if !strings.Contains(out, "You:") {
		t.Error("expected 'You:' prefix for user entry")
	}
	if !strings.Contains(out, "testing") {
		t.Error("expected content in output")
	}
}

func TestRenderChatEntryAssistant(t *testing.T) {
	m := newTestModel()
	out := m.renderChatEntry(chatEntry{role: "assistant", content: "Hello world"})
	if !strings.Contains(out, "Hello world") {
		t.Error("expected assistant content in output")
	}
}

func TestRenderChatEntryReasoning(t *testing.T) {
	m := newTestModel()
	out := m.renderChatEntry(chatEntry{role: "reasoning", content: "thinking step"})
	if !strings.Contains(out, "Thinking:") {
		t.Error("expected 'Thinking:' prefix for reasoning entry")
	}
	if !strings.Contains(out, "thinking step") {
		t.Error("expected reasoning content")
	}
}

func TestRenderChatEntryReasoningTruncation(t *testing.T) {
	m := newTestModel()
	longReasoning := strings.Repeat("a", 600)
	out := m.renderChatEntry(chatEntry{role: "reasoning", content: longReasoning})
	if !strings.Contains(out, "...") {
		t.Error("expected truncation indicator for long reasoning")
	}
}

func TestRenderChatEntryToolResult(t *testing.T) {
	m := newTestModel()
	out := m.renderChatEntry(chatEntry{role: "tool_result", content: "[bash] output data"})
	if !strings.Contains(out, "output data") {
		t.Error("expected tool result content")
	}
}

func TestRenderChatEntryDefaultRole(t *testing.T) {
	m := newTestModel()
	out := m.renderChatEntry(chatEntry{role: "unknown", content: "raw text"})
	if out != "raw text" {
		t.Errorf("expected raw content for unknown role, got %q", out)
	}
}

// ── Streaming reasoning in viewport ──────────────────────────────────────

func TestRefreshViewportStreamingReasoning(t *testing.T) {
	m := newTestModel()
	m.viewport = newVP(80, 40)
	m.busy = true
	m.streamingReasoning = "considering options..."

	m.refreshViewport()
	content := m.viewport.View()
	if !strings.Contains(content, "Thinking:") {
		t.Error("expected 'Thinking:' in viewport when streaming reasoning")
	}
	if !strings.Contains(content, "considering options") {
		t.Error("expected reasoning content in viewport")
	}
}

func TestRefreshViewportStreamingReasoningAndContent(t *testing.T) {
	m := newTestModel()
	m.viewport = newVP(80, 40)
	m.busy = true
	m.streamingReasoning = "step 1 done"
	m.streamingContent = "Here is my answer"

	m.refreshViewport()
	content := m.viewport.View()
	if !strings.Contains(content, "step 1 done") {
		t.Error("expected reasoning in viewport")
	}
	if !strings.Contains(content, "Here is my answer") {
		t.Error("expected streaming content in viewport")
	}
}

// ── Permission dialog overlay tests ──────────────────────────────────────

func TestPermissionDialogBlocking(t *testing.T) {
	// When overlay is permission and a non-permission key is pressed, it
	// should be swallowed (return m, nil)
	m := newTestModel()
	m.overlay = overlayPermission
	req := permission.PermissionRequest{
		ToolName: "bash",
		Action:   "execute",
	}
	m.pendingPerm = &req

	// A random key should be ignored
	result, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'x'}})
	updated := result.(Model)
	if updated.overlay != overlayPermission {
		t.Error("overlay should remain visible for non-permission keys")
	}
	if cmd != nil {
		t.Error("no command should be returned for invalid permission key")
	}
}

// ── newTestModel helper ──────────────────────────────────────────────────

// newTestModel creates a minimal Model suitable for testing without an
// App instance. It is only useful for testing functions that do not
// require a live App (chat helpers, overlays, rendering).
func newTestModel() Model {
	return Model{
		chat:  []chatEntry{},
		width: 80,
	}
}
