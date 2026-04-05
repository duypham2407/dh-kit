// Package lsp provides a stub LSP client for dh fork compilation.
// The full LSP integration from upstream is deferred.
package lsp

import (
	"context"
	"encoding/json"

	"github.com/duypham93/dh/packages/opencode-core/internal/lsp/protocol"
)

// ServerState represents the state of an LSP server.
type ServerState int

const (
	StateStarting ServerState = iota
	StateReady
	StateError
	StateStopped
)

// Client is a stub LSP client. In the upstream, this wraps a full
// Language Server Protocol client with stdio transport.
type Client struct {
	state ServerState
}

// NewClient creates a new stub LSP client.
func NewClient(ctx context.Context, command string, args ...string) (*Client, error) {
	return &Client{state: StateStarting}, nil
}

// InitializeLSPClient performs stub initialization.
func (c *Client) InitializeLSPClient(ctx context.Context, workspaceRoot string) (interface{}, error) {
	return nil, nil
}

// WaitForServerReady is a stub that returns immediately.
func (c *Client) WaitForServerReady(ctx context.Context) error {
	return nil
}

// SetServerState sets the server state.
func (c *Client) SetServerState(state ServerState) {
	c.state = state
}

// Shutdown performs stub shutdown.
func (c *Client) Shutdown(ctx context.Context) error {
	c.state = StateStopped
	return nil
}

// Close performs stub close.
func (c *Client) Close() {
	c.state = StateStopped
}

// GetDiagnostics returns the current diagnostics map (stub: always empty).
func (c *Client) GetDiagnostics() map[protocol.DocumentUri][]protocol.Diagnostic {
	return make(map[protocol.DocumentUri][]protocol.Diagnostic)
}

// OpenFile notifies the server that a file was opened (stub: no-op).
func (c *Client) OpenFile(ctx context.Context, filePath string) error {
	return nil
}

// IsFileOpen returns whether a file is currently open (stub: always false).
func (c *Client) IsFileOpen(filePath string) bool {
	return false
}

// NotifyChange notifies the server that a file changed (stub: no-op).
func (c *Client) NotifyChange(ctx context.Context, filePath string) error {
	return nil
}

// RegisterNotificationHandler registers a handler for a notification method (stub: no-op).
func (c *Client) RegisterNotificationHandler(method string, handler func(params json.RawMessage)) {
}

// HandleDiagnostics is a package-level stub for processing diagnostic notifications.
func HandleDiagnostics(client *Client, params json.RawMessage) {
}
