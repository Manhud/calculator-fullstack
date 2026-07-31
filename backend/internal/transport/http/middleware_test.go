package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testOrigin = "http://localhost:5173"

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	})
}

func TestCORSAllowsTheConfiguredOrigin(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calculations", nil)
	req.Header.Set("Origin", testOrigin)
	rec := httptest.NewRecorder()

	CORS(testOrigin)(okHandler()).ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != testOrigin {
		t.Errorf("Allow-Origin = %q, want %q", got, testOrigin)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

// The origin is compared, not echoed. Reflecting whatever arrived would allow
// every site while looking like a check.
func TestCORSRefusesAnotherOrigin(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calculations", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()

	CORS(testOrigin)(okHandler()).ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Allow-Origin = %q, want it absent", got)
	}
	// The request still succeeds: CORS is enforced by the browser, and refusing
	// to answer would break non-browser clients such as curl.
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

// Without Vary, a shared cache can hand one origin's CORS headers to another.
func TestCORSAlwaysVariesOnOrigin(t *testing.T) {
	t.Parallel()
	for _, origin := range []string{testOrigin, "https://evil.example", ""} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/calculations", nil)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		rec := httptest.NewRecorder()

		CORS(testOrigin)(okHandler()).ServeHTTP(rec, req)

		if got := rec.Header().Get("Vary"); !strings.Contains(got, "Origin") {
			t.Errorf("origin %q: Vary = %q, want it to contain Origin", origin, got)
		}
	}
}

// Preflight is answered by the middleware. The mux only matches POST and GET, so
// without this an OPTIONS request would get a 405 and the browser would block
// the real request.
func TestCORSAnswersPreflight(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/calculations", nil)
	req.Header.Set("Origin", testOrigin)
	rec := httptest.NewRecorder()

	reached := false
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached = true })
	CORS(testOrigin)(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if reached {
		t.Error("preflight reached the next handler; it should stop at the middleware")
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Error("preflight response carries no Allow-Methods")
	}
}

func TestRecoverTurnsAPanicIntoAResponse(t *testing.T) {
	t.Parallel()
	panicking := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	// The assertion is partly that this returns at all: without Recover the panic
	// unwinds past the test.
	Recover(panicking).ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	// The body matters as much as the status. A client that parses every
	// response as JSON throws on an empty body and never reaches its error
	// branch, so a panic would surface as a parse failure rather than a fault.
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	var got errorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("panic response is not valid JSON: %v (body: %q)", err, rec.Body.String())
	}
	if got.Error.Code != codeInternalError {
		t.Errorf("code = %q, want %q", got.Error.Code, codeInternalError)
	}
}

// Wrapping a ResponseWriter hides what the real one implements. net/http reaches
// through Unwrap for that, and MaxBytesReader needs it to mark an oversized
// request's connection for closing.
func TestStatusRecorderExposesTheUnderlyingWriter(t *testing.T) {
	t.Parallel()
	inner := httptest.NewRecorder()
	recorder := &statusRecorder{ResponseWriter: inner}

	if recorder.Unwrap() != http.ResponseWriter(inner) {
		t.Error("Unwrap did not return the wrapped writer")
	}
}

func TestRecoverLeavesNormalRequestsAlone(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	Recover(okHandler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestLoggingPassesTheRequestThrough(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	Logging(okHandler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if rec.Body.String() != `{"ok":true}` {
		t.Errorf("body = %q, want it unchanged", rec.Body.String())
	}
}

// A handler that writes a body without calling WriteHeader gets an implicit 200.
// The recorder has to notice that, or the log reports status 0.
func TestLoggingRecordsTheImplicitStatus(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	recorder := &statusRecorder{ResponseWriter: rec}

	recorder.Write([]byte("body"))

	if recorder.status != http.StatusOK {
		t.Errorf("status = %d, want %d", recorder.status, http.StatusOK)
	}
}

func TestLoggingRecordsAnExplicitStatus(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	recorder := &statusRecorder{ResponseWriter: rec}

	recorder.WriteHeader(http.StatusTeapot)
	recorder.Write([]byte("body"))

	if recorder.status != http.StatusTeapot {
		t.Errorf("status = %d, want %d", recorder.status, http.StatusTeapot)
	}
}

// Chain applies middleware outermost-first, which is the order they are written
// in at the call site. Reversed, a panic in the logger would escape recovery.
func TestChainAppliesInWrittenOrder(t *testing.T) {
	t.Parallel()
	var order []string
	mark := func(name string) Middleware {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				order = append(order, name)
				next.ServeHTTP(w, r)
			})
		}
	}
	final := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		order = append(order, "handler")
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	Chain(final, mark("first"), mark("second")).ServeHTTP(httptest.NewRecorder(), req)

	want := []string{"first", "second", "handler"}
	if len(order) != len(want) {
		t.Fatalf("order = %v, want %v", order, want)
	}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("order = %v, want %v", order, want)
		}
	}
}

func TestChainWithNoMiddlewareIsTheHandler(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	Chain(okHandler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}
