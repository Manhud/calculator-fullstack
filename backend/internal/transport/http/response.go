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

	// Routing faults. They are client faults like the rest, but they are about
	// the request line rather than the body: answering "no such endpoint" with
	// INVALID_JSON would name a cause that has nothing to do with the failure.
	codeNotFound         = "NOT_FOUND"
	codeMethodNotAllowed = "METHOD_NOT_ALLOWED"

	// codeInternalError is the only server fault, and the only code answered
	// with a status other than 400. It exists so that a bug here is never
	// reported to the client as a mistake the client made.
	codeInternalError = "INTERNAL_ERROR"
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

// apiError is the decided outcome of a failed request: the status, the wire code
// and the message. It deliberately does not implement error — giving it an Error
// method would invite callers to wrap it and then re-derive the code from a
// string, which is the thing sentinel errors exist to avoid.
type apiError struct {
	status  int
	code    string
	message string
}

// clientError builds a 400. Every client fault shares one status because the
// code carries the meaning; splitting across 400 and 422 would add a distinction
// no client acts on.
func clientError(code, message string) apiError {
	return apiError{status: http.StatusBadRequest, code: code, message: message}
}

// internalError builds a 500 carrying the same envelope, so a client can branch
// on a code rather than on a parse failure.
func internalError() apiError {
	return apiError{
		status:  http.StatusInternalServerError,
		code:    codeInternalError,
		message: "the request could not be processed",
	}
}

// errorFrom maps a domain error onto its wire code.
//
// Every sentinel in the calculator package appears here. ErrInvalidOperand is
// among them even though no request can trigger it — encoding/json rejects
// out-of-range numbers before they reach the domain — because leaving a sentinel
// unmapped would degrade it to a server error if that ever changed.
func errorFrom(err error) apiError {
	switch {
	case errors.Is(err, calculator.ErrDivisionByZero):
		return clientError(codeDivisionByZero, "cannot divide by zero")
	case errors.Is(err, calculator.ErrNegativeSqrt):
		return clientError(codeNegativeSqrt, "cannot take the square root of a negative number")
	case errors.Is(err, calculator.ErrResultNotFinite):
		return clientError(codeResultOverflow, "the result is too large to represent")
	case errors.Is(err, calculator.ErrInvalidOperand):
		return clientError(codeInvalidOperand, "operands must be finite numbers")
	default:
		// An error the domain does not define is a bug here, not a bad request.
		// Reporting it as a client fault would send the caller off to fix input
		// that was never the problem, and leave no trace of the real failure.
		slog.Error("unmapped domain error", "error", err)
		return internalError()
	}
}

// decodeErrorFrom maps a decoding failure onto its wire code.
//
// The distinctions are not cosmetic. NaN and Infinity are not JSON syntax and
// arrive as *json.SyntaxError, so they are malformed bodies. An out-of-range
// literal such as 1e400 is syntactically valid and arrives as
// *json.UnmarshalTypeError against the operands field, so it is a bad operand
// rather than a bad body.
func decodeErrorFrom(err error) apiError {
	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		switch typeErr.Field {
		case "operands":
			return clientError(codeInvalidOperand, "operands must be an array of finite numbers")
		case "operation":
			return clientError(codeUnknownOperation, "operation must be one of "+supportedOperations())
		default:
			// An empty Field means the mismatch is the document itself — a body
			// of [1,2] or "hello" rather than an object. Calling that a bad
			// operand would name a field the body does not even contain.
			return clientError(codeInvalidJSON, "request body must be a JSON object")
		}
	}

	var syntaxErr *json.SyntaxError
	switch {
	case errors.As(err, &syntaxErr):
		return clientError(codeInvalidJSON, "request body is not valid JSON")
	case errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF):
		return clientError(codeInvalidJSON, "request body is empty or incomplete")
	case isUnknownFieldError(err):
		return clientError(codeInvalidJSON, "request body contains an unrecognised field")
	}
	// Covers MaxBytesReader's oversize error among others. The body is unusable
	// either way, and it is still the client's body.
	return clientError(codeInvalidJSON, "request body could not be read")
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

// writeError sends an error envelope with the status the error carries.
func writeError(w http.ResponseWriter, apiErr apiError) {
	writeJSON(w, apiErr.status, errorResponse{Error: errorBody{
		Code:    apiErr.code,
		Message: apiErr.message,
	}})
}
