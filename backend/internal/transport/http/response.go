// Package http adapts the calculator domain to HTTP: it decodes requests,
// validates what the domain cannot express, maps domain errors onto the wire
// codes, and encodes responses. The domain has no idea it exists.
package http

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/Manhud/calculator-fullstack/backend/internal/calculator"
)

// The complete set of error codes, per CLAUDE.md Section 3. Nothing outside this
// set is ever written to a response.
const (
	codeInvalidJSON      = "INVALID_JSON"
	codeUnknownOperation = "UNKNOWN_OPERATION"
	codeInvalidArity     = "INVALID_ARITY"
	codeInvalidOperand   = "INVALID_OPERAND"
	codeDivisionByZero   = "DIVISION_BY_ZERO"
	codeNegativeSqrt     = "NEGATIVE_SQRT"
	codeResultOverflow   = "RESULT_OVERFLOW"
)

type calculationResponse struct {
	Operation string    `json:"operation"`
	Operands  []float64 `json:"operands"`
	Result    float64   `json:"result"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type errorResponse struct {
	Error errorBody `json:"error"`
}

// apiError is the wire code and message for a failed request. It deliberately
// does not implement error: it is the already-decided outcome, not something to
// be inspected further, and giving it an Error method would invite callers to
// wrap it and then re-derive the code from a string.
type apiError struct {
	code    string
	message string
}

// errorFrom maps a domain error onto its wire code.
//
// Every sentinel in the calculator package appears here. ErrInvalidOperand is
// among them even though no request can trigger it — encoding/json rejects
// out-of-range numbers before they reach the domain — because leaving a sentinel
// unmapped would silently degrade to a generic failure if that ever changed.
func errorFrom(err error) apiError {
	switch {
	case errors.Is(err, calculator.ErrDivisionByZero):
		return apiError{codeDivisionByZero, "cannot divide by zero"}
	case errors.Is(err, calculator.ErrNegativeSqrt):
		return apiError{codeNegativeSqrt, "cannot take the square root of a negative number"}
	case errors.Is(err, calculator.ErrResultNotFinite):
		return apiError{codeResultOverflow, "the result is too large to represent"}
	case errors.Is(err, calculator.ErrInvalidOperand):
		return apiError{codeInvalidOperand, "operands must be finite numbers"}
	default:
		// Unreachable while the domain returns only its own sentinels. Kept as a
		// closed default so an unmapped future error cannot escape as a 200.
		return apiError{codeInvalidOperand, "the request could not be calculated"}
	}
}

// decodeErrorFrom maps a decoding failure onto its wire code.
//
// The distinctions are not cosmetic. NaN and Infinity are not JSON syntax and
// arrive as *json.SyntaxError, so they are malformed bodies. An out-of-range
// literal such as 1e400 is syntactically valid and arrives as
// *json.UnmarshalTypeError, so it is a bad operand rather than a bad body.
func decodeErrorFrom(err error) apiError {
	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		if typeErr.Field == "operation" {
			return apiError{codeUnknownOperation, "operation must be one of " + supportedOperations()}
		}
		return apiError{codeInvalidOperand, "operands must be finite numbers"}
	}

	var syntaxErr *json.SyntaxError
	switch {
	case errors.As(err, &syntaxErr):
		return apiError{codeInvalidJSON, "request body is not valid JSON"}
	case errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF):
		return apiError{codeInvalidJSON, "request body is empty or incomplete"}
	case isUnknownFieldError(err):
		return apiError{codeInvalidJSON, "request body contains an unrecognised field"}
	}
	// Covers MaxBytesReader's oversize error among others. The closed code set
	// has no better bucket, and the body is unusable either way.
	return apiError{codeInvalidJSON, "request body could not be read"}
}

// isUnknownFieldError matches DisallowUnknownFields by message because
// encoding/json returns a plain error for it and exposes no type to assert on.
// Isolated here so the string match has exactly one place to break.
func isUnknownFieldError(err error) bool {
	return err != nil && strings.HasPrefix(err.Error(), "json: unknown field ")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		// The status and headers are already on the wire, so the response cannot
		// be corrected. Log it rather than attempting a second write, which would
		// append a second body to the first.
		slog.Error("encoding response", "error", err)
	}
}

// writeError sends an error envelope. Every client fault is 400: splitting them
// across 400 and 422 would add a distinction no client acts on, since the code
// carries the meaning.
func writeError(w http.ResponseWriter, apiErr apiError) {
	writeJSON(w, http.StatusBadRequest, errorResponse{Error: errorBody{
		Code:    apiErr.code,
		Message: apiErr.message,
	}})
}
