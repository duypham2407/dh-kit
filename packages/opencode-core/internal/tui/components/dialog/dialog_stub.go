// Package dialog provides stub TUI dialog types for dh fork compilation.
// The full TUI from upstream is deferred.
package dialog

// CompletionItem represents a single completion item.
type CompletionItem struct {
	Title string
	Value string
}

// CompletionItemI is the interface for completion items.
type CompletionItemI interface {
	GetTitle() string
	GetValue() string
}

// completionItemWrapper wraps CompletionItem to implement CompletionItemI.
type completionItemWrapper struct {
	item CompletionItem
}

func (w *completionItemWrapper) GetTitle() string { return w.item.Title }
func (w *completionItemWrapper) GetValue() string { return w.item.Value }

// NewCompletionItem creates a new CompletionItemI from a CompletionItem.
func NewCompletionItem(item CompletionItem) CompletionItemI {
	return &completionItemWrapper{item: item}
}

// CompletionProvider is the interface for providing completions.
type CompletionProvider interface {
	GetId() string
	GetEntry() CompletionItemI
	GetChildEntries(query string) ([]CompletionItemI, error)
}
