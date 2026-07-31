// Command api serves the calculator HTTP API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	calchttp "github.com/Manhud/calculator-fullstack/backend/internal/transport/http"
)

const (
	defaultPort          = "8080"
	defaultAllowedOrigin = "http://localhost:5173"

	readHeaderTimeout = 5 * time.Second
	readTimeout       = 10 * time.Second
	writeTimeout      = 10 * time.Second
	idleTimeout       = 60 * time.Second
	shutdownGrace     = 10 * time.Second
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	// Registered before the listener opens, so a signal arriving during startup
	// is not missed.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	listener, err := net.Listen("tcp", ":"+envOr("PORT", defaultPort))
	if err != nil {
		slog.Error("cannot listen", "error", err)
		os.Exit(1)
	}

	if err := run(ctx, listener, envOr("ALLOWED_ORIGIN", defaultAllowedOrigin)); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}

// run serves until ctx is cancelled, then drains in-flight requests.
//
// It takes a listener rather than an address so that a test can bind port zero
// and still know where to send a request. That is what makes graceful shutdown
// verifiable instead of merely asserted in a comment.
func run(ctx context.Context, listener net.Listener, allowedOrigin string) error {
	handler := calchttp.NewHandler()
	// Outermost first: recovery wraps logging so a panic inside logging is still
	// caught, and both wrap CORS so a failed request keeps its CORS headers.
	root := calchttp.Chain(handler.Routes(),
		calchttp.Recover,
		calchttp.Logging,
		calchttp.CORS(allowedOrigin),
	)

	server := &http.Server{
		Handler: root,
		// Without ReadHeaderTimeout a client can hold a connection open by
		// sending headers one byte at a time.
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}

	serverErr := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", listener.Addr().String(), "allowed_origin", allowedOrigin)
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		slog.Info("shutting down")
	}

	// Shutdown stops accepting connections and waits for in-flight requests. The
	// deadline bounds that wait so a stuck handler cannot block exit forever.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		return err
	}
	slog.Info("stopped")
	return nil
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
