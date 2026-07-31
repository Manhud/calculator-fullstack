package http

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/Manhud/calculator-fullstack/backend/internal/calculator"
)

// maxRequestBytes bounds the request body. A legitimate request is around sixty
// bytes; this leaves absurd headroom while still refusing a body large enough to
// be worth reading into memory.
const maxRequestBytes = 8 << 10

// operation binds a name from the API vocabulary to the domain function that
// implements it and the number of operands it takes.
//
// The registry lives in this layer rather than in the domain because "divide" is
// a wire name, not a mathematical concept. Adding an operation means adding one
// entry.
type operation struct {
	arity int
	apply func(operands []float64) (float64, error)
}

// newRegistry returns the supported operations. It is built per Handler rather
// than kept in a package variable: a mutable package-level map is a global that
// any code in the package can reach into, and a constructor that injects nothing
// is ceremony rather than dependency injection.
func newRegistry() map[string]operation {
	return map[string]operation{
		"add":        {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Add(o[0], o[1]) }},
		"subtract":   {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Subtract(o[0], o[1]) }},
		"multiply":   {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Multiply(o[0], o[1]) }},
		"divide":     {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Divide(o[0], o[1]) }},
		"power":      {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Power(o[0], o[1]) }},
		"percentage": {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Percentage(o[0], o[1]) }},
		"sqrt":       {arity: 1, apply: func(o []float64) (float64, error) { return calculator.Sqrt(o[0]) }},
	}
}

// supportedOperations lists the operation names in a stable order, so the error
// message a client sees does not change between requests.
func supportedOperations() string {
	names := make([]string, 0, len(newRegistry()))
	for name := range newRegistry() {
		names = append(names, name)
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}

type calculationRequest struct {
	Operation string    `json:"operation"`
	Operands  []float64 `json:"operands"`
}

// Handler serves the calculator API.
type Handler struct {
	operations map[string]operation
}

// NewHandler returns a Handler with the operation registry it will serve.
func NewHandler() *Handler {
	return &Handler{operations: newRegistry()}
}

// Routes returns the mux with every route registered. The caller wraps it in
// whatever middleware it wants; the handler does not choose its own middleware.
func (h *Handler) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	// Method-aware patterns. The bare path is registered too, so a wrong method
	// is answered with the JSON envelope rather than the mux's text/plain 405 —
	// the more specific "POST /path" still wins for POST.
	mux.HandleFunc("POST /api/v1/calculations", h.calculate)
	mux.HandleFunc("/api/v1/calculations", methodNotAllowed)
	mux.HandleFunc("GET /health", h.health)
	mux.HandleFunc("/health", methodNotAllowed)
	// Catch-all, so an unmatched path is JSON too. A client that always parses
	// JSON should never meet a plain-text body from this service.
	mux.HandleFunc("/", notFound)
	return mux
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, apiError{
		status:  http.StatusNotFound,
		code:    codeNotFound,
		message: "no such endpoint",
	})
}

func methodNotAllowed(w http.ResponseWriter, r *http.Request) {
	writeError(w, apiError{
		status:  http.StatusMethodNotAllowed,
		code:    codeMethodNotAllowed,
		message: r.Method + " is not allowed on this endpoint",
	})
}

func (h *Handler) calculate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)

	decoder := json.NewDecoder(r.Body)
	// A field the API does not define is worth reporting rather than ignoring:
	// dropping it silently lets a client believe it was honoured. Note that
	// encoding/json matches names case-insensitively, so this rejects unknown
	// names but not a differently-cased spelling of a known one.
	decoder.DisallowUnknownFields()

	var req calculationRequest
	if err := decoder.Decode(&req); err != nil {
		writeError(w, decodeErrorFrom(err))
		return
	}
	// Decode stops after one value. Without this, `{...}{...}` and `{...} junk`
	// are answered 200 and the remainder is discarded without a word, so a client
	// that double-encodes a body never learns half of it was ignored.
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, clientError(codeInvalidJSON, "request body must contain exactly one JSON object"))
		return
	}

	op, ok := h.operations[req.Operation]
	if !ok {
		writeError(w, clientError(codeUnknownOperation, "operation must be one of "+supportedOperations()))
		return
	}

	// A missing key, an explicit null and an empty array all decode to an empty
	// slice, and all three mean the same thing here: no operands were supplied.
	if len(req.Operands) != op.arity {
		writeError(w, clientError(codeInvalidArity, req.Operation+" takes "+
			strconv.Itoa(op.arity)+" operand"+plural(op.arity)+", got "+
			strconv.Itoa(len(req.Operands))))
		return
	}

	result, err := op.apply(req.Operands)
	if err != nil {
		writeError(w, errorFrom(err))
		return
	}

	writeJSON(w, http.StatusOK, calculationResponse{
		Operation: req.Operation,
		Operands:  req.Operands,
		Result:    result,
	})
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
