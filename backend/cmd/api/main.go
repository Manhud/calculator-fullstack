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

// run wires the application and serves it until ctx is cancelled.
//
// It takes a listener rather than an address so a test can bind port zero and
// still know where to send a request.
func run(ctx context.Context, listener net.Listener, allowedOrigin string) error {
	return serve(ctx, listener, newServer(rootHandler(allowedOrigin)))
}

// rootHandler assembles the routes and the middleware.
//
// Outermost first: recovery wraps logging so a panic inside logging is still
// caught, and both wrap CORS so a failed request keeps its CORS headers — a
// browser hides an error response that arrives without them, turning a readable
// 400 into an opaque network failure.
func rootHandler(allowedOrigin string) http.Handler {
	return calchttp.Chain(calchttp.NewHandler().Routes(),
		calchttp.Recover,
		calchttp.Logging,
		calchttp.CORS(allowedOrigin),
	)
}

// newServer applies the timeouts. Split out so the values are assertable rather
// than only readable: without ReadHeaderTimeout a client can hold a connection
// open by sending headers one byte at a time.
func newServer(handler http.Handler) *http.Server {
	return &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}
}

// serve runs the server until ctx is cancelled, then drains in-flight requests.
//
// Separate from run so a test can supply a deliberately slow handler and prove
// that a request already being served survives the shutdown. That claim is the
// whole point of Shutdown, and it cannot be checked through run, whose handler
// answers instantly.
func serve(ctx context.Context, listener net.Listener, server *http.Server) error {
	serverErr := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", listener.Addr().String())
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
