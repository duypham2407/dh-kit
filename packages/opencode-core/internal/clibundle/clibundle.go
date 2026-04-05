// Package clibundle embeds the pre-built TypeScript CLI bundle so the
// Go binary can extract it at runtime and delegate subcommands to Node.js.
package clibundle

import (
	"crypto/sha256"
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
)

//go:embed cli-bundle.mjs
var Bundle []byte

// ExtractBundle writes the embedded CLI bundle to a deterministic cache
// path under the user's cache directory and returns the path.
// The file is content-addressed: it is only written when missing or when
// the SHA-256 of the existing file differs, so repeated invocations are
// cheap on the file-system.
func ExtractBundle() (string, error) {
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		// Fallback: use a temp directory
		cacheDir = os.TempDir()
	}

	dir := filepath.Join(cacheDir, "dh", "cli")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create cli cache dir: %w", err)
	}

	sum := sha256.Sum256(Bundle)
	hexSum := fmt.Sprintf("%x", sum)
	bundlePath := filepath.Join(dir, "cli-bundle-"+hexSum[:12]+".mjs")

	// Fast path: file already exists with matching content hash.
	if _, statErr := os.Stat(bundlePath); statErr == nil {
		return bundlePath, nil
	}

	if err := os.WriteFile(bundlePath, Bundle, 0o644); err != nil {
		return "", fmt.Errorf("write cli bundle: %w", err)
	}

	return bundlePath, nil
}
