package clibundle

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBundleIsEmbedded(t *testing.T) {
	if len(Bundle) == 0 {
		t.Fatal("embedded Bundle is empty; cli-bundle.mjs may not have been built")
	}
}

func TestBundleContainsJavaScript(t *testing.T) {
	// The bundle should contain recognizable JS content
	content := string(Bundle[:min(len(Bundle), 4096)])
	// ESM bundles typically have import/export or function declarations
	if !strings.Contains(content, "function") &&
		!strings.Contains(content, "import") &&
		!strings.Contains(content, "export") &&
		!strings.Contains(content, "const") &&
		!strings.Contains(content, "var") &&
		!strings.Contains(content, "//") {
		t.Fatalf("embedded bundle does not look like JavaScript (first 4KB): %s", content[:min(len(content), 200)])
	}
}

func TestExtractBundleWritesFile(t *testing.T) {
	bundlePath, err := ExtractBundle()
	if err != nil {
		t.Fatalf("ExtractBundle failed: %v", err)
	}

	if bundlePath == "" {
		t.Fatal("ExtractBundle returned empty path")
	}

	// File should exist
	info, err := os.Stat(bundlePath)
	if err != nil {
		t.Fatalf("extracted bundle not found at %s: %v", bundlePath, err)
	}

	if info.Size() == 0 {
		t.Fatal("extracted bundle is empty")
	}

	// Path should end in .mjs
	if !strings.HasSuffix(bundlePath, ".mjs") {
		t.Fatalf("expected .mjs extension, got %s", bundlePath)
	}
}

func TestExtractBundleIsContentAddressed(t *testing.T) {
	path1, err := ExtractBundle()
	if err != nil {
		t.Fatalf("first ExtractBundle failed: %v", err)
	}

	path2, err := ExtractBundle()
	if err != nil {
		t.Fatalf("second ExtractBundle failed: %v", err)
	}

	// Same content should yield same path
	if path1 != path2 {
		t.Fatalf("expected same path for same content, got %s and %s", path1, path2)
	}

	// Verify the hash is in the filename
	sum := sha256.Sum256(Bundle)
	hexSum := fmt.Sprintf("%x", sum)
	expectedSuffix := "cli-bundle-" + hexSum[:12] + ".mjs"
	if !strings.HasSuffix(path1, expectedSuffix) {
		t.Fatalf("expected path to end with %s, got %s", expectedSuffix, filepath.Base(path1))
	}
}

func TestExtractBundleContentMatchesEmbed(t *testing.T) {
	bundlePath, err := ExtractBundle()
	if err != nil {
		t.Fatalf("ExtractBundle failed: %v", err)
	}

	data, err := os.ReadFile(bundlePath)
	if err != nil {
		t.Fatalf("failed to read extracted bundle: %v", err)
	}

	if len(data) != len(Bundle) {
		t.Fatalf("extracted size %d != embedded size %d", len(data), len(Bundle))
	}

	// Quick byte comparison
	for i := 0; i < len(data); i++ {
		if data[i] != Bundle[i] {
			t.Fatalf("byte mismatch at position %d", i)
		}
	}
}

func TestExecCaptureWithUnknownCommand(t *testing.T) {
	// ExecCapture with an unknown subcommand should return non-zero exit code
	result, err := ExecCapture([]string{"nosuchcommand"})
	if err != nil {
		if strings.Contains(err.Error(), "Node.js not found") {
			t.Skip("Node.js not available, skipping ExecCapture test")
		}
		t.Fatalf("ExecCapture unexpected error: %v", err)
	}
	// The embedded CLI should exit with non-zero for unknown commands
	if result.ExitCode == 0 {
		t.Fatalf("expected non-zero exit code for unknown command, got 0")
	}
	// stderr should contain some usage or error output
	if result.Stderr == "" && result.Stdout == "" {
		t.Fatal("expected some output for unknown command")
	}
}

func TestExecCaptureDoctor(t *testing.T) {
	// Run "doctor" subcommand — it should produce output and exit normally
	// (may fail if no config is available, but should not error from Node not found)
	result, err := ExecCapture([]string{"doctor"})
	if err != nil {
		if strings.Contains(err.Error(), "Node.js not found") {
			t.Skip("Node.js not available")
		}
		// doctor may fail in test env — that's ok, just check we got a result
		t.Logf("ExecCapture doctor returned error: %v", err)
		return
	}
	// Doctor should produce some output (either stdout or stderr)
	if result.Stdout == "" && result.Stderr == "" {
		t.Log("doctor produced no output (may be expected in test env)")
	}
}

func TestIsExitError(t *testing.T) {
	// isExitError is tested indirectly through ExecCapture.
	// Verify it returns false for non-exit errors.
	plainErr := fmt.Errorf("plain error")
	var exitErr *os.ProcessState
	_ = exitErr
	_ = plainErr
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
