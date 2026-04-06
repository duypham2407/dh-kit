// Package tui implements the interactive terminal UI for dh.
package tui

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/alecthomas/chroma/v2"
	chromafmt "github.com/alecthomas/chroma/v2/formatters"
	"github.com/alecthomas/chroma/v2/lexers"
	"github.com/alecthomas/chroma/v2/styles"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/duypham93/dh/packages/opencode-core/internal/app"
	"github.com/duypham93/dh/packages/opencode-core/internal/clibundle"
	"github.com/duypham93/dh/packages/opencode-core/internal/completions"
	"github.com/duypham93/dh/packages/opencode-core/internal/config"
	"github.com/duypham93/dh/packages/opencode-core/internal/llm/models"
	"github.com/duypham93/dh/packages/opencode-core/internal/message"
	"github.com/duypham93/dh/packages/opencode-core/internal/permission"
	"github.com/duypham93/dh/packages/opencode-core/internal/pubsub"
	"github.com/duypham93/dh/packages/opencode-core/internal/version"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/util"
)

// ── Messages ────────────────────────────────────────────────────────────

// agentDoneMsg is sent when the agent finishes a full generation.
type agentDoneMsg struct {
	content   string
	reasoning string // thinking/reasoning content
	err       error
	parts     []message.ContentPart // all message parts for tool result display
}

// messageUpdatedMsg carries an incremental message update from the message
// service's pubsub broker, allowing the TUI to display streaming content.
type messageUpdatedMsg struct {
	sessionID string
	role      message.MessageRole
	content   string // full text content so far
	reasoning string // reasoning content so far
}

// sessionCreatedMsg is sent when the initial session is ready.
type sessionCreatedMsg struct {
	sessionID string
	err       error
}

// permissionRequestMsg is sent when the permission service publishes a new request.
type permissionRequestMsg struct {
	req permission.PermissionRequest
}

// cliExecDoneMsg is sent when a delegated CLI command (doctor/index) completes.
type cliExecDoneMsg struct {
	cmd    string
	stdout string
	stderr string
}

// summarizeDoneMsg is sent when the summarize operation completes.
type summarizeDoneMsg struct {
	err error
}

// toolActivityMsg shows which tool the agent is currently invoking.
type toolActivityMsg struct {
	sessionID string
	toolName  string
}

// fileCompletionMsg carries file completion results back to the TUI.
type fileCompletionMsg struct {
	matches []string
	err     error
}

// ── Permission dialog state ──────────────────────────────────────────────

type permDialogState int

const (
	permDialogHidden permDialogState = iota
	permDialogVisible
)

// ── Styles ──────────────────────────────────────────────────────────────

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#7D56F4"))

	statusBarStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("#333333")).
			Foreground(lipgloss.Color("#AAAAAA")).
			Padding(0, 1)

	userMsgStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#7D56F4")).
			Bold(true)

	assistantMsgStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#CCCCCC"))

	systemMsgStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#666666")).
			Italic(true)

	errorMsgStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF5555")).
			Bold(true)

	toolMsgStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#888888")).
			Italic(true)

	inputBorderStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("#7D56F4")).
				Padding(0, 1)

	permDialogStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#FFB86C")).
			Padding(1, 2).
			Background(lipgloss.Color("#1A1A2E"))

	permTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FFB86C"))

	permKeyStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#7D56F4")).
			Bold(true)

	sessionItemStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#AAAAAA"))

	sessionActiveStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#50FA7B")).
				Bold(true)

	costStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F1FA8C"))

	reasoningStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6272A4")).
			Italic(true)

	toolResultStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#8BE9FD"))

	toolResultErrorStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#FF5555"))

	toolCallHeaderStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#BD93F9")).
				Bold(true)

	sessionPickerTitleStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("#50FA7B"))

	sessionPickerItemStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#CCCCCC"))

	sessionPickerSelectedStyle = lipgloss.NewStyle().
					Foreground(lipgloss.Color("#50FA7B")).
					Bold(true)

	fileCompletionStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#F1FA8C"))
)

// ── Overlay mode ────────────────────────────────────────────────────────

type overlayMode int

const (
	overlayNone overlayMode = iota
	overlayPermission
	overlaySessionPicker
	overlayFileCompletion
)

// ── Chat entry ──────────────────────────────────────────────────────────

type chatEntry struct {
	role    string // "user", "assistant", "system", "error", "tool", "reasoning", "tool_result"
	content string
}

// ── Model ───────────────────────────────────────────────────────────────

// Model is the root bubbletea model for the dh TUI.
type Model struct {
	app *app.App
	ctx context.Context

	// UI components
	viewport viewport.Model
	input    textarea.Model

	// State
	chat      []chatEntry
	sessionID string
	busy      bool
	width     int
	height    int
	ready     bool

	// Streaming state: partial assistant message during agent run
	streamingContent   string
	streamingReasoning string    // reasoning/thinking content during streaming
	lastStreamRender   time.Time // throttle rendering during rapid streaming
	activeTool         string    // name of tool currently being invoked

	// Overlay state (replaces simple permDialog)
	overlay     overlayMode
	pendingPerm *permission.PermissionRequest

	// Session picker state
	sessionPickerItems    []sessionPickerItem
	sessionPickerSelected int

	// File completion state
	fileCompletionItems    []string
	fileCompletionSelected int
	fileCompletionQuery    string

	// Pending attachments for the next prompt
	attachments []message.Attachment

	// Slash command completion state
	completionIndex int    // current position in filtered completions
	completionBase  string // the prefix text when tab was first pressed

	// Scrollback cache: pre-rendered chat content
	renderedCacheValid bool
	renderedCacheLines string

	// Persistent subscription channels — created once, reused on re-arm
	permSub <-chan pubsub.Event[permission.PermissionRequest]
	msgSub  <-chan pubsub.Event[message.Message]
}

type sessionPickerItem struct {
	id    string
	title string
	cost  float64
}

// New creates a new TUI model wired to the given App.
func New(a *app.App, ctx context.Context) Model {
	ta := textarea.New()
	ta.Placeholder = "Type a message or /help for commands..."
	ta.CharLimit = 10000
	ta.SetHeight(3)
	ta.Focus()
	ta.ShowLineNumbers = false

	vp := viewport.New(80, 20)

	m := Model{
		app:      a,
		ctx:      ctx,
		viewport: vp,
		input:    ta,
		chat:     []chatEntry{},
	}

	// Create persistent subscription channels (one each, reused across re-arms)
	if a != nil {
		m.permSub = a.Permissions.Subscribe(ctx)
		m.msgSub = a.Messages.Subscribe(ctx)
	}

	return m
}

// ── tea.Model interface ─────────────────────────────────────────────────

func (m Model) Init() tea.Cmd {
	return tea.Batch(
		textarea.Blink,
		m.doCreateSession(),
		m.listenPermissions(),
		m.listenMessageUpdates(),
	)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	// ── Key handling ──────────────────────────────────────────────────
	case tea.KeyMsg:
		// Permission dialog
		if m.overlay == overlayPermission && m.pendingPerm != nil {
			switch msg.String() {
			case "y", "Y":
				m.app.Permissions.Grant(*m.pendingPerm)
				m.appendSystem(fmt.Sprintf("Granted: %s %s", m.pendingPerm.ToolName, m.pendingPerm.Action))
				m.pendingPerm = nil
				m.overlay = overlayNone
				m.refreshViewport()
				return m, m.listenPermissions()
			case "a", "A":
				m.app.Permissions.GrantPersistant(*m.pendingPerm)
				m.appendSystem(fmt.Sprintf("Granted (persistent): %s %s", m.pendingPerm.ToolName, m.pendingPerm.Action))
				m.pendingPerm = nil
				m.overlay = overlayNone
				m.refreshViewport()
				return m, m.listenPermissions()
			case "n", "N", "esc":
				m.app.Permissions.Deny(*m.pendingPerm)
				m.appendSystem(fmt.Sprintf("Denied: %s %s", m.pendingPerm.ToolName, m.pendingPerm.Action))
				m.pendingPerm = nil
				m.overlay = overlayNone
				m.refreshViewport()
				return m, m.listenPermissions()
			}
			return m, nil
		}

		// Session picker overlay
		if m.overlay == overlaySessionPicker {
			switch msg.String() {
			case "up", "k":
				if m.sessionPickerSelected > 0 {
					m.sessionPickerSelected--
				}
				return m, nil
			case "down", "j":
				if m.sessionPickerSelected < len(m.sessionPickerItems)-1 {
					m.sessionPickerSelected++
				}
				return m, nil
			case "enter":
				if len(m.sessionPickerItems) > 0 {
					item := m.sessionPickerItems[m.sessionPickerSelected]
					m.overlay = overlayNone
					return m.handleSessionSwitch(item.id)
				}
				m.overlay = overlayNone
				return m, nil
			case "esc", "q":
				m.overlay = overlayNone
				m.refreshViewport()
				return m, nil
			}
			return m, nil
		}

		// File completion overlay
		if m.overlay == overlayFileCompletion {
			switch msg.String() {
			case "up", "k":
				if m.fileCompletionSelected > 0 {
					m.fileCompletionSelected--
				}
				return m, nil
			case "down", "j":
				if m.fileCompletionSelected < len(m.fileCompletionItems)-1 {
					m.fileCompletionSelected++
				}
				return m, nil
			case "enter":
				if len(m.fileCompletionItems) > 0 {
					selected := m.fileCompletionItems[m.fileCompletionSelected]
					m.overlay = overlayNone
					return m.handleAttach(selected)
				}
				m.overlay = overlayNone
				return m, nil
			case "esc":
				m.overlay = overlayNone
				m.refreshViewport()
				return m, nil
			}
			return m, nil
		}

		if m.busy {
			if msg.String() == "ctrl+c" || msg.String() == "esc" {
				m.app.CoderAgent.Cancel(m.sessionID)
				m.busy = false
				m.streamingContent = ""
				m.streamingReasoning = ""
				m.activeTool = ""
				m.appendSystem("Cancelled.")
				m.refreshViewport()
				return m, nil
			}
			return m, nil
		}

		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit

		case "alt+enter":
			m.input.InsertString("\n")
			return m, nil

		case "tab":
			return m.handleTabCompletion()

		case "enter":
			text := strings.TrimSpace(m.input.Value())
			if text == "" {
				return m, nil
			}
			m.input.Reset()
			m.completionIndex = 0
			m.completionBase = ""
			return m.handleInput(text)
		default:
			m.completionIndex = 0
			m.completionBase = ""
		}

	// ── Window resize ──────────────────────────────────────────────────
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.recalcLayout()
		m.ready = true
		m.invalidateCache()
		m.refreshViewport()
		return m, nil

	// ── Session created ────────────────────────────────────────────────
	case sessionCreatedMsg:
		if msg.err != nil {
			m.appendError(fmt.Sprintf("Failed to create session: %v", msg.err))
		} else {
			m.sessionID = msg.sessionID
			m.appendSystem("Session ready. Type a message or /help for commands.")
		}
		m.refreshViewport()
		return m, nil

	// ── Agent done (final result) ──────────────────────────────────────
	case agentDoneMsg:
		m.busy = false
		m.activeTool = ""
		if msg.err != nil {
			m.appendError(fmt.Sprintf("Error: %v", msg.err))
		} else {
			// Append reasoning if present
			if msg.reasoning != "" {
				m.appendReasoning(msg.reasoning)
			}

			// Append tool call results
			if msg.parts != nil {
				m.appendToolResults(msg.parts)
			}

			if msg.content != "" {
				if m.streamingContent != msg.content {
					m.appendAssistant(msg.content)
				} else {
					m.appendAssistant(m.streamingContent)
				}
			}
		}
		m.streamingContent = ""
		m.streamingReasoning = ""
		m.refreshViewport()
		return m, nil

	// ── Message updated (streaming from message broker) ───────────────
	case messageUpdatedMsg:
		if msg.sessionID == m.sessionID && msg.role == message.Assistant && m.busy {
			now := time.Now()
			m.streamingContent = msg.content
			if msg.reasoning != "" {
				m.streamingReasoning = msg.reasoning
			}
			if now.Sub(m.lastStreamRender) > 50*time.Millisecond {
				m.lastStreamRender = now
				m.refreshViewport()
			}
		}
		return m, m.listenMessageUpdates()

	// ── Permission request ─────────────────────────────────────────────
	case permissionRequestMsg:
		m.pendingPerm = &msg.req
		m.overlay = overlayPermission
		m.refreshViewport()
		return m, nil

	// ── Tool activity ──────────────────────────────────────────────────
	case toolActivityMsg:
		if msg.sessionID == m.sessionID && m.busy {
			m.activeTool = msg.toolName
			m.refreshViewport()
		}
		return m, m.listenMessageUpdates()

	// ── CLI exec done (doctor/index) ───────────────────────────────────
	case cliExecDoneMsg:
		m.busy = false
		combined := strings.TrimSpace(msg.stdout + msg.stderr)
		if combined == "" {
			combined = fmt.Sprintf("%s completed.", msg.cmd)
		}
		m.appendSystem(fmt.Sprintf("[%s]\n%s", msg.cmd, combined))
		m.refreshViewport()
		return m, nil

	// ── Summarize done ─────────────────────────────────────────────────
	case summarizeDoneMsg:
		m.busy = false
		if msg.err != nil {
			m.appendError(fmt.Sprintf("Summarize failed: %v", msg.err))
		} else {
			m.appendSystem("Context summarized. Conversation compressed for continued use.")
		}
		m.refreshViewport()
		return m, nil

	// ── File completion results ────────────────────────────────────────
	case fileCompletionMsg:
		if msg.err != nil {
			m.appendError(fmt.Sprintf("File search failed: %v", msg.err))
			m.refreshViewport()
			return m, nil
		}
		if len(msg.matches) == 0 {
			m.appendSystem("No matching files found.")
			m.refreshViewport()
			return m, nil
		}
		if len(msg.matches) == 1 {
			// Auto-select single match
			return m.handleAttach(msg.matches[0])
		}
		m.fileCompletionItems = msg.matches
		m.fileCompletionSelected = 0
		m.overlay = overlayFileCompletion
		return m, nil
	}

	// Forward to textarea when not busy and no overlay
	if !m.busy && m.overlay == overlayNone {
		var inputCmd tea.Cmd
		m.input, inputCmd = m.input.Update(msg)
		cmds = append(cmds, inputCmd)
	}

	// Forward to viewport (scrolling always allowed)
	var vpCmd tea.Cmd
	m.viewport, vpCmd = m.viewport.Update(msg)
	cmds = append(cmds, vpCmd)

	return m, tea.Batch(cmds...)
}

func (m Model) View() string {
	if !m.ready {
		return "\n  Initializing dh...\n"
	}

	// Overlay: permission dialog
	if m.overlay == overlayPermission && m.pendingPerm != nil {
		return m.renderPermDialog()
	}

	// Overlay: session picker
	if m.overlay == overlaySessionPicker {
		return m.renderSessionPicker()
	}

	// Overlay: file completion
	if m.overlay == overlayFileCompletion {
		return m.renderFileCompletion()
	}

	chatView := m.viewport.View()

	inputView := inputBorderStyle.Width(m.width - 4).Render(m.input.View())
	if m.busy {
		busyText := "Working... (Ctrl+C to cancel)"
		if m.activeTool != "" {
			busyText = fmt.Sprintf("Running %s... (Ctrl+C to cancel)", m.activeTool)
		}
		inputView = inputBorderStyle.Width(m.width - 4).
			BorderForeground(lipgloss.Color("#666666")).
			Render(systemMsgStyle.Render(busyText))
	}

	statusBar := m.renderStatusBar()

	return lipgloss.JoinVertical(
		lipgloss.Left,
		chatView,
		inputView,
		statusBar,
	)
}

// ── Permission dialog ────────────────────────────────────────────────────

func (m *Model) renderPermDialog() string {
	req := m.pendingPerm
	title := permTitleStyle.Render("Permission Request")
	body := fmt.Sprintf(
		"Tool:   %s\nAction: %s\nPath:   %s\n\n%s",
		req.ToolName, req.Action, req.Path, req.Description,
	)
	keys := permKeyStyle.Render("[Y]") + " Grant  " +
		permKeyStyle.Render("[A]") + " Grant Persistent  " +
		permKeyStyle.Render("[N]") + " Deny"

	dialogWidth := m.width - 8
	if dialogWidth < 40 {
		dialogWidth = 40
	}

	dialog := permDialogStyle.Width(dialogWidth).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			title,
			"",
			body,
			"",
			keys,
		),
	)

	// Center vertically
	topPad := (m.height - lipgloss.Height(dialog) - 2) / 2
	if topPad < 0 {
		topPad = 0
	}
	return strings.Repeat("\n", topPad) + dialog + "\n" + m.renderStatusBar()
}

// ── Session picker overlay ──────────────────────────────────────────────

func (m *Model) renderSessionPicker() string {
	title := sessionPickerTitleStyle.Render("Sessions")
	hint := systemMsgStyle.Render("j/k or arrows to navigate, Enter to select, Esc to cancel")

	dialogWidth := m.width - 8
	if dialogWidth < 50 {
		dialogWidth = 50
	}

	var items strings.Builder
	maxVisible := m.height - 10
	if maxVisible < 5 {
		maxVisible = 5
	}

	startIdx := 0
	if m.sessionPickerSelected >= maxVisible {
		startIdx = m.sessionPickerSelected - maxVisible + 1
	}
	endIdx := startIdx + maxVisible
	if endIdx > len(m.sessionPickerItems) {
		endIdx = len(m.sessionPickerItems)
	}

	for i := startIdx; i < endIdx; i++ {
		item := m.sessionPickerItems[i]
		short := item.id
		if len(short) > 8 {
			short = short[:8]
		}
		itemTitle := item.title
		if len(itemTitle) > 40 {
			itemTitle = itemTitle[:40] + "..."
		}
		costStr := ""
		if item.cost > 0 {
			costStr = costStyle.Render(fmt.Sprintf(" $%.4f", item.cost))
		}

		marker := "  "
		style := sessionPickerItemStyle
		if i == m.sessionPickerSelected {
			marker = "> "
			style = sessionPickerSelectedStyle
		}
		if item.id == m.sessionID {
			marker = "* "
		}

		items.WriteString(style.Render(fmt.Sprintf("%s%s  %s%s", marker, short, itemTitle, costStr)) + "\n")
	}

	scrollInfo := ""
	if len(m.sessionPickerItems) > maxVisible {
		scrollInfo = systemMsgStyle.Render(fmt.Sprintf("  (%d of %d)", m.sessionPickerSelected+1, len(m.sessionPickerItems))) + "\n"
	}

	dialog := permDialogStyle.Width(dialogWidth).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			title,
			"",
			items.String(),
			scrollInfo,
			hint,
		),
	)

	topPad := (m.height - lipgloss.Height(dialog) - 2) / 2
	if topPad < 0 {
		topPad = 0
	}
	return strings.Repeat("\n", topPad) + dialog + "\n" + m.renderStatusBar()
}

// ── File completion overlay ─────────────────────────────────────────────

func (m *Model) renderFileCompletion() string {
	title := fileCompletionStyle.Render("Select file to attach")
	hint := systemMsgStyle.Render("j/k or arrows to navigate, Enter to select, Esc to cancel")

	dialogWidth := m.width - 8
	if dialogWidth < 50 {
		dialogWidth = 50
	}

	var items strings.Builder
	maxVisible := m.height - 10
	if maxVisible < 5 {
		maxVisible = 5
	}

	startIdx := 0
	if m.fileCompletionSelected >= maxVisible {
		startIdx = m.fileCompletionSelected - maxVisible + 1
	}
	endIdx := startIdx + maxVisible
	if endIdx > len(m.fileCompletionItems) {
		endIdx = len(m.fileCompletionItems)
	}

	for i := startIdx; i < endIdx; i++ {
		item := m.fileCompletionItems[i]
		marker := "  "
		style := sessionPickerItemStyle
		if i == m.fileCompletionSelected {
			marker = "> "
			style = sessionPickerSelectedStyle
		}
		items.WriteString(style.Render(marker+item) + "\n")
	}

	scrollInfo := ""
	if len(m.fileCompletionItems) > maxVisible {
		scrollInfo = systemMsgStyle.Render(fmt.Sprintf("  (%d of %d)", m.fileCompletionSelected+1, len(m.fileCompletionItems))) + "\n"
	}

	dialog := permDialogStyle.Width(dialogWidth).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			title,
			"",
			items.String(),
			scrollInfo,
			hint,
		),
	)

	topPad := (m.height - lipgloss.Height(dialog) - 2) / 2
	if topPad < 0 {
		topPad = 0
	}
	return strings.Repeat("\n", topPad) + dialog + "\n" + m.renderStatusBar()
}

// ── Layout ──────────────────────────────────────────────────────────────

func (m *Model) recalcLayout() {
	inputHeight := 5 // textarea (3) + border (2)
	statusHeight := 1
	chatHeight := m.height - inputHeight - statusHeight
	if chatHeight < 3 {
		chatHeight = 3
	}

	m.viewport.Width = m.width
	m.viewport.Height = chatHeight
	m.input.SetWidth(m.width - 6)
}

// ── Chat helpers ────────────────────────────────────────────────────────

func (m *Model) appendUser(text string) {
	m.chat = append(m.chat, chatEntry{role: "user", content: text})
	m.invalidateCache()
}

func (m *Model) appendAssistant(text string) {
	m.chat = append(m.chat, chatEntry{role: "assistant", content: text})
	m.invalidateCache()
}

func (m *Model) appendSystem(text string) {
	m.chat = append(m.chat, chatEntry{role: "system", content: text})
	m.invalidateCache()
}

func (m *Model) appendError(text string) {
	m.chat = append(m.chat, chatEntry{role: "error", content: text})
	m.invalidateCache()
}

func (m *Model) appendReasoning(text string) {
	m.chat = append(m.chat, chatEntry{role: "reasoning", content: text})
	m.invalidateCache()
}

func (m *Model) appendToolResult(toolName, content string, isError bool) {
	role := "tool_result"
	prefix := toolCallHeaderStyle.Render(fmt.Sprintf("[%s]", toolName))
	if isError {
		m.chat = append(m.chat, chatEntry{role: role, content: prefix + " " + toolResultErrorStyle.Render(content)})
	} else {
		m.chat = append(m.chat, chatEntry{role: role, content: prefix + " " + content})
	}
	m.invalidateCache()
}

// appendToolResults extracts tool call and result information from message parts
// and adds them to the chat display.
func (m *Model) appendToolResults(parts []message.ContentPart) {
	// Build a map of tool call IDs to names
	callNames := make(map[string]string)
	for _, part := range parts {
		if tc, ok := part.(message.ToolCall); ok {
			callNames[tc.ID] = tc.Name
		}
	}

	for _, part := range parts {
		switch p := part.(type) {
		case message.ToolCall:
			if p.Finished {
				// Show completed tool call header with input summary
				inputSummary := p.Input
				if len(inputSummary) > 200 {
					inputSummary = inputSummary[:200] + "..."
				}
				if inputSummary != "" {
					m.chat = append(m.chat, chatEntry{
						role:    "tool",
						content: toolCallHeaderStyle.Render(fmt.Sprintf("[%s]", p.Name)) + " " + toolMsgStyle.Render(inputSummary),
					})
				}
			}
		case message.ToolResult:
			name := callNames[p.ToolCallID]
			if name == "" {
				name = p.Name
			}
			if name == "" {
				name = "tool"
			}
			content := p.Content
			if len(content) > 2000 {
				content = content[:2000] + "\n... (truncated)"
			}
			m.appendToolResult(name, content, p.IsError)
		}
	}
	m.invalidateCache()
}

func (m *Model) invalidateCache() {
	m.renderedCacheValid = false
}

func (m *Model) refreshViewport() {
	// Use cached content for the historical chat entries
	var sb strings.Builder

	if m.renderedCacheValid {
		sb.WriteString(m.renderedCacheLines)
	} else {
		// Re-render all chat entries
		var cacheBuf strings.Builder
		for _, entry := range m.chat {
			line := m.renderChatEntry(entry)
			cacheBuf.WriteString(line)
			cacheBuf.WriteString("\n\n")
		}
		m.renderedCacheLines = cacheBuf.String()
		m.renderedCacheValid = true
		sb.WriteString(m.renderedCacheLines)
	}

	// Show streaming reasoning content
	if m.busy && m.streamingReasoning != "" {
		sb.WriteString(reasoningStyle.Render("Thinking: " + m.streamingReasoning))
		sb.WriteString("\n\n")
	}

	// Show streaming partial content
	if m.busy && m.streamingContent != "" {
		rendered := renderMarkdown(m.streamingContent, m.width)
		sb.WriteString(assistantMsgStyle.Render(rendered))
		sb.WriteString("\n")
	} else if m.busy {
		sb.WriteString(systemMsgStyle.Render("Thinking..."))
		sb.WriteString("\n")
	}

	m.viewport.SetContent(sb.String())
	m.viewport.GotoBottom()
}

func (m *Model) renderChatEntry(entry chatEntry) string {
	switch entry.role {
	case "user":
		return userMsgStyle.Render("You: ") + entry.content
	case "assistant":
		return assistantMsgStyle.Render(renderMarkdown(entry.content, m.width))
	case "system":
		return systemMsgStyle.Render(entry.content)
	case "error":
		return errorMsgStyle.Render(entry.content)
	case "tool":
		return toolMsgStyle.Render(entry.content)
	case "reasoning":
		// Collapse long reasoning with a prefix
		text := entry.content
		if len(text) > 500 {
			text = text[:500] + "..."
		}
		return reasoningStyle.Render("Thinking: " + text)
	case "tool_result":
		return toolResultStyle.Render(entry.content)
	default:
		return entry.content
	}
}

func (m *Model) renderStatusBar() string {
	left := titleStyle.Render("dh " + version.Version)

	// Model info
	var modelName string
	if m.app != nil {
		modelName = string(m.app.CoderAgent.Model().ID)
	}

	var parts []string
	if modelName != "" {
		parts = append(parts, modelName)
	}
	if m.sessionID != "" {
		short := m.sessionID
		if len(short) > 8 {
			short = short[:8]
		}
		parts = append(parts, short)
	}
	if m.busy {
		if m.activeTool != "" {
			parts = append(parts, toolMsgStyle.Render(m.activeTool))
		} else {
			parts = append(parts, "working...")
		}
	}
	if m.overlay == overlayPermission {
		parts = append(parts, "permission?")
	}

	right := strings.Join(parts, " | ")
	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right) - 2
	if gap < 0 {
		gap = 0
	}

	return statusBarStyle.Width(m.width).Render(
		left + strings.Repeat(" ", gap) + right,
	)
}

// ── Subscription commands ───────────────────────────────────────────────

func (m *Model) doCreateSession() tea.Cmd {
	ctx := m.ctx
	sessions := m.app.Sessions
	return func() tea.Msg {
		sess, err := sessions.Create(ctx, "interactive")
		if err != nil {
			return sessionCreatedMsg{err: err}
		}
		return sessionCreatedMsg{sessionID: sess.ID}
	}
}

// listenPermissions runs a continuous loop that subscribes to permission
// requests and forwards each one to the TUI as a tea.Msg. The subscription
// lifetime is tied to the app context. It reuses a persistent subscription
// channel stored on the model to avoid goroutine/subscriber accumulation.
func (m *Model) listenPermissions() tea.Cmd {
	sub := m.permSub
	return func() tea.Msg {
		for event := range sub {
			if event.Type == pubsub.CreatedEvent {
				return permissionRequestMsg{req: event.Payload}
			}
		}
		return nil
	}
}

// listenMessageUpdates subscribes to the message service's pubsub broker.
// This is where streaming content actually comes from: the agent calls
// messages.Update() on every content delta, which publishes an UpdatedEvent.
// We forward assistant message content updates to the TUI for live display.
// Also detects tool call starts to show tool activity.
// It reuses a persistent subscription channel to avoid goroutine/subscriber
// accumulation across re-arms.
func (m *Model) listenMessageUpdates() tea.Cmd {
	sub := m.msgSub
	return func() tea.Msg {
		for event := range sub {
			if event.Type == pubsub.UpdatedEvent {
				msg := event.Payload
				if msg.Role == message.Assistant {
					// Check for tool calls in progress
					toolCalls := msg.ToolCalls()
					for _, tc := range toolCalls {
						if !tc.Finished && tc.Name != "" {
							return toolActivityMsg{
								sessionID: msg.SessionID,
								toolName:  tc.Name,
							}
						}
					}
					// Text content update (with reasoning)
					content := msg.Content().String()
					reasoning := msg.ReasoningContent().String()
					if content != "" || reasoning != "" {
						return messageUpdatedMsg{
							sessionID: msg.SessionID,
							role:      msg.Role,
							content:   content,
							reasoning: reasoning,
						}
					}
				}
			}
		}
		return nil
	}
}

// doRunCLICommand runs a doctor/index command via the embedded TS CLI,
// captures output, and returns a cliExecDoneMsg.
func (m *Model) doRunCLICommand(cmdName string, args []string) tea.Cmd {
	return func() tea.Msg {
		result, err := clibundle.ExecCapture(append([]string{cmdName}, args...))
		if err != nil {
			return cliExecDoneMsg{cmd: cmdName, stderr: fmt.Sprintf("Error: %v", err)}
		}
		return cliExecDoneMsg{cmd: cmdName, stdout: result.Stdout, stderr: result.Stderr}
	}
}

// ── Slash command completion ─────────────────────────────────────────────

// slashCommands is the list of all slash commands available in the TUI.
var slashCommands = []string{
	"/ask",
	"/attach",
	"/clear",
	"/cost",
	"/doctor",
	"/exit",
	"/explain",
	"/help",
	"/index",
	"/model",
	"/new",
	"/quick",
	"/quit",
	"/sessions",
	"/summarize",
	"/switch",
	"/trace",
}

// handleTabCompletion cycles through matching slash commands when tab is pressed.
func (m *Model) handleTabCompletion() (tea.Model, tea.Cmd) {
	text := m.input.Value()

	// Only complete if input starts with /
	if !strings.HasPrefix(text, "/") {
		return *m, nil
	}

	// On first tab press, set the base text for matching
	if m.completionBase == "" {
		m.completionBase = strings.TrimSpace(text)
		m.completionIndex = 0
	}

	// Find matching commands
	prefix := strings.ToLower(m.completionBase)
	var matches []string
	for _, cmd := range slashCommands {
		if strings.HasPrefix(cmd, prefix) {
			matches = append(matches, cmd)
		}
	}

	if len(matches) == 0 {
		return *m, nil
	}

	// Cycle through matches
	idx := m.completionIndex % len(matches)
	m.completionIndex++

	m.input.Reset()
	completed := matches[idx] + " "
	m.input.SetValue(completed)
	// Move cursor to end
	for i := 0; i < len(completed); i++ {
		m.input.CursorEnd()
	}

	return *m, nil
}

// ── Input handling ──────────────────────────────────────────────────────

func (m *Model) handleInput(text string) (tea.Model, tea.Cmd) {
	if strings.HasPrefix(text, "/") {
		return m.handleSlashCommand(text)
	}

	// Regular prompt → send to agent
	m.appendUser(text)
	if len(m.attachments) > 0 {
		m.appendSystem(fmt.Sprintf("(%d file(s) attached)", len(m.attachments)))
	}
	m.busy = true
	m.streamingContent = ""
	m.activeTool = ""
	m.refreshViewport()
	return *m, tea.Batch(m.doRunAgent(text), m.listenMessageUpdates())
}

func (m *Model) handleSlashCommand(text string) (tea.Model, tea.Cmd) {
	parts := strings.Fields(text)
	cmd := parts[0]
	args := ""
	if len(parts) > 1 {
		args = strings.Join(parts[1:], " ")
	}

	switch cmd {
	case "/help", "/h":
		m.appendSystem(helpText())
		m.refreshViewport()
		return *m, nil

	case "/quit", "/exit", "/q":
		return *m, tea.Quit

	case "/ask":
		if args == "" {
			m.appendError("Usage: /ask <question>")
			m.refreshViewport()
			return *m, nil
		}
		m.appendUser(args)
		m.busy = true
		m.streamingContent = ""
		m.refreshViewport()
		return *m, tea.Batch(m.doRunAgent(args), m.listenMessageUpdates())

	case "/quick":
		if args == "" {
			m.appendError("Usage: /quick <task description>")
			m.refreshViewport()
			return *m, nil
		}
		m.appendUser("[quick] " + args)
		m.busy = true
		m.streamingContent = ""
		m.refreshViewport()
		return *m, tea.Batch(m.doRunAgent(args), m.listenMessageUpdates())

	case "/explain":
		if args == "" {
			m.appendError("Usage: /explain <symbol>")
			m.refreshViewport()
			return *m, nil
		}
		prompt := fmt.Sprintf("Explain the symbol or function: %s", args)
		m.appendUser("[explain] " + args)
		m.busy = true
		m.streamingContent = ""
		m.refreshViewport()
		return *m, tea.Batch(m.doRunAgent(prompt), m.listenMessageUpdates())

	case "/trace":
		if args == "" {
			m.appendError("Usage: /trace <flow>")
			m.refreshViewport()
			return *m, nil
		}
		prompt := fmt.Sprintf("Trace the flow: %s", args)
		m.appendUser("[trace] " + args)
		m.busy = true
		m.streamingContent = ""
		m.refreshViewport()
		return *m, tea.Batch(m.doRunAgent(prompt), m.listenMessageUpdates())

	case "/doctor":
		m.appendSystem("Running doctor...")
		m.busy = true
		m.refreshViewport()
		var extraArgs []string
		if args != "" {
			extraArgs = strings.Fields(args)
		}
		return *m, m.doRunCLICommand("doctor", extraArgs)

	case "/index":
		m.appendSystem("Indexing codebase...")
		m.busy = true
		m.refreshViewport()
		var extraArgs []string
		if args != "" {
			extraArgs = strings.Fields(args)
		}
		return *m, m.doRunCLICommand("index", extraArgs)

	case "/sessions":
		return m.handleSessionsList()

	case "/switch":
		if args == "" {
			m.appendError("Usage: /switch <session-id-prefix>")
			m.refreshViewport()
			return *m, nil
		}
		return m.handleSessionSwitch(args)

	case "/summarize":
		if m.sessionID == "" {
			m.appendError("No active session to summarize.")
			m.refreshViewport()
			return *m, nil
		}
		m.appendSystem("Summarizing conversation...")
		m.busy = true
		m.refreshViewport()
		return *m, m.doSummarize()

	case "/model":
		return m.handleModelCommand(args)

	case "/attach":
		if args == "" {
			m.appendError("Usage: /attach <file-path>")
			m.refreshViewport()
			return *m, nil
		}
		return m.handleAttach(args)

	case "/cost":
		return m.handleCostCommand()

	case "/clear":
		m.chat = nil
		m.streamingContent = ""
		m.streamingReasoning = ""
		m.invalidateCache()
		m.refreshViewport()
		return *m, nil

	case "/new":
		m.chat = nil
		m.sessionID = ""
		m.busy = false
		m.streamingContent = ""
		m.streamingReasoning = ""
		m.activeTool = ""
		m.attachments = nil
		m.overlay = overlayNone
		m.pendingPerm = nil
		m.invalidateCache()
		m.refreshViewport()
		return *m, m.doCreateSession()

	default:
		m.appendError(fmt.Sprintf("Unknown command: %s (type /help for commands)", cmd))
		m.refreshViewport()
		return *m, nil
	}
}

func helpText() string {
	return `Commands:
  /ask <question>       Ask about the codebase
  /quick <task>         Run a quick task
  /explain <symbol>     Explain a symbol
  /trace <flow>         Trace a code flow
  /attach <file>        Attach a file to next prompt
  /doctor [--json]      Run health check (via embedded CLI)
  /index                Index codebase (via embedded CLI)
  /sessions             List all sessions
  /switch <id>          Switch to a session (prefix match)
  /summarize            Compress context for current session
  /model                Show current model info
  /model list           List available models
  /model <id>           Switch to a model
  /cost                 Show session cost & tokens
  /clear                Clear chat display
  /new                  New session
  /quit                 Exit

Or type a message directly to chat with the AI agent.
Alt+Enter for multiline input, Enter to send.
Ctrl+C cancels a running task or exits.

Permission dialog keys:
  Y  Grant once
  A  Grant persistent (always allow this tool+action+path)
  N  Deny`
}

// ── Session management ──────────────────────────────────────────────────

func (m *Model) handleSessionsList() (tea.Model, tea.Cmd) {
	sessions, err := m.app.Sessions.List(m.ctx)
	if err != nil {
		m.appendError(fmt.Sprintf("Failed to list sessions: %v", err))
		m.refreshViewport()
		return *m, nil
	}

	if len(sessions) == 0 {
		m.appendSystem("No sessions found.")
		m.refreshViewport()
		return *m, nil
	}

	// Build session picker items (top-level only)
	m.sessionPickerItems = nil
	for _, sess := range sessions {
		if sess.ParentSessionID != "" {
			continue
		}
		m.sessionPickerItems = append(m.sessionPickerItems, sessionPickerItem{
			id:    sess.ID,
			title: sess.Title,
			cost:  sess.Cost,
		})
	}

	if len(m.sessionPickerItems) == 0 {
		m.appendSystem("No top-level sessions found.")
		m.refreshViewport()
		return *m, nil
	}

	// Find current session index
	m.sessionPickerSelected = 0
	for i, item := range m.sessionPickerItems {
		if item.id == m.sessionID {
			m.sessionPickerSelected = i
			break
		}
	}

	m.overlay = overlaySessionPicker
	return *m, nil
}

func (m *Model) handleSessionSwitch(prefix string) (tea.Model, tea.Cmd) {
	sessions, err := m.app.Sessions.List(m.ctx)
	if err != nil {
		m.appendError(fmt.Sprintf("Failed to list sessions: %v", err))
		m.refreshViewport()
		return *m, nil
	}

	prefix = strings.TrimSpace(strings.ToLower(prefix))
	var match *string
	for _, sess := range sessions {
		if sess.ParentSessionID != "" {
			continue
		}
		if strings.HasPrefix(strings.ToLower(sess.ID), prefix) {
			id := sess.ID
			if match != nil {
				m.appendError(fmt.Sprintf("Ambiguous prefix '%s'. Use more characters.", prefix))
				m.refreshViewport()
				return *m, nil
			}
			match = &id
		}
	}

	if match == nil {
		m.appendError(fmt.Sprintf("No session matching '%s'.", prefix))
		m.refreshViewport()
		return *m, nil
	}

	// Load the session's messages and rebuild chat
	m.sessionID = *match
	m.chat = nil
	m.streamingContent = ""
	m.streamingReasoning = ""
	m.invalidateCache()

	msgs, err := m.app.Messages.List(m.ctx, m.sessionID)
	if err != nil {
		m.appendError(fmt.Sprintf("Failed to load messages: %v", err))
		m.refreshViewport()
		return *m, nil
	}

	for _, msg := range msgs {
		switch msg.Role {
		case message.User:
			m.chat = append(m.chat, chatEntry{role: "user", content: msg.Content().String()})
		case message.Assistant:
			// Show reasoning if present
			reasoning := msg.ReasoningContent().String()
			if reasoning != "" {
				m.appendReasoning(reasoning)
			}
			// Show tool results
			m.appendToolResults(msg.Parts)
			// Show text content
			content := msg.Content().String()
			if content != "" {
				m.chat = append(m.chat, chatEntry{role: "assistant", content: content})
			}
		}
	}

	short := m.sessionID
	if len(short) > 8 {
		short = short[:8]
	}
	m.appendSystem(fmt.Sprintf("Switched to session %s.", short))
	m.refreshViewport()
	return *m, nil
}

// ── Summarize ───────────────────────────────────────────────────────────

func (m *Model) doSummarize() tea.Cmd {
	ctx := m.ctx
	agentSvc := m.app.CoderAgent
	sessionID := m.sessionID
	return func() tea.Msg {
		err := agentSvc.Summarize(ctx, sessionID)
		if err != nil {
			return summarizeDoneMsg{err: err}
		}
		// Summarize runs async; wait for the done event via a short poll
		// (the agent publishes AgentEventTypeSummarize with Done=true).
		// For simplicity, return immediately — the user will see the
		// summary when they query the session next.
		return summarizeDoneMsg{err: nil}
	}
}

// ── Model command ───────────────────────────────────────────────────────

func (m *Model) handleModelCommand(args string) (tea.Model, tea.Cmd) {
	args = strings.TrimSpace(args)

	// "/model" with no args — show current model info
	if args == "" {
		model := m.app.CoderAgent.Model()
		info := fmt.Sprintf("Current model: %s\nProvider: %s\nMax tokens: %d\nCan reason: %t\nSupports attachments: %t",
			model.ID, model.Provider, model.DefaultMaxTokens, model.CanReason, model.SupportsAttachments)
		m.appendSystem(info)
		m.refreshViewport()
		return *m, nil
	}

	// "/model list" — list all available models
	if args == "list" || args == "ls" {
		return m.handleModelList()
	}

	// "/model <model-id>" — switch to a specific model
	if m.busy {
		m.appendError("Cannot change model while processing.")
		m.refreshViewport()
		return *m, nil
	}

	modelID := models.ModelID(args)

	// Check if the model exists in SupportedModels
	if _, ok := models.SupportedModels[modelID]; !ok {
		// Try fuzzy prefix match
		var matches []models.ModelID
		for id := range models.SupportedModels {
			if strings.Contains(strings.ToLower(string(id)), strings.ToLower(args)) {
				matches = append(matches, id)
			}
		}
		if len(matches) == 1 {
			modelID = matches[0]
		} else if len(matches) > 1 {
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("Ambiguous model '%s'. Did you mean one of:\n", args))
			for _, id := range matches {
				sb.WriteString(fmt.Sprintf("  %s\n", id))
			}
			m.appendError(sb.String())
			m.refreshViewport()
			return *m, nil
		} else {
			m.appendError(fmt.Sprintf("Unknown model: %s. Use /model list to see available models.", args))
			m.refreshViewport()
			return *m, nil
		}
	}

	newModel, err := m.app.CoderAgent.Update(config.AgentCoder, modelID)
	if err != nil {
		m.appendError(fmt.Sprintf("Failed to switch model: %v", err))
		m.refreshViewport()
		return *m, nil
	}

	m.appendSystem(fmt.Sprintf("Switched to model: %s (%s)", newModel.ID, newModel.Provider))
	m.refreshViewport()
	return *m, nil
}

func (m *Model) handleModelList() (tea.Model, tea.Cmd) {
	// Group models by provider
	byProvider := make(map[models.ModelProvider][]models.Model)
	for _, model := range models.SupportedModels {
		byProvider[model.Provider] = append(byProvider[model.Provider], model)
	}

	// Sort providers by popularity
	type providerEntry struct {
		provider models.ModelProvider
		models   []models.Model
	}
	var providers []providerEntry
	for p, ms := range byProvider {
		providers = append(providers, providerEntry{provider: p, models: ms})
	}
	// Sort by provider popularity (lower = more popular)
	for i := 0; i < len(providers); i++ {
		for j := i + 1; j < len(providers); j++ {
			pi := models.ProviderPopularity[providers[i].provider]
			pj := models.ProviderPopularity[providers[j].provider]
			if pi == 0 {
				pi = 999
			}
			if pj == 0 {
				pj = 999
			}
			if pi > pj {
				providers[i], providers[j] = providers[j], providers[i]
			}
		}
	}

	currentModelID := m.app.CoderAgent.Model().ID

	var sb strings.Builder
	sb.WriteString("Available models:\n")
	for _, pe := range providers {
		sb.WriteString(fmt.Sprintf("\n  %s:\n", pe.provider))
		// Sort models by name within provider
		ms := pe.models
		for i := 0; i < len(ms); i++ {
			for j := i + 1; j < len(ms); j++ {
				if string(ms[i].ID) > string(ms[j].ID) {
					ms[i], ms[j] = ms[j], ms[i]
				}
			}
		}
		for _, model := range ms {
			marker := "  "
			if model.ID == currentModelID {
				marker = "> "
			}
			sb.WriteString(fmt.Sprintf("    %s%s", marker, model.ID))
			if model.CanReason {
				sb.WriteString(" (reason)")
			}
			sb.WriteString("\n")
		}
	}
	sb.WriteString("\nUse /model <model-id> to switch. Current: " + string(currentModelID))

	m.appendSystem(sb.String())
	m.refreshViewport()
	return *m, nil
}

// ── Cost command ────────────────────────────────────────────────────────

func (m *Model) handleCostCommand() (tea.Model, tea.Cmd) {
	if m.sessionID == "" {
		m.appendError("No active session.")
		m.refreshViewport()
		return *m, nil
	}

	sess, err := m.app.Sessions.Get(m.ctx, m.sessionID)
	if err != nil {
		m.appendError(fmt.Sprintf("Failed to get session: %v", err))
		m.refreshViewport()
		return *m, nil
	}

	info := fmt.Sprintf("Session cost: %s\nPrompt tokens: %d\nCompletion tokens: %d",
		costStyle.Render(fmt.Sprintf("$%.4f", sess.Cost)),
		sess.PromptTokens,
		sess.CompletionTokens,
	)
	m.appendSystem(info)
	m.refreshViewport()
	return *m, nil
}

// ── File attachment ──────────────────────────────────────────────────

func (m *Model) handleAttach(pathArg string) (tea.Model, tea.Cmd) {
	pathArg = strings.TrimSpace(pathArg)

	// Resolve relative paths
	if !filepath.IsAbs(pathArg) {
		cwd, err := os.Getwd()
		if err == nil {
			fullPath := filepath.Join(cwd, pathArg)
			// Check if the file exists directly
			if _, statErr := os.Stat(fullPath); statErr == nil {
				pathArg = fullPath
			} else {
				// File doesn't exist — try file completion search
				return m.doFileSearch(pathArg)
			}
		}
	} else {
		// Absolute path — check existence
		if _, statErr := os.Stat(pathArg); statErr != nil {
			m.appendError(fmt.Sprintf("File not found: %s", pathArg))
			m.refreshViewport()
			return *m, nil
		}
	}

	return m.attachFile(pathArg)
}

func (m *Model) doFileSearch(query string) (tea.Model, tea.Cmd) {
	m.fileCompletionQuery = query
	completionProvider := completions.NewFileAndFolderContextGroup()

	return *m, func() tea.Msg {
		items, err := completionProvider.GetChildEntries(query)
		if err != nil {
			return fileCompletionMsg{err: err}
		}
		matches := make([]string, 0, len(items))
		for _, item := range items {
			matches = append(matches, item.GetValue())
		}
		// Limit to 50 results
		if len(matches) > 50 {
			matches = matches[:50]
		}
		return fileCompletionMsg{matches: matches}
	}
}

func (m *Model) attachFile(path string) (tea.Model, tea.Cmd) {
	data, err := os.ReadFile(path)
	if err != nil {
		m.appendError(fmt.Sprintf("Cannot read file: %v", err))
		m.refreshViewport()
		return *m, nil
	}

	mime := "application/octet-stream"
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".png":
		mime = "image/png"
	case ".jpg", ".jpeg":
		mime = "image/jpeg"
	case ".gif":
		mime = "image/gif"
	case ".webp":
		mime = "image/webp"
	case ".svg":
		mime = "image/svg+xml"
	case ".pdf":
		mime = "application/pdf"
	case ".txt", ".md", ".go", ".ts", ".js", ".py", ".rs", ".c", ".h", ".java", ".json", ".yaml", ".yml", ".toml", ".xml", ".html", ".css":
		mime = "text/plain"
	}

	m.attachments = append(m.attachments, message.Attachment{
		FilePath: path,
		FileName: filepath.Base(path),
		MimeType: mime,
		Content:  data,
	})

	m.appendSystem(fmt.Sprintf("Attached: %s (%d bytes). Will be sent with your next message.", filepath.Base(path), len(data)))
	m.refreshViewport()
	return *m, nil
}

// ── Agent execution ─────────────────────────────────────────────────────

func (m *Model) doRunAgent(prompt string) tea.Cmd {
	ctx := m.ctx
	a := m.app
	sessionID := m.sessionID
	attachments := m.attachments
	m.attachments = nil // consume attachments

	return func() tea.Msg {
		// Ensure we have a session
		if sessionID == "" {
			sess, err := a.Sessions.Create(ctx, "interactive")
			if err != nil {
				return agentDoneMsg{err: fmt.Errorf("create session: %w", err)}
			}
			sessionID = sess.ID
		}

		done, err := a.CoderAgent.Run(ctx, sessionID, prompt, attachments...)
		if err != nil {
			return agentDoneMsg{err: err}
		}

		result := <-done
		if result.Error != nil {
			return agentDoneMsg{err: result.Error}
		}

		content := ""
		if result.Message.Content().String() != "" {
			content = result.Message.Content().String()
		}
		reasoning := result.Message.ReasoningContent().String()

		return agentDoneMsg{
			content:   content,
			reasoning: reasoning,
			parts:     result.Message.Parts,
		}
	}
}

// ── Markdown rendering ───────────────────────────────────────────────────

// termRenderer is a goldmark Renderer that converts Markdown to ANSI-styled
// terminal output using lipgloss and chroma for code blocks.
type termRenderer struct {
	width int
}

func newTermRenderer(width int) renderer.Renderer {
	return renderer.NewRenderer(
		renderer.WithNodeRenderers(
			util.Prioritized(&termRenderer{width: width}, 1000),
		),
	)
}

// RegisterFuncs registers all node renderers.
func (r *termRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(ast.KindDocument, r.renderDocument)
	reg.Register(ast.KindHeading, r.renderHeading)
	reg.Register(ast.KindParagraph, r.renderParagraph)
	reg.Register(ast.KindText, r.renderText)
	reg.Register(ast.KindCodeBlock, r.renderCodeBlock)
	reg.Register(ast.KindFencedCodeBlock, r.renderFencedCodeBlock)
	reg.Register(ast.KindCodeSpan, r.renderCodeSpan)
	reg.Register(ast.KindEmphasis, r.renderEmphasis)
	reg.Register(ast.KindLink, r.renderLink)
	reg.Register(ast.KindList, r.renderList)
	reg.Register(ast.KindListItem, r.renderListItem)
	reg.Register(ast.KindThematicBreak, r.renderThematicBreak)
	reg.Register(ast.KindBlockquote, r.renderBlockquote)
	reg.Register(ast.KindHTMLBlock, r.renderHTMLBlock)
	reg.Register(ast.KindRawHTML, r.renderRawHTML)
	reg.Register(ast.KindTextBlock, r.renderTextBlock)
	reg.Register(ast.KindString, r.renderString)
}

func (r *termRenderer) renderDocument(w util.BufWriter, _ []byte, _ ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		_, _ = w.Write([]byte("\n"))
	}
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderHeading(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	n := node.(*ast.Heading)
	if entering {
		switch n.Level {
		case 1:
			_, _ = w.Write([]byte(lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#7D56F4")).Render("# ")))
		case 2:
			_, _ = w.Write([]byte(lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#9B7BF7")).Render("## ")))
		default:
			_, _ = w.Write([]byte(lipgloss.NewStyle().Bold(true).Render(strings.Repeat("#", n.Level) + " ")))
		}
	} else {
		_, _ = w.Write([]byte("\n"))
	}
	_ = source
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderParagraph(w util.BufWriter, _ []byte, _ ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		_, _ = w.Write([]byte("\n"))
	}
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderText(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*ast.Text)
	_, _ = w.Write(n.Segment.Value(source))
	if n.HardLineBreak() {
		_, _ = w.Write([]byte("\n"))
	} else if n.SoftLineBreak() {
		_, _ = w.Write([]byte(" "))
	}
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderCodeBlock(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	var buf bytes.Buffer
	for i := 0; i < node.Lines().Len(); i++ {
		line := node.Lines().At(i)
		buf.Write(line.Value(source))
	}
	highlighted := highlightCode(buf.String(), "")
	_, _ = w.Write([]byte(highlighted))
	_, _ = w.Write([]byte("\n"))
	return ast.WalkSkipChildren, nil
}

func (r *termRenderer) renderFencedCodeBlock(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*ast.FencedCodeBlock)
	lang := ""
	if n.Info != nil {
		lang = string(n.Info.Segment.Value(source))
		// Strip options after space
		if idx := strings.Index(lang, " "); idx >= 0 {
			lang = lang[:idx]
		}
	}
	var buf bytes.Buffer
	for i := 0; i < n.Lines().Len(); i++ {
		line := n.Lines().At(i)
		buf.Write(line.Value(source))
	}
	highlighted := highlightCode(buf.String(), lang)
	_, _ = w.Write([]byte(highlighted))
	_, _ = w.Write([]byte("\n"))
	return ast.WalkSkipChildren, nil
}

func (r *termRenderer) renderCodeSpan(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		style := lipgloss.NewStyle().Foreground(lipgloss.Color("#50FA7B")).Background(lipgloss.Color("#282A36"))
		var buf bytes.Buffer
		for c := node.FirstChild(); c != nil; c = c.NextSibling() {
			if t, ok := c.(*ast.Text); ok {
				buf.Write(t.Segment.Value(source))
			}
		}
		_, _ = w.Write([]byte(style.Render("`" + buf.String() + "`")))
		return ast.WalkSkipChildren, nil
	}
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderEmphasis(w util.BufWriter, _ []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	n := node.(*ast.Emphasis)
	if n.Level == 1 {
		// italic — not universally supported in terminals
		_ = entering
	} else {
		// bold
		if entering {
			_, _ = w.Write([]byte("\x1b[1m"))
		} else {
			_, _ = w.Write([]byte("\x1b[0m"))
		}
	}
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderLink(w util.BufWriter, _ []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	n := node.(*ast.Link)
	if !entering {
		dest := string(n.Destination)
		_, _ = w.Write([]byte(lipgloss.NewStyle().Foreground(lipgloss.Color("#8BE9FD")).Underline(true).Render(" (" + dest + ")")))
	}
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderList(_ util.BufWriter, _ []byte, _ ast.Node, _ bool) (ast.WalkStatus, error) {
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderListItem(w util.BufWriter, _ []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		parent := node.Parent()
		if ol, ok := parent.(*ast.List); ok && ol.IsOrdered() {
			// Calculate item number
			num := 1
			for prev := node.PreviousSibling(); prev != nil; prev = prev.PreviousSibling() {
				num++
			}
			_, _ = w.Write([]byte(fmt.Sprintf("  %d. ", num)))
		} else {
			_, _ = w.Write([]byte("  • "))
		}
	} else {
		_, _ = w.Write([]byte("\n"))
	}
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderThematicBreak(w util.BufWriter, _ []byte, _ ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		width := r.width
		if width <= 0 {
			width = 80
		}
		_, _ = w.Write([]byte(lipgloss.NewStyle().Foreground(lipgloss.Color("#666666")).Render(strings.Repeat("─", width)) + "\n"))
	}
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderBlockquote(w util.BufWriter, _ []byte, _ ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		_, _ = w.Write([]byte(lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("│ ")))
	}
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderHTMLBlock(_ util.BufWriter, _ []byte, _ ast.Node, _ bool) (ast.WalkStatus, error) {
	return ast.WalkSkipChildren, nil
}

func (r *termRenderer) renderRawHTML(_ util.BufWriter, _ []byte, _ ast.Node, _ bool) (ast.WalkStatus, error) {
	return ast.WalkSkipChildren, nil
}

func (r *termRenderer) renderTextBlock(_ util.BufWriter, _ []byte, _ ast.Node, _ bool) (ast.WalkStatus, error) {
	return ast.WalkContinue, nil
}

func (r *termRenderer) renderString(w util.BufWriter, _ []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*ast.String)
	_, _ = w.Write(n.Value)
	return ast.WalkContinue, nil
}

// renderMarkdown converts markdown text to ANSI terminal output.
// Falls back gracefully to plain text if rendering fails.
func renderMarkdown(md string, width int) string {
	if md == "" {
		return ""
	}

	mdRenderer := newTermRenderer(width)
	gm := goldmark.New(
		goldmark.WithExtensions(extension.GFM),
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
		),
		goldmark.WithRenderer(mdRenderer),
	)

	var buf bytes.Buffer
	if err := gm.Convert([]byte(md), &buf); err != nil {
		// Fallback: plain text
		return md
	}

	result := buf.String()
	result = strings.TrimRight(result, "\n")
	return result
}

// highlightCode applies syntax highlighting to a code block using chroma.
// Falls back to a simple indented block if highlighting fails.
func highlightCode(code, lang string) string {
	var lexer chroma.Lexer
	if lang != "" {
		lexer = lexers.Get(lang)
	}
	if lexer == nil {
		lexer = lexers.Analyse(code)
	}
	if lexer == nil {
		lexer = lexers.Fallback
	}
	lexer = chroma.Coalesce(lexer)

	style := styles.Get("dracula")
	if style == nil {
		style = styles.Fallback
	}

	formatter := chromafmt.TTY16m

	var buf bytes.Buffer
	iterator, err := lexer.Tokenise(nil, code)
	if err != nil {
		goto fallback
	}
	if err = formatter.Format(&buf, style, iterator); err != nil {
		goto fallback
	}
	return strings.TrimRight(buf.String(), "\n")

fallback:
	lines := strings.Split(strings.TrimRight(code, "\n"), "\n")
	var out strings.Builder
	dimStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#888888"))
	for _, l := range lines {
		out.WriteString(dimStyle.Render("  "+l) + "\n")
	}
	return strings.TrimRight(out.String(), "\n")
}
