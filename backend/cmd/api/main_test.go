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

// Shutdown's contract is that a request already being served finishes. The
// earlier version of this test closed its request before cancelling, so nothing
// was ever in flight and replacing Shutdown with listener.Close() would have
// passed it. This one holds a handler open across the cancellation.
func TestServeDrainsInFlightRequests(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	started := make(chan struct{})
	release := make(chan struct{})
	slow := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		<-release
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("finished"))
	})

	ctx, cancel := context.WithCancel(context.Background())
	served := make(chan error, 1)
	go func() { served <- serve(ctx, listener, newServer(slow)) }()

	response := make(chan string, 1)
	go func() {
		resp, err := http.Get("http://" + listener.Addr().String() + "/slow")
		if err != nil {
			response <- "request failed: " + err.Error()
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		response <- string(body)
	}()

	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("the handler never started")
	}

	// Cancel while the handler is still inside its ServeHTTP call.
	cancel()
	// Give Shutdown a moment to begin before the handler returns, so the drain
	// is genuinely exercised rather than won by a race.
	time.Sleep(50 * time.Millisecond)
	close(release)

	select {
	case body := <-response:
		if body != "finished" {
			t.Errorf("in-flight response = %q, want %q", body, "finished")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("the in-flight request never completed")
	}

	select {
	case err := <-served:
		if err != nil {
			t.Errorf("serve returned %v, want nil", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("serve did not return after draining")
	}
}

// The timeouts are the kind of setting that is deleted during a refactor and
// missed by every test, because nothing observable changes until production.
func TestNewServerSetsTimeouts(t *testing.T) {
	t.Parallel()
	server := newServer(http.NotFoundHandler())

	cases := []struct {
		name string
		got  time.Duration
	}{
		{"ReadHeaderTimeout", server.ReadHeaderTimeout},
		{"ReadTimeout", server.ReadTimeout},
		{"WriteTimeout", server.WriteTimeout},
		{"IdleTimeout", server.IdleTimeout},
	}
	for _, tc := range cases {
		if tc.got <= 0 {
			t.Errorf("%s = %v, want a positive duration", tc.name, tc.got)
		}
	}
}

// The origin reaches the middleware from run's argument. Wiring CORS("") would
// otherwise leave every other test green.
func TestRunAppliesTheAllowedOrigin(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	const origin = "http://localhost:5173"

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- run(ctx, listener, origin) }()

	if _, err := waitForHealth(t, listener.Addr().String()); err != nil {
		t.Fatalf("health: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost,
		"http://"+listener.Addr().String()+"/api/v1/calculations",
		strings.NewReader(`{"operation":"add","operands":[1,2]}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Origin", origin)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != origin {
		t.Errorf("Allow-Origin = %q, want %q", got, origin)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), `"result":3`) {
		t.Errorf("body = %s, want it to contain a result of 3", body)
	}

	cancel()
	<-done
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
