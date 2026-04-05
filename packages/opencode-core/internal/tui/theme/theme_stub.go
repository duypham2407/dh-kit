// Package theme provides a stub theme system for dh fork compilation.
// The full TUI theme from upstream is deferred.
package theme

import (
	"fmt"

	"github.com/charmbracelet/lipgloss"
)

// Theme is the interface that upstream code uses for styling.
type Theme interface {
	Primary() lipgloss.AdaptiveColor
	Secondary() lipgloss.AdaptiveColor
	Accent() lipgloss.AdaptiveColor
	Error() lipgloss.AdaptiveColor
	Warning() lipgloss.AdaptiveColor
	Success() lipgloss.AdaptiveColor
	Info() lipgloss.AdaptiveColor
	Text() lipgloss.AdaptiveColor
	TextMuted() lipgloss.AdaptiveColor
	TextEmphasized() lipgloss.AdaptiveColor
	Background() lipgloss.AdaptiveColor
	BackgroundSecondary() lipgloss.AdaptiveColor
	BackgroundDarker() lipgloss.AdaptiveColor
	BorderNormal() lipgloss.AdaptiveColor
	BorderFocused() lipgloss.AdaptiveColor
	BorderDim() lipgloss.AdaptiveColor
	DiffAdded() lipgloss.AdaptiveColor
	DiffRemoved() lipgloss.AdaptiveColor
	DiffAddedBg() lipgloss.AdaptiveColor
	DiffRemovedBg() lipgloss.AdaptiveColor
	DiffAddedLineNumberBg() lipgloss.AdaptiveColor
	DiffRemovedLineNumberBg() lipgloss.AdaptiveColor
	SyntaxComment() lipgloss.AdaptiveColor
	SyntaxKeyword() lipgloss.AdaptiveColor
	SyntaxFunction() lipgloss.AdaptiveColor
	SyntaxVariable() lipgloss.AdaptiveColor
	SyntaxString() lipgloss.AdaptiveColor
	SyntaxNumber() lipgloss.AdaptiveColor
	SyntaxType() lipgloss.AdaptiveColor
	SyntaxOperator() lipgloss.AdaptiveColor
	SyntaxPunctuation() lipgloss.AdaptiveColor
	DiffContextBg() lipgloss.AdaptiveColor
	DiffLineNumber() lipgloss.AdaptiveColor
	DiffHighlightAdded() lipgloss.AdaptiveColor
	DiffHighlightRemoved() lipgloss.AdaptiveColor
}

// defaultColor is used as a fallback for all theme colors.
var defaultColor = lipgloss.AdaptiveColor{Light: "#333333", Dark: "#CCCCCC"}
var defaultBg = lipgloss.AdaptiveColor{Light: "#FFFFFF", Dark: "#1A1A2E"}
var diffAdded = lipgloss.AdaptiveColor{Light: "#22863A", Dark: "#85E89D"}
var diffRemoved = lipgloss.AdaptiveColor{Light: "#CB2431", Dark: "#F97583"}
var diffAddedBg = lipgloss.AdaptiveColor{Light: "#E6FFEC", Dark: "#1B3826"}
var diffRemovedBg = lipgloss.AdaptiveColor{Light: "#FFEEF0", Dark: "#3B1B1F"}

// stubTheme implements Theme with sensible defaults.
type stubTheme struct{}

func (s *stubTheme) Primary() lipgloss.AdaptiveColor             { return defaultColor }
func (s *stubTheme) Secondary() lipgloss.AdaptiveColor            { return defaultColor }
func (s *stubTheme) Accent() lipgloss.AdaptiveColor               { return defaultColor }
func (s *stubTheme) Error() lipgloss.AdaptiveColor                { return diffRemoved }
func (s *stubTheme) Warning() lipgloss.AdaptiveColor              { return defaultColor }
func (s *stubTheme) Success() lipgloss.AdaptiveColor              { return diffAdded }
func (s *stubTheme) Info() lipgloss.AdaptiveColor                 { return defaultColor }
func (s *stubTheme) Text() lipgloss.AdaptiveColor                 { return defaultColor }
func (s *stubTheme) TextMuted() lipgloss.AdaptiveColor            { return defaultColor }
func (s *stubTheme) TextEmphasized() lipgloss.AdaptiveColor       { return defaultColor }
func (s *stubTheme) Background() lipgloss.AdaptiveColor           { return defaultBg }
func (s *stubTheme) BackgroundSecondary() lipgloss.AdaptiveColor  { return defaultBg }
func (s *stubTheme) BackgroundDarker() lipgloss.AdaptiveColor     { return defaultBg }
func (s *stubTheme) BorderNormal() lipgloss.AdaptiveColor         { return defaultColor }
func (s *stubTheme) BorderFocused() lipgloss.AdaptiveColor        { return defaultColor }
func (s *stubTheme) BorderDim() lipgloss.AdaptiveColor            { return defaultColor }
func (s *stubTheme) DiffAdded() lipgloss.AdaptiveColor            { return diffAdded }
func (s *stubTheme) DiffRemoved() lipgloss.AdaptiveColor          { return diffRemoved }
func (s *stubTheme) DiffAddedBg() lipgloss.AdaptiveColor          { return diffAddedBg }
func (s *stubTheme) DiffRemovedBg() lipgloss.AdaptiveColor        { return diffRemovedBg }
func (s *stubTheme) DiffAddedLineNumberBg() lipgloss.AdaptiveColor  { return diffAddedBg }
func (s *stubTheme) DiffRemovedLineNumberBg() lipgloss.AdaptiveColor { return diffRemovedBg }
func (s *stubTheme) SyntaxComment() lipgloss.AdaptiveColor        { return defaultColor }
func (s *stubTheme) SyntaxKeyword() lipgloss.AdaptiveColor        { return defaultColor }
func (s *stubTheme) SyntaxFunction() lipgloss.AdaptiveColor       { return defaultColor }
func (s *stubTheme) SyntaxVariable() lipgloss.AdaptiveColor       { return defaultColor }
func (s *stubTheme) SyntaxString() lipgloss.AdaptiveColor         { return defaultColor }
func (s *stubTheme) SyntaxNumber() lipgloss.AdaptiveColor         { return defaultColor }
func (s *stubTheme) SyntaxType() lipgloss.AdaptiveColor           { return defaultColor }
func (s *stubTheme) SyntaxOperator() lipgloss.AdaptiveColor       { return defaultColor }
func (s *stubTheme) SyntaxPunctuation() lipgloss.AdaptiveColor    { return defaultColor }
func (s *stubTheme) DiffContextBg() lipgloss.AdaptiveColor        { return defaultBg }
func (s *stubTheme) DiffLineNumber() lipgloss.AdaptiveColor       { return defaultColor }
func (s *stubTheme) DiffHighlightAdded() lipgloss.AdaptiveColor   { return diffAddedBg }
func (s *stubTheme) DiffHighlightRemoved() lipgloss.AdaptiveColor { return diffRemovedBg }

var current Theme = &stubTheme{}

// CurrentTheme returns the current active theme.
func CurrentTheme() Theme {
	return current
}

// SetTheme accepts a theme name (stub: always succeeds, keeps default theme).
func SetTheme(name string) error {
	if name == "" {
		return fmt.Errorf("empty theme name")
	}
	// Stub: accept all theme names
	return nil
}
