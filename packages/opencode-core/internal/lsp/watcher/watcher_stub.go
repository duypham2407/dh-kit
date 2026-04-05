// Package watcher provides a stub workspace watcher for dh fork compilation.
package watcher

import (
	"context"

	"github.com/duypham93/dh/packages/opencode-core/internal/lsp"
)

// WorkspaceWatcher is a stub that monitors file changes.
type WorkspaceWatcher struct {
	client *lsp.Client
}

// NewWorkspaceWatcher creates a new stub workspace watcher.
func NewWorkspaceWatcher(client *lsp.Client) *WorkspaceWatcher {
	return &WorkspaceWatcher{client: client}
}

// WatchWorkspace is a stub that blocks until context cancellation.
func (w *WorkspaceWatcher) WatchWorkspace(ctx context.Context, workspaceRoot string) {
	<-ctx.Done()
}
