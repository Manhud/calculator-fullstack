// Package calculator implements the arithmetic the API exposes.
//
// It knows nothing about how it is reached: no transport, no serialisation, no
// status codes. The errors below are sentinel values, and the transport layer
// matches them with errors.Is to produce the wire format. Keeping the mapping
// out of here is what allows the arithmetic to be tested without a server.
package calculator

import "errors"

var (
	// ErrInvalidOperand reports an operand that is NaN or ±Inf. Such values
	// arrive from a request body containing a literal like 1e400, which decodes
	// successfully into +Inf rather than failing as malformed JSON.
	ErrInvalidOperand = errors.New("operand must be a finite number")

	// ErrDivisionByZero reports a zero divisor. Negative zero is zero, so it is
	// refused too rather than producing -Inf.
	ErrDivisionByZero = errors.New("cannot divide by zero")

	// ErrNegativeSqrt reports a square root of a negative number. Negative zero
	// is not negative and is accepted.
	ErrNegativeSqrt = errors.New("cannot take the square root of a negative number")

	// ErrResultNotFinite reports a result that overflowed to ±Inf or is NaN.
	// It is returned before the value escapes the package: JSON cannot represent
	// either, so encoding one would fail at the edge instead of here.
	ErrResultNotFinite = errors.New("result is not a finite number")
)
