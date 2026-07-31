package calculator

import "math"

// Every operation follows the same order: reject non-finite operands, apply the
// operation's own precondition, compute, then reject a non-finite result. The
// order matters — Divide(1, 0) must report a zero divisor rather than the +Inf
// the division would have produced.

// checkOperands rejects NaN and ±Inf before they reach an operation, where they
// would propagate silently into the result.
func checkOperands(values ...float64) error {
	for _, v := range values {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return ErrInvalidOperand
		}
	}
	return nil
}

// checkResult refuses a value that cannot be represented in JSON. Returning zero
// alongside the error keeps callers from reading a partial result.
func checkResult(v float64) (float64, error) {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, ErrResultNotFinite
	}
	return v, nil
}

// Add returns a + b.
func Add(a, b float64) (float64, error) {
	if err := checkOperands(a, b); err != nil {
		return 0, err
	}
	return checkResult(a + b)
}

// Subtract returns a - b.
func Subtract(a, b float64) (float64, error) {
	if err := checkOperands(a, b); err != nil {
		return 0, err
	}
	return checkResult(a - b)
}

// Multiply returns a * b.
func Multiply(a, b float64) (float64, error) {
	if err := checkOperands(a, b); err != nil {
		return 0, err
	}
	return checkResult(a * b)
}

// Divide returns a / b, or ErrDivisionByZero when b is zero.
func Divide(a, b float64) (float64, error) {
	if err := checkOperands(a, b); err != nil {
		return 0, err
	}
	// Compares equal for both +0 and -0, so a negative zero divisor is refused
	// rather than producing -Inf.
	if b == 0 {
		return 0, ErrDivisionByZero
	}
	return checkResult(a / b)
}

// Power returns base raised to exponent.
//
// IEEE 754 defines a negative base with a non-integer exponent as NaN, so
// Power(-8, 1.0/3.0) is rejected rather than returning the real cube root. It is
// not special-cased: contradicting math.Pow would surprise anyone who knows it.
func Power(base, exponent float64) (float64, error) {
	if err := checkOperands(base, exponent); err != nil {
		return 0, err
	}
	return checkResult(math.Pow(base, exponent))
}

// Sqrt returns the square root of x, or ErrNegativeSqrt when x is negative.
func Sqrt(x float64) (float64, error) {
	if err := checkOperands(x); err != nil {
		return 0, err
	}
	// Negative zero has its sign bit set but its value is zero, so it is not
	// negative and passes. math.Signbit would reject it.
	if x < 0 {
		return 0, ErrNegativeSqrt
	}
	root := math.Sqrt(x)
	// math.Sqrt(-0.0) is -0.0. It compares equal to zero, so a test asserting
	// `want: 0` passes, but it serialises as "-0" and reaches the user's screen
	// that way. Normalising here keeps the sign out of the response.
	if root == 0 {
		return 0, nil
	}
	return checkResult(root)
}

// Percentage returns percent percent of the value: Percentage(50, 200) is 100.
//
// Multiplying before dividing is the accurate order for ordinary inputs:
// 10 * 0.1 / 100 is exactly 0.01, while (10 / 100) * 0.1 is 0.010000000000000002,
// because dividing first rounds a value that is then multiplied.
//
// It only fails at the extremes, where the product overflows although the answer
// is representable — 200 * 1e307 is +Inf, but 200% of 1e307 is not. Rather than
// trading everyday precision for that case, fall back to the other order when
// the product overflows. Both are exercised by tests.
func Percentage(percent, of float64) (float64, error) {
	if err := checkOperands(percent, of); err != nil {
		return 0, err
	}
	product := percent * of
	if math.IsInf(product, 0) {
		return checkResult(percent / 100 * of)
	}
	return checkResult(product / 100)
}
