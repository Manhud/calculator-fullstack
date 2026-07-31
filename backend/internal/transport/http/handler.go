package http

import (
	"encoding/json"
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
// The registry lives here rather than in the domain because "divide" is a wire
// name, not a mathematical concept. Adding an operation means adding one entry.
type operation struct {
	arity int
	apply func(operands []float64) (float64, error)
}

var operations = map[string]operation{
	"add":        {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Add(o[0], o[1]) }},
	"subtract":   {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Subtract(o[0], o[1]) }},
	"multiply":   {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Multiply(o[0], o[1]) }},
	"divide":     {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Divide(o[0], o[1]) }},
	"power":      {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Power(o[0], o[1]) }},
	"percentage": {arity: 2, apply: func(o []float64) (float64, error) { return calculator.Percentage(o[0], o[1]) }},
	"sqrt":       {arity: 1, apply: func(o []float64) (float64, error) { return calculator.Sqrt(o[0]) }},
}

// supportedOperations lists the operation names in a stable order, so the error
// message a client sees does not change between requests.
func supportedOperations() string {
	names := make([]string, 0, len(operations))
	for name := range operations {
		names = append(names, name)
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}

type calculationRequest struct {
	Operation string    `json:"operation"`
	Operands  []float64 `json:"operands"`
}

// Handler serves the calculator API. It holds no state; the struct exists so
// dependencies arrive through it rather than through package-level variables.
type Handler struct{}

// NewHandler returns a Handler.
func NewHandler() *Handler { return &Handler{} }

// Routes returns the mux with every route registered. The caller wraps it in
// whatever middleware it wants; the handler does not choose its own middleware.
func (h *Handler) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	// Method-aware patterns, so anything but POST on this path is answered with
	// 405 by the mux itself rather than by a check in the handler.
	mux.HandleFunc("POST /api/v1/calculations", h.calculate)
	mux.HandleFunc("GET /health", h.health)
	return mux
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) calculate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)

	decoder := json.NewDecoder(r.Body)
	// A field the API does not define is a mistake worth reporting rather than
	// ignoring: silently dropping it lets a client believe it was honoured.
	decoder.DisallowUnknownFields()

	var req calculationRequest
	if err := decoder.Decode(&req); err != nil {
		writeError(w, decodeErrorFrom(err))
		return
	}

	op, ok := operations[req.Operation]
	if !ok {
		writeError(w, apiError{codeUnknownOperation, "operation must be one of " + supportedOperations()})
		return
	}

	// A missing key, an explicit null and an empty array all decode to an empty
	// slice, and all three mean the same thing here: no operands were supplied.
	if len(req.Operands) != op.arity {
		writeError(w, apiError{codeInvalidArity, req.Operation + " takes " +
			strconv.Itoa(op.arity) + " operand" + plural(op.arity) + ", got " +
			strconv.Itoa(len(req.Operands))})
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
