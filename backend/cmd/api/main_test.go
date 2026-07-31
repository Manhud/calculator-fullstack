package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// Serves on a real listener, makes a real request, then cancels the context and
// asserts that run returns. Graceful shutdown is the kind of claim that is
// usually made in a comment and never checked; this checks it.
func TestRunServesAndShutsDownOnContextCancel(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := listener.Addr().String()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, listener, "http://localhost:5173") }()

	resp, err := waitForHealth(t, addr)
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if !strings.Contains(string(body), `"status":"ok"`) {
		t.Errorf("body = %s, want it to report ok", body)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("run returned %v, want nil after a clean shutdown", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run did not return within 5s of cancellation")
	}

	// The listener must be closed, not merely abandoned.
	if _, err := net.DialTimeout("tcp", addr, 200*time.Millisecond); err == nil {
		t.Error("the port still accepts connections after shutdown")
	}
}

// The server starts asynchronously, so poll briefly rather than sleeping a fixed
// amount and hoping.
func waitForHealth(t *testing.T, addr string) (*http.Response, error) {
	t.Helper()
	var lastErr error
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get("http://" + addr + "/health")
		if err == nil {
			return resp, nil
		}
		lastErr = err
		time.Sleep(10 * time.Millisecond)
	}
	return nil, lastErr
}

// A listener already closed makes Serve fail immediately; run must surface that
// error rather than blocking until the context is cancelled.
func TestRunReturnsServeError(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	listener.Close()

	done := make(chan error, 1)
	go func() { done <- run(context.Background(), listener, "http://localhost:5173") }()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("run returned nil, want the listener error")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run did not return the listener error")
	}
}

func TestEnvOr(t *testing.T) {
	const key = "CALCULATOR_TEST_ENV"

	t.Run("falls back when unset", func(t *testing.T) {
		os.Unsetenv(key)
		if got := envOr(key, "fallback"); got != "fallback" {
			t.Errorf("= %q, want %q", got, "fallback")
		}
	})

	// An empty variable is treated as unset: PORT="" in a compose file should not
	// make the server listen on ":".
	t.Run("falls back when empty", func(t *testing.T) {
		t.Setenv(key, "")
		if got := envOr(key, "fallback"); got != "fallback" {
			t.Errorf("= %q, want %q", got, "fallback")
		}
	})

	t.Run("uses the value when set", func(t *testing.T) {
		t.Setenv(key, "9090")
		if got := envOr(key, "fallback"); got != "9090" {
			t.Errorf("= %q, want %q", got, "9090")
		}
	})
}
