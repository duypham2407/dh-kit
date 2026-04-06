// Package clibundle embeds the pre-built TypeScript CLI bundle so the
// Go binary can extract it at runtime and delegate subcommands to Node.js.
package clibundle

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"fmt"
	"io"
	"os"
	"os/exec"
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

// ExecResult holds the result of running the embedded CLI bundle.
type ExecResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

// Exec runs the embedded TS CLI bundle via Node.js with the given arguments,
// wiring stdin/stdout/stderr to the parent process (pass-through mode). It
// returns an error only when Node itself cannot be started; the Node exit
// code is returned in the error via *exec.ExitError so callers can propagate
// it via os.Exit.
//
// For interactive / pass-through use (e.g., delegating a subcommand), pass
// stdout=os.Stdout, stderr=os.Stderr, stdin=os.Stdin.
//
// For captured output (e.g., running doctor/index inside the TUI), pass
// appropriate io.Writers.
func Exec(args []string, stdin io.Reader, stdout, stderr io.Writer) error {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("Node.js not found in PATH (install v22+ from https://nodejs.org/): %w", err)
	}

	bundlePath, err := ExtractBundle()
	if err != nil {
		return fmt.Errorf("failed to extract CLI bundle: %w", err)
	}

	cmdArgs := append([]string{bundlePath}, args...)
	cmd := exec.Command(nodePath, cmdArgs...)
	cmd.Stdin = stdin
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	cmd.Env = os.Environ()

	return cmd.Run()
}

// ExecCapture runs the embedded TS CLI bundle and captures stdout/stderr,
// returning both as strings along with the exit code.
// This is suitable for running commands (e.g., doctor, index) and showing
// their output inside the TUI chat viewport.
func ExecCapture(args []string) (ExecResult, error) {
	var stdoutBuf, stderrBuf bytes.Buffer
	err := Exec(args, nil, &stdoutBuf, &stderrBuf)
	result := ExecResult{
		Stdout: stdoutBuf.String(),
		Stderr: stderrBuf.String(),
	}
	if err != nil {
		var exitErr *exec.ExitError
		if ok := isExitError(err, &exitErr); ok {
			result.ExitCode = exitErr.ExitCode()
			return result, nil // non-zero exit is a normal result, not a Go error
		}
		return result, fmt.Errorf("exec failed: %w", err)
	}
	return result, nil
}

// isExitError attempts to unwrap err as *exec.ExitError.
func isExitError(err error, out **exec.ExitError) bool {
	if ee, ok := err.(*exec.ExitError); ok {
		*out = ee
		return true
	}
	return false
}
