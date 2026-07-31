package calculator

import (
	"errors"
	"math"
	"testing"
)

// Results are compared with exact equality rather than a tolerance. IEEE 754
// arithmetic is deterministic, so 10.0/4.0 is exactly 2.5 on every platform and
// 0.1+0.2 is exactly 0.30000000000000004. A tolerance here would not add
// robustness; it would hide a change in behaviour. The one case whose expected
// value cannot be written as a literal — an irrational result — is compared with
// an epsilon in TestPowerFractionalExponent, and says why.

type binaryCase struct {
	name    string
	a, b    float64
	want    float64
	wantErr error
}

type unaryCase struct {
	name    string
	x       float64
	want    float64
	wantErr error
}

func runBinary(t *testing.T, op func(float64, float64) (float64, error), cases []binaryCase) {
	t.Helper()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := op(tc.a, tc.b)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if tc.wantErr != nil {
				// A failed operation must not leak a partial result.
				if got != 0 {
					t.Errorf("result = %v alongside an error, want 0", got)
				}
				return
			}
			if got != tc.want {
				t.Errorf("result = %v, want %v", got, tc.want)
			}
		})
	}
}

func runUnary(t *testing.T, op func(float64) (float64, error), cases []unaryCase) {
	t.Helper()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := op(tc.x)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if tc.wantErr != nil {
				if got != 0 {
					t.Errorf("result = %v alongside an error, want 0", got)
				}
				return
			}
			if got != tc.want {
				t.Errorf("result = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestAdd(t *testing.T) {
	t.Parallel()
	runBinary(t, Add, []binaryCase{
		{name: "two positives", a: 2, b: 3, want: 5},
		{name: "mixed signs", a: -2, b: 3, want: 1},
		// Documents the float64 trade-off recorded in DESIGN.md rather than
		// pretending it away: this is why money would need decimal arithmetic.
		{name: "binary floating point is not decimal", a: 0.1, b: 0.2, want: 0.30000000000000004},
		{name: "overflow", a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrResultNotFinite},
	})
}

func TestSubtract(t *testing.T) {
	t.Parallel()
	runBinary(t, Subtract, []binaryCase{
		{name: "positive result", a: 5, b: 3, want: 2},
		{name: "negative result", a: 3, b: 5, want: -2},
		{name: "overflow towards negative infinity", a: -math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrResultNotFinite},
	})
}

func TestMultiply(t *testing.T) {
	t.Parallel()
	runBinary(t, Multiply, []binaryCase{
		{name: "two positives", a: 3, b: 4, want: 12},
		{name: "sign propagates", a: -3, b: 4, want: -12},
		{name: "zero absorbs", a: 0, b: 12345, want: 0},
		{name: "overflow", a: math.MaxFloat64, b: 2, wantErr: ErrResultNotFinite},
	})
}

func TestDivide(t *testing.T) {
	t.Parallel()
	runBinary(t, Divide, []binaryCase{
		{name: "exact quotient", a: 10, b: 4, want: 2.5},
		{name: "by zero", a: 10, b: 0, wantErr: ErrDivisionByZero},
		// -0.0 compares equal to 0, so the guard catches it. Without an explicit
		// case, a guard written as b == +0 would still pass every other test
		// while returning -Inf here.
		{name: "by negative zero", a: 10, b: math.Copysign(0, -1), wantErr: ErrDivisionByZero},
		{name: "zero over zero", a: 0, b: 0, wantErr: ErrDivisionByZero},
		// Underflow is a representable answer, not a failure.
		{name: "underflow to zero", a: math.SmallestNonzeroFloat64, b: math.MaxFloat64, want: 0},
	})
}

func TestPower(t *testing.T) {
	t.Parallel()
	runBinary(t, Power, []binaryCase{
		{name: "integer exponent", a: 2, b: 10, want: 1024},
		{name: "negative exponent", a: 2, b: -1, want: 0.5},
		{name: "negative base with integer exponent", a: -2, b: 3, want: -8},
		// math.Pow(0, -1) is +Inf: division by zero reached through exponentiation.
		{name: "zero to a negative exponent", a: 0, b: -1, wantErr: ErrResultNotFinite},
		{name: "overflow", a: 10, b: 400, wantErr: ErrResultNotFinite},
		// The real cube root of -8 is -2, but IEEE 754 defines pow(negative,
		// non-integer) as NaN. Rejected rather than special-cased; see DESIGN.md.
		{name: "cube root of a negative is NaN", a: -8, b: 1.0 / 3.0, wantErr: ErrResultNotFinite},
		{name: "zero to the zero is one by IEEE 754", a: 0, b: 0, want: 1},
	})
}

func TestPowerFractionalExponent(t *testing.T) {
	t.Parallel()
	// The only assertion in this package that uses a tolerance: the expected
	// value is irrational and cannot be written exactly as a literal.
	const epsilon = 1e-12
	got, err := Power(2, 0.5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if math.Abs(got-math.Sqrt2) > epsilon {
		t.Errorf("result = %v, want %v within %v", got, math.Sqrt2, epsilon)
	}
}

func TestSqrt(t *testing.T) {
	t.Parallel()
	runUnary(t, Sqrt, []unaryCase{
		{name: "perfect square", x: 9, want: 3},
		{name: "zero", x: 0, want: 0},
		{name: "negative", x: -1, wantErr: ErrNegativeSqrt},
		// Negative zero carries a sign bit but its value is zero, so it is not
		// negative. A guard written with math.Signbit would wrongly reject it.
		{name: "negative zero is not negative", x: math.Copysign(0, -1), want: 0},
		{name: "largest representable", x: math.MaxFloat64, want: 1.3407807929942596e+154},
	})
}

func TestPercentage(t *testing.T) {
	t.Parallel()
	runBinary(t, Percentage, []binaryCase{
		{name: "fifty percent of two hundred", a: 50, b: 200, want: 100},
		{name: "two hundred percent of fifty", a: 200, b: 50, want: 100},
		{name: "negative percentage", a: -10, b: 200, want: -20},
		{name: "zero percent", a: 0, b: 200, want: 0},
		{name: "overflow", a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrResultNotFinite},
		// Multiplying first is exact here; dividing first gives
		// 0.010000000000000002. This case is the reason for the order.
		{name: "exact in the ordinary case", a: 10, b: 0.1, want: 0.01},
		{name: "small percentage of a small value", a: 5, b: 0.2, want: 0.01},
		// The product overflows while the answer is representable, so the
		// fallback order runs. Without it this would report an overflow.
		{name: "product overflows but the answer does not", a: 200, b: 1e307, want: 2e307},
	})
}

// -0.0 compares equal to 0.0, so a table assertion of `want: 0` cannot see a
// negative zero escaping. It matters because it serialises as "-0" and reaches
// the user's screen.
func TestSqrtNeverReturnsNegativeZero(t *testing.T) {
	t.Parallel()
	for _, x := range []float64{0, math.Copysign(0, -1)} {
		got, err := Sqrt(x)
		if err != nil {
			t.Fatalf("Sqrt(%v) returned %v", x, err)
		}
		if math.Signbit(got) {
			t.Errorf("Sqrt(%v) = %v, which carries a negative sign bit", x, got)
		}
	}
}

// Every operation refuses NaN and ±Inf on input, in either position. Driven from
// one table so that adding an operation cannot quietly skip its input validation.
func TestOperationsRejectNonFiniteOperands(t *testing.T) {
	t.Parallel()

	binaries := []struct {
		name string
		op   func(float64, float64) (float64, error)
	}{
		{"Add", Add},
		{"Subtract", Subtract},
		{"Multiply", Multiply},
		{"Divide", Divide},
		{"Power", Power},
		{"Percentage", Percentage},
	}
	nonFinite := []struct {
		name  string
		value float64
	}{
		{"NaN", math.NaN()},
		{"PositiveInfinity", math.Inf(1)},
		{"NegativeInfinity", math.Inf(-1)},
	}

	for _, op := range binaries {
		for _, nf := range nonFinite {
			t.Run(op.name+"/"+nf.name+"/first", func(t *testing.T) {
				t.Parallel()
				if _, err := op.op(nf.value, 1); !errors.Is(err, ErrInvalidOperand) {
					t.Errorf("error = %v, want %v", err, ErrInvalidOperand)
				}
			})
			t.Run(op.name+"/"+nf.name+"/second", func(t *testing.T) {
				t.Parallel()
				if _, err := op.op(1, nf.value); !errors.Is(err, ErrInvalidOperand) {
					t.Errorf("error = %v, want %v", err, ErrInvalidOperand)
				}
			})
		}
	}

	for _, nf := range nonFinite {
		t.Run("Sqrt/"+nf.name, func(t *testing.T) {
			t.Parallel()
			if _, err := Sqrt(nf.value); !errors.Is(err, ErrInvalidOperand) {
				t.Errorf("error = %v, want %v", err, ErrInvalidOperand)
			}
		})
	}
}

// The transport layer distinguishes these errors with errors.Is, so they must
// stay distinct values. A copy-paste that gave two of them the same variable
// would otherwise surface as the wrong error code on the wire.
func TestSentinelErrorsAreDistinct(t *testing.T) {
	t.Parallel()
	sentinels := []error{ErrInvalidOperand, ErrDivisionByZero, ErrNegativeSqrt, ErrResultNotFinite}
	for i, a := range sentinels {
		for j, b := range sentinels {
			if i != j && errors.Is(a, b) {
				t.Errorf("sentinel %d and %d are not distinct: %v", i, j, a)
			}
		}
	}
}
