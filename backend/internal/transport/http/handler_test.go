package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Manhud/calculator-fullstack/backend/internal/calculator"
)

// post sends a body to the calculations endpoint through the real mux, so the
// route patterns are exercised rather than the handler function alone.
func post(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	return do(t, http.MethodPost, "/api/v1/calculations", body)
}

func do(t *testing.T, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	rec := httptest.NewRecorder()
	NewHandler().Routes().ServeHTTP(rec, req)
	return rec
}

func decodeSuccess(t *testing.T, rec *httptest.ResponseRecorder) calculationResponse {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got calculationResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("response is not valid JSON: %v (body: %s)", err, rec.Body.String())
	}
	return got
}

func decodeError(t *testing.T, rec *httptest.ResponseRecorder) errorResponse {
	t.Helper()
	// Every client fault is 400 per the contract; asserting it on each case is
	// what stops a handler drifting to 422 or 500 unnoticed.
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	var got errorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("error response is not valid JSON: %v (body: %s)", err, rec.Body.String())
	}
	return got
}

func TestCalculateSuccess(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		body string
		want float64
	}{
		{name: "add", body: `{"operation":"add","operands":[2,3]}`, want: 5},
		{name: "subtract", body: `{"operation":"subtract","operands":[5,3]}`, want: 2},
		{name: "multiply", body: `{"operation":"multiply","operands":[3,4]}`, want: 12},
		{name: "divide", body: `{"operation":"divide","operands":[10,4]}`, want: 2.5},
		{name: "power", body: `{"operation":"power","operands":[2,10]}`, want: 1024},
		{name: "percentage", body: `{"operation":"percentage","operands":[50,200]}`, want: 100},
		{name: "sqrt takes one operand", body: `{"operation":"sqrt","operands":[9]}`, want: 3},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := decodeSuccess(t, post(t, tc.body))
			if got.Result != tc.want {
				t.Errorf("result = %v, want %v", got.Result, tc.want)
			}
		})
	}
}

// The response echoes the request, so a client can match a reply to what it sent.
func TestCalculateEchoesTheRequest(t *testing.T) {
	t.Parallel()
	got := decodeSuccess(t, post(t, `{"operation":"divide","operands":[10,4]}`))
	if got.Operation != "divide" {
		t.Errorf("operation = %q, want %q", got.Operation, "divide")
	}
	if len(got.Operands) != 2 || got.Operands[0] != 10 || got.Operands[1] != 4 {
		t.Errorf("operands = %v, want [10 4]", got.Operands)
	}
}

// Every code in the Section 3 table, each provoked by a request that a client
// could actually send. INVALID_OPERAND appears twice because it is reachable by
// two different decoder failures.
func TestErrorCodes(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		body string
		want string
	}{
		{name: "malformed body", body: `{"operation":`, want: codeInvalidJSON},
		{name: "empty body", body: ``, want: codeInvalidJSON},
		{name: "NaN is not JSON syntax", body: `{"operation":"add","operands":[NaN,1]}`, want: codeInvalidJSON},
		{name: "Infinity is not JSON syntax", body: `{"operation":"add","operands":[Infinity,1]}`, want: codeInvalidJSON},
		{name: "unknown field", body: `{"operation":"add","operands":[1,2],"extra":true}`, want: codeInvalidJSON},

		{name: "unknown operation", body: `{"operation":"modulo","operands":[1,2]}`, want: codeUnknownOperation},
		{name: "empty operation", body: `{"operation":"","operands":[1,2]}`, want: codeUnknownOperation},
		{name: "operation of the wrong type", body: `{"operation":5,"operands":[1,2]}`, want: codeUnknownOperation},

		{name: "too few operands", body: `{"operation":"add","operands":[1]}`, want: codeInvalidArity},
		{name: "too many operands", body: `{"operation":"add","operands":[1,2,3]}`, want: codeInvalidArity},
		{name: "operands key missing", body: `{"operation":"add"}`, want: codeInvalidArity},
		{name: "operands null", body: `{"operation":"add","operands":null}`, want: codeInvalidArity},
		{name: "operands empty", body: `{"operation":"add","operands":[]}`, want: codeInvalidArity},
		{name: "sqrt given two operands", body: `{"operation":"sqrt","operands":[9,2]}`, want: codeInvalidArity},

		// Syntactically valid JSON, but not a number the API can use.
		{name: "non-numeric operand", body: `{"operation":"add","operands":["a",1]}`, want: codeInvalidOperand},
		{name: "operand out of float64 range", body: `{"operation":"add","operands":[1e400,1]}`, want: codeInvalidOperand},

		{name: "division by zero", body: `{"operation":"divide","operands":[10,0]}`, want: codeDivisionByZero},
		{name: "division by negative zero", body: `{"operation":"divide","operands":[10,-0.0]}`, want: codeDivisionByZero},

		{name: "square root of a negative", body: `{"operation":"sqrt","operands":[-1]}`, want: codeNegativeSqrt},

		{name: "overflow in power", body: `{"operation":"power","operands":[10,400]}`, want: codeResultOverflow},
		{name: "overflow in multiply", body: `{"operation":"multiply","operands":[1.7976931348623157e308,2]}`, want: codeResultOverflow},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := decodeError(t, post(t, tc.body))
			if got.Error.Code != tc.want {
				t.Errorf("code = %q, want %q (message: %q)", got.Error.Code, tc.want, got.Error.Message)
			}
			if got.Error.Message == "" {
				t.Error("message is empty; the code needs a human-readable companion")
			}
		})
	}
}

// Asserts the closed set itself: the table above must provoke every code, and
// the handler must never emit one outside it.
func TestEveryContractCodeIsCovered(t *testing.T) {
	t.Parallel()
	contract := map[string]bool{
		codeInvalidJSON: false, codeUnknownOperation: false, codeInvalidArity: false,
		codeInvalidOperand: false, codeDivisionByZero: false, codeNegativeSqrt: false,
		codeResultOverflow: false,
	}
	bodies := []string{
		`{"operation":`,
		`{"operation":"modulo","operands":[1,2]}`,
		`{"operation":"add","operands":[1]}`,
		`{"operation":"add","operands":["a",1]}`,
		`{"operation":"divide","operands":[10,0]}`,
		`{"operation":"sqrt","operands":[-1]}`,
		`{"operation":"power","operands":[10,400]}`,
	}
	for _, body := range bodies {
		code := decodeError(t, post(t, body)).Error.Code
		if _, ok := contract[code]; !ok {
			t.Fatalf("handler emitted %q, which is not in the Section 3 table", code)
		}
		contract[code] = true
	}
	for code, seen := range contract {
		if !seen {
			t.Errorf("no request provoked %s", code)
		}
	}
}

// ErrInvalidOperand cannot be reached over HTTP: encoding/json rejects
// out-of-range numbers before the domain sees them. The mapping is still
// verified, directly, so the branch is covered by a real assertion rather than
// by a request that cannot be constructed.
func TestErrorFromMapsEverySentinel(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		err  error
		want string
	}{
		{name: "division by zero", err: calculator.ErrDivisionByZero, want: codeDivisionByZero},
		{name: "negative square root", err: calculator.ErrNegativeSqrt, want: codeNegativeSqrt},
		{name: "result not finite", err: calculator.ErrResultNotFinite, want: codeResultOverflow},
		{name: "invalid operand", err: calculator.ErrInvalidOperand, want: codeInvalidOperand},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := errorFrom(tc.err).code; got != tc.want {
				t.Errorf("code = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestErrorFromUnmappedError(t *testing.T) {
	t.Parallel()
	// An error the domain does not define must still produce a code from the
	// closed set rather than escaping as a success.
	if got := errorFrom(errStub{}).code; got != codeInvalidOperand {
		t.Errorf("code = %q, want %q", got, codeInvalidOperand)
	}
}

type errStub struct{}

func (errStub) Error() string { return "something the domain does not define" }

func TestRequestBodyTooLarge(t *testing.T) {
	t.Parallel()
	operands := strings.Repeat("1,", 5000) + "1"
	got := decodeError(t, post(t, `{"operation":"add","operands":[`+operands+`]}`))
	if got.Error.Code != codeInvalidJSON {
		t.Errorf("code = %q, want %q", got.Error.Code, codeInvalidJSON)
	}
}

func TestMethodNotAllowed(t *testing.T) {
	t.Parallel()
	rec := do(t, http.MethodGet, "/api/v1/calculations", "")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}

func TestUnknownRoute(t *testing.T) {
	t.Parallel()
	rec := do(t, http.MethodPost, "/api/v1/nope", `{}`)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestHealth(t *testing.T) {
	t.Parallel()
	rec := do(t, http.MethodGet, "/health", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("not valid JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("status = %q, want %q", body["status"], "ok")
	}
}

func TestResponsesAreJSON(t *testing.T) {
	t.Parallel()
	for _, target := range []string{"/health"} {
		rec := do(t, http.MethodGet, target, "")
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Errorf("%s Content-Type = %q, want application/json", target, ct)
		}
	}
	rec := post(t, `{"operation":"add","operands":[1,2]}`)
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("calculations Content-Type = %q, want application/json", ct)
	}
}

// failingWriter fails on Write, which is what a client disconnecting mid-response
// looks like to a handler.
type failingWriter struct {
	header http.Header
	status int
}

func (w *failingWriter) Header() http.Header {
	if w.header == nil {
		w.header = http.Header{}
	}
	return w.header
}
func (w *failingWriter) WriteHeader(status int)    { w.status = status }
func (w *failingWriter) Write([]byte) (int, error) { return 0, errStub{} }

// The status and headers are already sent by the time encoding fails, so there
// is no correcting the response. What must not happen is a second write
// appending a broken body to the first.
func TestWriteJSONSurvivesAFailedEncode(t *testing.T) {
	t.Parallel()
	w := &failingWriter{}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})

	if w.status != http.StatusOK {
		t.Errorf("status = %d, want %d", w.status, http.StatusOK)
	}
}

func TestSupportedOperationsIsStable(t *testing.T) {
	t.Parallel()
	// Map iteration is randomised, so an unsorted list would make the error
	// message a client sees change between identical requests.
	first := supportedOperations()
	for i := 0; i < 10; i++ {
		if got := supportedOperations(); got != first {
			t.Fatalf("supportedOperations() = %q on call %d, want %q", got, i, first)
		}
	}
	for name := range operations {
		if !strings.Contains(first, name) {
			t.Errorf("%q is missing from %q", name, first)
		}
	}
}
