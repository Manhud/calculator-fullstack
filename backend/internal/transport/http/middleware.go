package http

import (
	"log/slog"
	"net/http"
	"time"
)

// Middleware wraps a handler. Composed by Chain rather than by a router, so the
// order is visible at the call site in main.
type Middleware func(http.Handler) http.Handler

// Chain applies middleware so that the first argument is the outermost wrapper,
// which is the order they are written in at the call site.
func Chain(h http.Handler, middlewares ...Middleware) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

// CORS allows a single configured origin.
//
// The origin is echoed only when it matches, rather than reflecting whatever the
// caller sent: reflecting the request's Origin header would allow every site,
// which is what a wildcard does but disguised as a check.
func CORS(allowedOrigin string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && origin == allowedOrigin {
				w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
				w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
			// Vary matters even when the origin did not match: without it a shared
			// cache can serve a response containing one origin's CORS headers to a
			// request from another.
			w.Header().Add("Vary", "Origin")

			// Preflight is answered here. It never reaches the mux, whose patterns
			// only match POST and GET and would otherwise answer 405.
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Recover turns a panic into a 500 instead of a dropped connection, and logs it
// with the stack left to the runtime.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("panic serving request",
					"error", recovered, "method", r.Method, "path", r.URL.Path)
				// The envelope matters as much as the status: a client that
				// parses every response as JSON would otherwise throw on an
				// empty body and never reach its error branch.
				//
				// If the handler already wrote a status this is a no-op with a
				// log line from net/http — the response is already on the wire
				// and cannot be corrected.
				writeError(w, internalError())
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// statusRecorder captures the status code, which http.ResponseWriter does not
// expose once written.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// Write records the implicit 200 that net/http writes when a handler writes a
// body without calling WriteHeader first.
func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(b)
}

// Unwrap exposes the writer underneath.
//
// Wrapping a ResponseWriter hides whatever the real one implements beyond the
// interface, and net/http reaches for those: http.ResponseController finds the
// original through Unwrap, and http.MaxBytesReader needs the real writer to mark
// an oversized request's connection for closing. Without this the request is
// still refused, but the connection is left to drain a body already known to be
// too large.
func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// Logging records one structured line per request.
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(recorder, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", recorder.status,
			"duration", time.Since(start),
		)
	})
}
