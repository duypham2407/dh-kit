// Package protocol provides stub LSP protocol types for dh fork compilation.
// Only types actually referenced by vendored code are included here.
package protocol

import "encoding/json"

// DocumentUri represents a document URI.
type DocumentUri string

// Path returns the path component of the URI.
func (d DocumentUri) Path() string {
	return string(d)
}

// DiagnosticSeverity represents the severity of a diagnostic.
type DiagnosticSeverity int

const (
	SeverityError   DiagnosticSeverity = 1
	SeverityWarning DiagnosticSeverity = 2
	SeverityInformation DiagnosticSeverity = 3
	SeverityHint    DiagnosticSeverity = 4
)

// DiagnosticTag represents a diagnostic tag.
type DiagnosticTag int

const (
	Unnecessary DiagnosticTag = 1
	Deprecated  DiagnosticTag = 2
)

// Range represents a text range in a document.
type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

// Position represents a position in a text document.
type Position struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

// Diagnostic represents a diagnostic (error, warning, etc.).
type Diagnostic struct {
	Range    Range              `json:"range"`
	Severity DiagnosticSeverity `json:"severity"`
	Code     *json.RawMessage   `json:"code,omitempty"`
	Source   string             `json:"source,omitempty"`
	Message  string             `json:"message"`
	Tags     []DiagnosticTag    `json:"tags,omitempty"`
}

// PublishDiagnosticsParams contains the parameters for publishDiagnostics notification.
type PublishDiagnosticsParams struct {
	URI         DocumentUri  `json:"uri"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}
