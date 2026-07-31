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

// body returns the response with trailing whitespace removed, for comparison
// against a literal.
func body(rec *httptest.ResponseRecorder) string {
	return strings.TrimSpace(rec.Body.String())
}

// The envelope is asserted against literal JSON rather than by decoding into the
// structs that produced it. Round-tripping through calculationResponse proves
// only that the encoder and decoder agree: rename the `result` tag to `value`
// and every client breaks while such a test stays green.
func TestSuccessEnvelopeIsExactlyTheContract(t *testing.T) {
	t.Parallel()
	rec := post(t, `{"operation":"divide","operands":[10,4]}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	const want = `{"operation":"divide","operands":[10,4],"result":2.5}`
	if got := body(rec); got != want {
		t.Errorf("body = %s\nwant     %s", got, want)
	}
}

func TestErrorEnvelopeIsExactlyTheContract(t *testing.T) {
	t.Parallel()
	rec := post(t, `{"operation":"divide","operands":[10,0]}`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
	const want = `{"error":{"code":"DIVISION_BY_ZERO","message":"cannot divide by zero"}}`
	if got := body(rec); got != want {
		t.Errorf("body = %s\nwant     %s", got, want)
	}
}

// A success response carries no error key and an error response carries no
// result key, so a client can branch on presence without a sentinel value.
func TestEnvelopesDoNotOverlap(t *testing.T) {
	t.Parallel()
	success := decodeRaw(t, post(t, `{"operation":"add","operands":[1,2]}`))
	if _, present := success["error"]; present {
		t.Error("success response carries an error key")
	}

	failure := decodeRaw(t, post(t, `{"operation":"divide","operands":[1,0]}`))
	for _, key := range []string{"result", "operation", "operands"} {
		if _, present := failure[key]; present {
			t.Errorf("error response carries a %q key", key)
		}
	}
}

func decodeRaw(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var raw map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("response is not valid JSON: %v (body: %s)", err, rec.Body.String())
	}
	return raw
}

func decodeError(t *testing.T, rec *httptest.ResponseRecorder, wantStatus int) errorResponse {
	t.Helper()
	if rec.Code != wantStatus {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, wantStatus, rec.Body.String())
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
			rec := post(t, tc.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusOK, rec.Body.String())
			}
			var got calculationResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("not valid JSON: %v", err)
			}
			if got.Result != tc.want {
				t.Errorf("result = %v, want %v", got.Result, tc.want)
			}
		})
	}
}

// Negative zero serialises as "-0", so this is only visible in the encoded body.
func TestSqrtOfZeroDoesNotSerialiseNegativeZero(t *testing.T) {
	t.Parallel()
	if got := body(post(t, `{"operation":"sqrt","operands":[-0.0]}`)); strings.Contains(got, `"result":-0`) {
		t.Errorf("body = %s, want the result without a negative sign", got)
	}
}

// Every code in the Section 3 table, each provoked by a request a client could
// actually send.
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

		// Valid JSON, but not an object. The type error carries no field name,
		// so calling it a bad operand would name something the body lacks.
		{name: "array at the top level", body: `[1,2]`, want: codeInvalidJSON},
		{name: "string at the top level", body: `"hello"`, want: codeInvalidJSON},
		{name: "number at the top level", body: `123`, want: codeInvalidJSON},

		// Decode stops after one value; the rest must not be discarded silently.
		{name: "trailing garbage", body: `{"operation":"add","operands":[1,2]} nonsense`, want: codeInvalidJSON},
		{name: "two objects", body: `{"operation":"add","operands":[1,2]}{"operation":"add","operands":[3,4]}`, want: codeInvalidJSON},

		{name: "unknown operation", body: `{"operation":"modulo","operands":[1,2]}`, want: codeUnknownOperation},
		{name: "empty operation", body: `{"operation":"","operands":[1,2]}`, want: codeUnknownOperation},
		{name: "operation of the wrong type", body: `{"operation":5,"operands":[1,2]}`, want: codeUnknownOperation},
		{name: "null decodes to the zero struct", body: `null`, want: codeUnknownOperation},

		{name: "too few operands", body: `{"operation":"add","operands":[1]}`, want: codeInvalidArity},
		{name: "too many operands", body: `{"operation":"add","operands":[1,2,3]}`, want: codeInvalidArity},
		{name: "operands key missing", body: `{"operation":"add"}`, want: codeInvalidArity},
		{name: "operands null", body: `{"operation":"add","operands":null}`, want: codeInvalidArity},
		{name: "operands empty", body: `{"operation":"add","operands":[]}`, want: codeInvalidArity},
		{name: "sqrt given two operands", body: `{"operation":"sqrt","operands":[9,2]}`, want: codeInvalidArity},

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
			rec := post(t, tc.body)
			got := decodeError(t, rec, http.StatusBadRequest)
			if got.Error.Code != tc.want {
				t.Errorf("code = %q, want %q (message: %q)", got.Error.Code, tc.want, got.Error.Message)
			}
			if got.Error.Message == "" {
				t.Error("message is empty; the code needs a human-readable companion")
			}
			if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}
		})
	}
}

// Asserts the closed set itself: every client-fault code must be provoked by a
// real request, and the handler must never emit one outside the table.
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
	for _, b := range bodies {
		code := decodeError(t, post(t, b), http.StatusBadRequest).Error.Code
		if _, ok := contract[code]; !ok {
			t.Fatalf("handler emitted %q, which is not in the Section 3 client-fault table", code)
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
// out-of-range numbers before the domain sees them. The mapping is verified
// directly, so the branch is covered by a real assertion rather than by a
// request that cannot be constructed.
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
			got := errorFrom(tc.err)
			if got.code != tc.want {
				t.Errorf("code = %q, want %q", got.code, tc.want)
			}
			if got.status != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", got.status, http.StatusBadRequest)
			}
		})
	}
}

// An error the domain does not define is a bug in this service. Reporting it as
// a client fault would send the caller off to fix input that was never wrong.
func TestErrorFromUnmappedErrorIsAServerFault(t *testing.T) {
	t.Parallel()
	got := errorFrom(errStub{})
	if got.code != codeInternalError {
		t.Errorf("code = %q, want %q", got.code, codeInternalError)
	}
	if got.status != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", got.status, http.StatusInternalServerError)
	}
}

type errStub struct{}

func (errStub) Error() string { return "something the domain does not define" }

func TestRequestBodyTooLarge(t *testing.T) {
	t.Parallel()
	operands := strings.Repeat("1,", 5000) + "1"
	rec := post(t, `{"operation":"add","operands":[`+operands+`]}`)
	if got := decodeError(t, rec, http.StatusBadRequest).Error.Code; got != codeInvalidJSON {
		t.Errorf("code = %q, want %q", got, codeInvalidJSON)
	}
}

// The size limit must hold in the configuration that actually runs, not only
// against the bare mux: MaxBytesReader inspects the ResponseWriter it is given,
// and the deployed one is wrapped by middleware.
func TestRequestBodyTooLargeThroughTheMiddlewareChain(t *testing.T) {
	t.Parallel()
	chain := Chain(NewHandler().Routes(), Recover, Logging, CORS("http://localhost:5173"))
	operands := strings.Repeat("1,", 5000) + "1"

	req := httptest.NewRequest(http.MethodPost, "/api/v1/calculations",
		strings.NewReader(`{"operation":"add","operands":[`+operands+`]}`))
	rec := httptest.NewRecorder()
	chain.ServeHTTP(rec, req)

	if got := decodeError(t, rec, http.StatusBadRequest).Error.Code; got != codeInvalidJSON {
		t.Errorf("code = %q, want %q", got, codeInvalidJSON)
	}
}

// A JSON API that answers in text/plain forces every client to guess the content
// type before parsing. The mux does that by default for both of these.
func TestMethodNotAllowedIsJSON(t *testing.T) {
	t.Parallel()
	rec := do(t, http.MethodPut, "/api/v1/calculations", "")
	got := decodeError(t, rec, http.StatusMethodNotAllowed)
	if got.Error.Code != codeMethodNotAllowed {
		t.Errorf("code = %q, want %q", got.Error.Code, codeMethodNotAllowed)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

func TestUnknownRouteIsJSON(t *testing.T) {
	t.Parallel()
	rec := do(t, http.MethodPost, "/api/v1/nope", `{}`)
	got := decodeError(t, rec, http.StatusNotFound)
	if got.Error.Code != codeNotFound {
		t.Errorf("code = %q, want %q", got.Error.Code, codeNotFound)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

func TestHealth(t *testing.T) {
	t.Parallel()
	rec := do(t, http.MethodGet, "/health", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := body(rec); got != `{"status":"ok"}` {
		t.Errorf("body = %s, want %s", got, `{"status":"ok"}`)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
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

// The status and headers are already sent by the time encoding fails, so the
// response cannot be corrected. What must not happen is a second write appending
// a broken body to the first.
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
	for name := range newRegistry() {
		if !strings.Contains(first, name) {
			t.Errorf("%q is missing from %q", name, first)
		}
	}
}

// Every operation in the registry must be reachable and must agree with the
// arity the contract states.
func TestRegistryMatchesTheContract(t *testing.T) {
	t.Parallel()
	wantArity := map[string]int{
		"add": 2, "subtract": 2, "multiply": 2, "divide": 2,
		"power": 2, "percentage": 2, "sqrt": 1,
	}
	registry := newRegistry()
	if len(registry) != len(wantArity) {
		t.Fatalf("registry has %d operations, want %d", len(registry), len(wantArity))
	}
	for name, arity := range wantArity {
		op, ok := registry[name]
		if !ok {
			t.Errorf("%q is missing from the registry", name)
			continue
		}
		if op.arity != arity {
			t.Errorf("%q arity = %d, want %d", name, op.arity, arity)
		}
	}
}
