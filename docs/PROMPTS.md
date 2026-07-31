# AI-Assisted Development Log

The assignment asks for the prompts used. This is that artifact.

## Approach

I used Claude Code as an implementer working inside constraints I set first, not as a source of
architecture. Before any code existed I wrote `CLAUDE.md` — scope, repository layout, the frozen API
contract with its exhaustive error-code table, and the definition of done. Every prompt after that was
executed against that document, so "make it idiomatic" never had to be a prompt: the conventions were
already written down and the agent was accountable to them.

The division of labour: I own the API contract, the error taxonomy, the numeric-precision decision and
what stays out of scope. The agent owns implementation, test scaffolding and boilerplate inside those
boundaries.

The part worth reading is not the prompts. It is **Human review** under each one, and the summary of
overrides at the end — where the output was corrected, rejected, or accepted for a stated reason.

> **On the prompts.** The working session was conducted in Spanish. The prompts below are translated
> and edited for concision. The instruction each one carried is unchanged; nothing was added after the
> fact to make a request look more considered than it was. From Phase 1 onward each prompt was drafted
> in full before being sent, which is why the later ones are longer and more specific.

## Setup

- **Tool:** Claude Code (Opus 5)
- **Conventions:** `CLAUDE.md`, committed to the repo — context for the agent, documentation for the
  reader.
- **Review agents:** `.claude/agents/backend-reviewer.md` and `.claude/agents/frontend-reviewer.md`.
  Read-only, one per layer, each carrying the checklist for its sections of `CLAUDE.md`.
- **Method:** plan before code, conventions before implementation, domain before adapter before UI.

---

### 2026-07-31 — Phase 0: plan and environment

**Agent:** Claude Code (Opus 5)

**Prompt:**

> Before writing any code, give me the step-by-step plan of what you are going to do.

**Outcome:** The agent inspected the toolchain before proposing anything, and the inspection changed
the plan: Docker was absent entirely, Node 20.13.1 was below Vite 7's floor, and the `gh` token had
expired. It produced a seven-phase plan and surfaced the decisions it could not make alone.

**Human review:** Requiring the plan before the code is the highest-leverage instruction in this log —
it surfaced the missing Docker runtime before I had written a `Dockerfile` against a daemon that did
not exist. I chose colima over Docker Desktop, and Node 22 over pinning an older Vite. I rejected its
proposal to copy session state into a project folder: the path it had derived was stale because I had
moved the project and it had not re-checked.

---

### 2026-07-31 — Keyboard input, added against the agent's recommendation

**Agent:** Claude Code (Opus 5)

**Prompt:**

> Add to `CLAUDE.md` that I want to implement keyboard input for the operations.

**Outcome:** Keyboard input moved into scope in Section 1, specified in Section 5 as an exhaustive key
table plus five ordered rules, with matching test obligations in Section 6.

**Human review:** The agent advised against this — it is not in the assignment, and `CLAUDE.md`
excluded it originally. I overrode that: a calculator you cannot type into is a demo, not a tool. What
I took from the objection was the failure mode rather than the conclusion, so the feature is specified
defensively: the hook never synthesises digits, it bails out on modifier keys and on IME composition,
and it never intercepts `Backspace`. What stayed excluded is the dependency — `react-hotkeys` and
similar remain out of scope. This is roughly forty lines, not a library.

---

### 2026-07-31 — Review agents instead of reviewing the output by hand

**Agent:** Claude Code (Opus 5)

**Prompt:**

> I want an agent that reviews the frontend. The idea is Robert C. Martin's: instead of manually
> reviewing the code the AI generates, build enough context and tooling that it produces good code
> from the start. I want to follow that methodology.

**Outcome:** Two read-only reviewers, one per layer, each encoding its section of `CLAUDE.md` as a
concrete checklist rather than generic advice.

**Human review:** The agent sharpened my own framing and was right to: the strongest form of "build the
tooling" is the *deterministic* check, not another model. An agent finds different things each run;
`tsc --noEmit`, oxlint's jsx-a11y rules and `go vet` fail the same way every time. So the reviewers
are the backstop for what those cannot express — all seven error codes being reachable, `errors.Is`
used rather than string comparison, the keyboard bail-out rules — and the linters carry everything they
can. That principle is written into Section 9 as "guardrails over inspection".

I started with one reviewer and added the second after noticing the asymmetry: Section 5 had a
dedicated checklist while Sections 2 through 4 did not, even though the backend is the half a Go
reviewer reads hardest.

I also installed the `frontend-design` skill from `anthropics/skills` and removed it after reading it.
It is written for pages with a hero and orchestrated motion; this is a form with two inputs. Two of its
ideas were worth keeping without the dependency: avoid the three visual defaults AI design converges
on, and write error copy that neither apologises nor stays vague. Both are applied by hand in Phase 3.

---

### 2026-07-31 — Making the coverage threshold fail on its own

**Agent:** Claude Code (Opus 5)

**Prompt:**

> Should we add more deterministic guardrails — coverage, tests — following Robert C. Martin's idea of
> tightening everything so the code cannot degrade?

**Outcome:** `scripts/coverage.sh` renders the report and enforces the Section 6 thresholds, exiting
non-zero when either is missed. `make coverage` fails rather than printing a number.

**Human review:** I turned down three of the four things offered, including a pre-commit hook: git
hooks are not cloned with a repository, so they inconvenience the author without protecting the reader.
I kept CI for Phase 5 so its first run is green rather than red through Phases 0-2.

Two details in the script are deliberate. It parses the coverage profile directly instead of reading
`go tool cover -func`, because that command reports percentages *per function* and averaging them
weights a one-statement helper equally with a twenty-statement handler — the real figure is
statement-weighted. And a package reporting no measured statements is treated as a failure, not as
trivially complete, so deleting a test file cannot turn the gate green. I verified both against a
synthetic profile and confirmed that 99.9% fails the domain's 100% threshold rather than rounding into
a pass.

---

### 2026-07-31 — Phase 1: the domain package

**Agent:** Claude Code (Opus 5)

**Prompt:**

> **Phase 1 — Go domain package.**
>
> Build `backend/internal/calculator` following CLAUDE.md Sections 2, 4 and 9. Write the failing tests
> before the implementation.
>
> - `errors.go`: sentinel errors matchable with `errors.Is` — `ErrDivisionByZero`, `ErrNegativeSqrt`,
>   `ErrResultNotFinite`, `ErrInvalidOperand`. No HTTP vocabulary; the transport layer maps these to
>   codes, the domain does not know they exist.
> - `calculator.go`: `Add`, `Subtract`, `Multiply`, `Divide`, `Power`, `Sqrt`, `Percentage`, each
>   returning `(float64, error)`. Every operation validates that its operands are finite on the way in
>   and rejects a `NaN` or `±Inf` result before returning it. `Percentage(a, b)` is "a percent of b",
>   per the assumption recorded in DESIGN.md.
> - Standard library only. No import from this repository, nothing transport-shaped.
> - `calculator_test.go`: table-driven, named subtests, `t.Parallel()` where safe. Cover the happy
>   path, division by zero including a negative-zero divisor, overflow in `Power`, `Sqrt` of a
>   negative, non-finite operands arriving as input, and `1e308`-scale values at the boundary. Compare
>   errors with `errors.Is`, never by string. Use a tolerance for inexact arithmetic and exact equality
>   only where the result is exactly representable.
>
> Show me the proposed signatures and the test-case table before writing the implementation.
>
> Then run `make test-backend` and `make coverage`, and report the real numbers — the gate requires
> 100% on this package.

**Outcome:** 83 subtests, 100% statement coverage on the package, `gofmt` and `go vet` clean. The
domain's entire import list is `errors` and `math`.

**Human review:** Requiring the signatures and the case table before any implementation was the point
of the prompt, and it earned its keep — three edge cases surfaced at that stage that I had to rule on
rather than discover in the code: division by negative zero, the square root of negative zero, and
`0**0`. I settled them as an error, zero, and one respectively, and they are recorded as assumptions in
DESIGN.md. Each has its own test, because each is a place where a plausible implementation is wrong in
a way the other tests would not catch: a guard written as `b == +0` returns `-Inf` for a negative-zero
divisor, and `math.Signbit` in place of `x < 0` wrongly rejects the square root of negative zero.

I pushed back on the tolerance instruction in my own prompt after the agent argued the opposite case.
IEEE 754 arithmetic is deterministic, so `10.0/4.0` is exactly `2.5` everywhere and a tolerance would
hide a behavioural change rather than absorb noise. Exact comparison is now the default, with a single
epsilon assertion for the one expected value that is irrational, and a comment in the test file saying
why it is the exception.

The agent added one test I had not asked for and I kept it: `TestSentinelErrorsAreDistinct`. A
copy-paste assigning the same error value to two sentinels would make the transport layer emit the
wrong code on the wire, and no per-operation test would notice.

---

### 2026-07-31 — Phase 2: the HTTP transport layer

**Agent:** Claude Code (Opus 5)

**Prompt:**

> **Phase 2 — HTTP transport layer.**
>
> Build `backend/internal/transport/http` and `backend/cmd/api`, following CLAUDE.md Sections 2, 3 and
> 4. Section 3 is frozen: the code conforms to the contract, never the reverse.
>
> - `handler.go`: `POST /api/v1/calculations` and `GET /health` on a stdlib `http.ServeMux` using
>   method-aware patterns. Dependencies injected through a struct; no globals, no `init()`. Decode
>   strictly — reject unknown fields, distinguish a missing `operands` key from an empty array, and
>   bound the request body.
> - `response.go`: the JSON envelope and the mapping from domain sentinel to error code, matched with
>   `errors.Is`. All seven codes from the Section 3 table must be reachable, and no code outside that
>   set may ever be emitted. Every client fault is 400.
> - `middleware.go`: CORS with the origin from `ALLOWED_ORIGIN`, covering preflight; panic recovery;
>   request logging with `log/slog`. Small and hand-written — no library.
> - `cmd/api/main.go`: composition root only. `ReadHeaderTimeout`, graceful shutdown on SIGINT and
>   SIGTERM that waits for in-flight requests, port and allowed origin from the environment with
>   documented defaults.
> - `handler_test.go`: `httptest`, no real network. Table-driven. One test per error code that
>   actually provokes it, including the two distinct non-finite input paths — a body containing a
>   literal `NaN` must fail as `INVALID_JSON`, while `1e400` decodes successfully into `+Inf` and must
>   surface as `INVALID_OPERAND`. Also cover wrong arity per operation, an unknown operation, a
>   wrong-method request, and the health endpoint.
>
> Section 2's tree does not list `middleware.go`; if you add it, update that tree in the same change so
> CLAUDE.md keeps describing reality.
>
> Show me the request/response types, the sentinel-to-code mapping table, and the list of test cases
> before writing the implementation.
>
> Then run `make test-backend`, `make lint-backend` and `make coverage`, and report the real numbers.

**Outcome:** Total statement coverage 93.0%, `internal/calculator` and `internal/transport/http` both
at 100%, `cmd/api` at 63.3% — the uncovered remainder being `main` itself, which reads the environment
and opens a listener.

**Human review:** My own prompt contained a factual error, and the agent caught it while designing
rather than after implementing. I had asserted — in the prompt, in DESIGN.md and in a doc comment —
that a body containing `1e400` decodes into `+Inf`. It does not: `encoding/json` rejects it with an
`UnmarshalTypeError`. The agent checked against the real decoder instead of taking my word for it, and
the correction is its own commit.

That has a consequence I chose to write down rather than paper over: no HTTP request can hand the
domain a non-finite operand, so `calculator.ErrInvalidOperand` is unreachable through the API. The
domain keeps the check anyway — it is an importable package defending its own boundary — and the
mapping is covered by testing the mapper directly, which is the honest way to cover a branch that no
constructible request reaches.

I also dropped a requirement from my own prompt. I had asked for a missing `operands` key to be
distinguished from an empty array; JSON decoding makes them identical, and both mean zero operands, so
the distinction would have been machinery producing no observable difference.

Two things I asked to be added after seeing the first draft. `main` was restructured so that `run`
takes a `net.Listener`, which lets a test bind port zero, serve a real request, cancel the context and
assert that the port stops accepting connections — graceful shutdown is usually claimed in a comment
and never checked. And an unused `Error()` method on the internal error type was removed rather than
left for coverage to flag.

The `make lint` gate earned its place here: it failed the build on a formatting slip in a test file
that `go test` was perfectly happy with.

---

### 2026-07-31 — Backend review, and what it found

**Agent:** Claude Code (Opus 5), running the `backend-reviewer` checklist

**Prompt:** the contents of `.claude/agents/backend-reviewer.md`, scoped to `backend/`.

**Outcome:** Twelve findings and a list of coverage gaps. Ten were real. The three that mattered most:

- **The response tests were tautologies.** They decoded each response into the same struct that had
  encoded it, so renaming a JSON tag would have broken every client with the suite still green. The
  entire Section 3 envelope was unprotected. It is now asserted against literal JSON.
- **`Decode` reads one value and stops.** A body of `{...}{...}` or `{...} junk` returned 200 and
  discarded the remainder silently.
- **A top-level type mismatch carries no field name**, so `[1,2]` was reported as `INVALID_OPERAND`
  with the message "operands must be finite numbers" — naming a field the body does not contain.

**Human review:** Two findings were about decisions I had defended, and the reviewer was right on
both. I had argued for dividing before multiplying in `Percentage` to protect against an overflow at
1e307; the reviewer pointed out that this costs precision in the ordinary case — 10% of 0.1 returned
`0.010000000000000002` — and that I had traded an everyday input for one nobody types. It now
multiplies first and falls back to the other order only when the product overflows, so neither case
loses. And `sqrt(-0.0)` was returning negative zero, which reaches the screen as `-0`; my test asserted
`want: 0` and passed, because `-0.0 == 0.0` in Go. Only the encoded body shows it.

It also caught my own test lying. `TestRunServesAndShutsDownOnContextCancel` closed its request
*before* cancelling the context, so nothing was ever in flight — replacing `Shutdown` with
`listener.Close()` would have passed it. I had claimed in the Phase 2 commit message that it verified
draining. It did not. `serve` is now separated from `run` so a test can hold a handler open across the
cancellation and prove the in-flight response completes.

I rejected one finding. It argued that `{"operation":5}` should be `INVALID_JSON`; I kept
`UNKNOWN_OPERATION`, because the rule I want is that a malformed *document* is a JSON fault while a
wrongly-typed *field* is that field's fault, and a number is certainly not one of the seven operations.
I also set aside its last finding — the missing `Dockerfile` and the README without setup instructions
— as phase ordering rather than neglect.

Fixing its complaint about misattributed codes exposed one I had just written myself: my new 404 and
405 responses used `INVALID_JSON`, and "no such endpoint" has nothing to do with JSON. `NOT_FOUND` and
`METHOD_NOT_ALLOWED` were added to the contract for the same reason `INTERNAL_ERROR` was.

Three contract changes came out of this, each applied to Section 3, the README and DESIGN.md in the
same commit: `INTERNAL_ERROR` at 500 for a panic or an unmapped domain error, and the two routing
codes. The reason for `INTERNAL_ERROR` is the reviewer's argument, and it is a good one — telling a
caller its operands were invalid when the fault was ours sends it to fix input that was never wrong,
and leaves the real defect with no trace.

---

### 2026-07-31 — Phase 3: the React frontend

**Agent:** Claude Code (Opus 5)

**Prompt:**

> **Phase 3 — React frontend.**
>
> Scaffold `frontend/` with Vite, React 19 and TypeScript in strict mode, plus Tailwind v4 via
> `@tailwindcss/vite`. Follow CLAUDE.md Section 5.
>
> - `src/api/`: the only place `fetch` is called. `types.ts` mirrors Section 3 exactly — every error
>   code as a union type, request and response shapes. The client returns a discriminated union so a
>   success and a failure cannot both be represented at once. No `any`.
> - `src/domain/`: operation metadata — display name, symbol, arity — and the client-side validation
>   rules. This is the single source for both the UI and the keyboard map.
> - `src/hooks/useCalculator.ts`: owns the request state machine. A slow response must not overwrite
>   state the user has since changed, and a server error always overrides local state.
> - `src/hooks/useKeyboard.ts`: the Section 5 key table and its five rules — digits reach the focused
>   input natively rather than being synthesised, bail out on modifier keys, on a foreign event target
>   and on `isComposing`, `preventDefault` only on handled keys, never intercept `Backspace`.
> - `src/components/`: presentational only. Labelled inputs, `role="alert"` on the error region,
>   visible focus, errors as text and not colour alone, `aria-keyshortcuts` on each operation control,
>   and a visible shortcut legend. Responsive down to 360px.
> - Wire the linter so accessibility violations fail the build rather than waiting for review.
>
> Error copy: state what happened and what to do, in the interface's voice. No apologies, nothing vague.
> Show me the type definitions, the state machine's transitions and the component tree before building.

**Outcome:** `tsc --noEmit` and oxlint clean, production build at 63 kB gzipped. Verified in a real
browser rather than only in a test runner.

**Human review:** Three corrections, and two of them came from running the app rather than reading it.

The state machine in Section 5 listed a `validating` state that cannot exist — client validation is
synchronous, so React never renders it and no test can observe it. I replaced it with an `origin` field
on the error state, which is observable and carries the rule that actually matters: the server always
overrides a local verdict. Section 5 was updated to match.

The key table contradicted itself: `-` appeared both as "typed into the field" and as the shortcut for
subtract. A calculator that cannot accept a negative number is broken, so typing wins and subtract
moved to `s`. One collision remains — `1e+5` has to be written `1e5` — and it is documented rather than
solved, because every fix costs more than the case is worth.

Then I drove the running app through Chrome's DevTools protocol with real key events, and it found two
defects that neither the type checker nor the linter could see. The keyboard shortcuts were dead on
page load: the hook bailed out whenever the event target sat outside the calculator, and on load the
target is `<body>`, so nothing worked until the user happened to click a field. And disabling the
inputs during a request handed focus back to `<body>` after every calculation, losing the user's place.
Nothing is disabled now — the hook already aborts a superseded request, so the guard was costing more
than it protected.

The linter caught a third, before the browser did. I had written the operation picker as buttons with
`role="radio"` inside a `role="radiogroup"`, which promises arrow-key navigation and a single tab stop
and delivers neither unless both are hand-written. An ARIA role the code does not honour is worse than
no role, because assistive technology believes it. Native radios provide the behaviour for free.

The toolchain also differed from what I had assumed: the Vite template now ships **oxlint** rather than
ESLint, with the jsx-a11y and react rule sets built in. Adding ESLint to run rules oxlint already has
would have been a second linter for nothing, so the references in `CLAUDE.md`, the `Makefile` and the
README were corrected instead.

---

### 2026-07-31 — Phase 4: the frontend test suite

**Agent:** Claude Code (Opus 5)

**Prompt:**

> **Phase 4 — Frontend tests.**
>
> Vitest, React Testing Library and MSW, following CLAUDE.md Sections 5 and 6.
>
> - Mock at the network boundary with MSW, never by replacing the client module. Stubbing `calculate`
>   would leave the mapping from a response body to an outcome untested, which is the piece most likely
>   to break.
> - Cover the client: a success body, an error envelope for a 400, a 404, a 405 and a 500, a network
>   failure, a body that is not JSON, a body missing `result`, and an error code outside the contract.
> - Cover `useCalculator`: the state machine, a client error, a server error replacing a client error,
>   and the race — a slow answer arriving after the user has changed the input must be discarded.
> - Cover the keyboard against the Section 5 table: every key, plus the three bail-outs (modifier held,
>   foreign text control, `isComposing`) and one proving digits, `.` and `-` still reach the focused
>   field. Drive it with `userEvent`, never `fireEvent`.
> - Add the two regressions found by running the app: shortcuts must work with focus on `<body>`, and
>   focus must survive a calculation.
> - Query by role and label. Wire the frontend coverage into `make coverage` with a threshold that
>   fails the build.
>
> Then run `make test`, `make lint` and `make coverage`, and report the real numbers.

**Outcome:** 77 frontend tests. Statements 95.7%, functions and lines 100%. `make test`, `make lint`
and `make coverage` now pass across both layers for the first time.

**Human review:** The suite found a real defect in code I had already reviewed by eye. The client
detected an aborted request with `error instanceof DOMException`, which is false under jsdom — the
exception undici throws is a `DOMException` named `AbortError` for which that check fails, because the
class is realm-specific. So a deliberate abort was being reported as a network failure. It matches on
the name and the signal now. The browser would have hidden this; the test environment exposed it.

Three findings came from the linter's vitest rules rather than from me. Two tests wrapped an
expectation in an `if` that narrowed a union — which passes silently whenever the condition is false,
and is exactly the "test that passes for the wrong reason" the definition of done warns about. Both
were rewritten to assert the whole object at once.

One assertion is scoped through the DOM rather than by role, and the comment says why: `<details>` has
no role in this ARIA mapping, and `<fieldset>` already claims `group`, so an unscoped query matched the
operation picker — whose symbols include `+` and `%` too. Adding ARIA purely to make a query work would
have been shaping the markup around the test.

One test dispatches a raw `KeyboardEvent`, the only place in the suite that does. `userEvent` has no
composition API, and the `isComposing` rule cannot be exercised any other way. It is annotated rather
than left to look like carelessness.

---

## Where I overrode the agent

1. **Keyboard input.** It argued the feature was out of scope and unrequested. I added it anyway, but
   adopted its objection as constraints rather than dismissing it.
2. **Pre-commit hooks.** Offered as a guardrail; declined, because hooks do not travel with a clone.
3. **The `frontend-design` skill.** Installed, read, removed — written for marketing pages, not for a
   two-field form. Two of its principles kept without the dependency.
4. **A stale filesystem path.** It proposed copying session state to a directory that no longer
   existed because I had moved the project. Caught before it ran.
5. **`golangci-lint`.** Offered; declined for this size of project, where `gofmt` and `go vet` in a
   failing `make lint` cover the same ground without another tool to install.

## What I did not delegate

The API contract and its error taxonomy. The decision to use `float64` and the reasoning for why that
would be wrong for money. What stays out of scope. The choice of which findings from the review agents
become fixes and which are rejected.
