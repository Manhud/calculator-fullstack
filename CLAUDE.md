# CLAUDE.md

Guidance for Claude Code when working in this repository.

---

## 1. Project

Full-stack calculator: **React + TypeScript** frontend consuming a **Go** REST microservice.

This is a take-home evaluation. It is graded on **correctness, clarity and maintainability**, not on
feature count. Do not add features that were not requested. Prefer deleting code over adding it.

**Scope (fixed — do not expand):**

- Core: `add`, `subtract`, `multiply`, `divide`
- Extended: `power`, `sqrt`, `percentage`
- Frontend: input, result display, validation, error handling, responsive down to 360px
- Frontend: keyboard input for operations (see Section 5) — an explicit addition to the assignment
- Backend: REST endpoints, input validation, edge cases, JSON responses
- Unit tests on both layers + coverage report
- README with setup, API examples, design decisions
- Dockerfile / docker-compose for both services

**Out of scope:** auth, persistence, history, database, users, i18n, calculation chaining,
state management libraries, keybinding libraries (`react-hotkeys`, `mousetrap`, and friends).

---

## 2. Repository layout

```
.
├── backend/
│   ├── cmd/api/
│   │   ├── main.go                  # composition root only: config, wiring, signals
│   │   └── main_test.go             # run() on a real listener: serves, then drains
│   ├── internal/
│   │   ├── calculator/              # DOMAIN — pure Go, zero HTTP/JSON imports
│   │   │   ├── calculator.go        # operations
│   │   │   ├── errors.go            # domain error taxonomy
│   │   │   └── calculator_test.go   # table-driven tests
│   │   └── transport/http/          # ADAPTER — decode, validate, map errors, encode
│   │       ├── handler.go           # routes, operation registry, arity
│   │       ├── response.go          # JSON envelope + error mapping
│   │       ├── middleware.go        # CORS, panic recovery, request logging
│   │       ├── handler_test.go      # httptest, no real network
│   │       └── middleware_test.go
│   ├── go.mod
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/                     # HTTP client + typed DTOs (only place fetch is called)
│   │   ├── components/              # presentational, no fetch
│   │   ├── hooks/                   # useCalculator: state machine for the request lifecycle
│   │   ├── domain/                  # operation metadata, client-side validation rules
│   │   └── App.tsx
│   ├── tests/
│   ├── package.json
│   └── Dockerfile
├── docs/
│   ├── PROMPTS.md                   # REQUIRED DELIVERABLE — see Section 8
│   └── DESIGN.md                    # long-form rationale, README links to it
├── docker-compose.yml
├── Makefile
├── README.md
└── CLAUDE.md
```

**Dependency rule:** dependencies point inward. `transport/http` imports `calculator`.
`calculator` imports nothing from this repo. If you are tempted to import `net/http` inside
`internal/calculator`, the design is wrong — stop and fix it.

---

## 3. API contract (source of truth — changes here require updating README + frontend types)

Single entry point, operation as data. Rationale: one validation path, one error envelope, adding an
operation touches one switch statement and one map — not a new route, handler and test file.

### `POST /api/v1/calculations`

Request:

```json
{ "operation": "divide", "operands": [10, 4] }
```

- `operation`: one of `add | subtract | multiply | divide | power | sqrt | percentage`
- `operands`: array of numbers. Arity is validated per operation: `sqrt` takes 1, all others take 2.

Success — `200 OK`:

```json
{ "operation": "divide", "operands": [10, 4], "result": 2.5 }
```

Error — `400 Bad Request` (validation/domain) or `422` never; keep it simple, 400 for all client faults:

```json
{
  "error": {
    "code": "DIVISION_BY_ZERO",
    "message": "cannot divide by zero"
  }
}
```

**Error codes (exhaustive):**

| Code                | Cause                                        |
| ------------------- | -------------------------------------------- |
| `INVALID_JSON`      | Body is not valid JSON                       |
| `UNKNOWN_OPERATION` | `operation` not in the allowed set           |
| `INVALID_ARITY`     | Wrong number of operands for that operation  |
| `INVALID_OPERAND`   | NaN, ±Inf, or non-numeric operand            |
| `DIVISION_BY_ZERO`  | Divisor is 0                                 |
| `NEGATIVE_SQRT`     | `sqrt` of a negative number                  |
| `RESULT_OVERFLOW`   | Result is ±Inf or NaN after computing        |

### `GET /health`

`200 OK` → `{"status":"ok"}`. No versioning, used by Docker healthcheck.

**Numeric policy:** all arithmetic is `float64`. This is documented in DESIGN.md as a deliberate
trade-off: float64 is idiomatic, dependency-free, and adequate for a calculator UI; exact decimal
arithmetic (`shopspring/decimal`) would be required for money and is called out as the migration
path. Results are rejected when they are `NaN` or `±Inf`. The frontend formats for display only —
it never rounds before sending.

---

## 4. Backend conventions (Go)

- Go 1.22+. **Standard library `net/http` only** for routing (`mux.HandleFunc("POST /api/v1/...")`).
  No Gin/Echo/Fiber. Justify any new dependency in DESIGN.md or don't add it.
- Domain errors are sentinel values (`var ErrDivisionByZero = errors.New(...)`), matched with
  `errors.Is` in the transport layer and mapped to codes there. The domain never knows about HTTP.
- Table-driven tests, `t.Run` subtests, `t.Parallel()` where safe. No testify — `if got != want` is fine.
- Handlers get their dependency injected via a struct; `main.go` does the wiring. No globals, no `init()`.
- Context timeouts and `ReadHeaderTimeout` on the server. Graceful shutdown on SIGINT/SIGTERM.
- CORS: permissive in dev, origin from `ALLOWED_ORIGIN` env var. One small middleware, not a library.
- `gofmt` + `go vet` clean. Exported identifiers have doc comments; unexported ones only when the
  *why* is non-obvious.

## 5. Frontend conventions (React + TypeScript)

- Vite 7 + React 19 + TypeScript, `strict: true`. No `any`. No Redux/Zustand — `useReducer` at most.
  Node 22 LTS, pinned in `.nvmrc`. Vite 7 requires Node `^20.19 || >=22.12`.
- **All network access lives in `src/api/`.** Components never call `fetch`. Types in `src/api/types.ts`
  mirror Section 3 exactly.
- `useCalculator` hook owns the request state machine: `idle | validating | loading | success | error`.
  Components render that state; they contain no logic beyond presentation.
- Client-side validation duplicates server rules intentionally (fast feedback) but the server is
  authoritative — a server error always overrides local state. Say this in DESIGN.md.
- Accessibility is part of "clean UI": labelled inputs, `role="alert"` on the error region,
  keyboard-operable buttons, visible focus. Errors are text, not just colour.
- Styling is **Tailwind v4** (`@tailwindcss/vite` plugin, CSS-first config — no `tailwind.config.js`).
  Chosen over hand-written CSS for consistent spacing/colour scales without inventing a design system.
  **No shadcn/ui**: a component generator is unjustified for one form and a result panel, and vendored
  components read as code the candidate did not write. Justify this in DESIGN.md.
- Responsive with Tailwind's Grid/Flex utilities and fluid sizing. Mobile target: 360px wide.
- **Keyboard input.** In scope by explicit decision, and deliberately small — a `useKeyboard` hook,
  no library. The mapping is exhaustive; do not add to it:

  | Key                  | Action                                  |
  | -------------------- | --------------------------------------- |
  | `0`–`9`, `.`, `-`    | typed into the focused operand field    |
  | `+ - * / ^ %`        | select that operation                   |
  | `r`                  | select `sqrt` (root)                    |
  | `Enter`              | submit, if the form is valid            |
  | `Escape`             | clear operands, result and error        |
  | `Backspace`          | native field behaviour — never intercept |

  Rules, in priority order. Break any of these and the feature is a regression, not a feature:
  1. Native typing always wins. Digits and `.` reach the input because it has focus — the hook does
     **not** synthesise them. Only operation keys, `Enter` and `Escape` are handled globally.
  2. Bail out when the event target is not ours, when a modifier (`Ctrl`/`Cmd`/`Alt`) is held, or when
     `event.isComposing` is true. Never break browser shortcuts or IME input.
  3. `preventDefault()` only on keys actually handled, never blanket.
  4. Every keyboard action must also be reachable by mouse and by `Tab` + `Enter`. The keyboard is an
     accelerator, never the only path.
  5. The shortcuts are discoverable: a visible legend, and `aria-keyshortcuts` on the matching button.
     An invisible shortcut is not a feature.
- Tests: Vitest + React Testing Library. Query by role/label, never by class name or test-id-only.
  Mock at the `src/api` boundary with MSW or a stubbed client — never mock `fetch` globally.
  Drive the keyboard with `userEvent.keyboard()`, not synthetic `fireEvent` — it is the only way the
  focus and modifier rules above are actually exercised.

---

## 6. Testing & definition of done

A task is done when **all** of these hold:

- [ ] `make test` passes (backend + frontend)
- [ ] `make coverage` regenerates `docs/coverage/` and backend statement coverage ≥ 85%,
      with `internal/calculator` at 100%
- [ ] `gofmt -l .` and `go vet ./...` produce no output; `npm run lint` and `tsc --noEmit` are clean
- [ ] Every error code in Section 3 has a test that provokes it
- [ ] Every key in the Section 5 table has a test, plus the three bail-outs (modifier held, foreign target,
      `isComposing`) and one proving typing digits into a focused field still works
- [ ] README and this file still describe reality
- [ ] `docs/PROMPTS.md` has an entry for the work just done

Test what the code promises, not how it does it. Do not write tests that assert implementation
details, and never weaken an assertion to make a test pass — fix the code.

---

## 7. Commands

```bash
make dev            # backend on :8080 + frontend on :5173
make test           # go test ./... && npm test -- --run
make coverage       # coverage profiles + HTML into docs/coverage/
make lint           # gofmt, go vet, eslint, tsc --noEmit
make docker-up      # docker compose up --build
```

If a Make target does not exist yet, create it rather than documenting a raw command.

**Verified local toolchain** (2026-07-31): Go 1.23.2 · Node 22.23.2 / npm 10.9.8 · Docker 29.7.0 with
Compose 5.3.1. The Docker daemon here is **colima**, not Docker Desktop, so `make docker-up` needs
`colima start` first. That is a local detail, not a project requirement — the README documents plain
`docker compose up` because reviewers will be on their own daemon.

---

## 8. AI-usage log (graded deliverable)

The assignment requires sharing the prompts used. `docs/PROMPTS.md` is that artifact and must be
updated **in the same commit** as the code it produced. Format per entry:

```markdown
### <date> — <task>
**Agent:** <agent name / model>
**Prompt:** <verbatim prompt>
**Outcome:** <what was generated>
**Human review:** <what I changed, rejected, or verified and why>
```

The "Human review" line is the point of the document: it demonstrates judgement over the output,
not just generation. Never leave it as "looks good".

---

## 9. Working agreement for Claude

- **Contract before code.** Section 3 is frozen. If a change is genuinely needed, update Section 3,
  the README and the frontend types in the same change — never let them drift.
- **Guardrails over inspection.** Prefer a constraint that fails deterministically to a convention
  someone has to remember: `strict` TypeScript, `eslint-plugin-jsx-a11y`, `eslint-plugin-testing-library`,
  and types that make invalid states unrepresentable; `gofmt`, `go vet` and a `go.mod` with no
  unjustified dependency. The two reviewers in `.claude/agents/` — `backend-reviewer` for Sections 2-4,
  `frontend-reviewer` for Section 5 — are the backstop for what those cannot catch. Run the matching
  one before each phase commit. They report; they never edit. They are not a substitute for the
  deterministic checks, and a finding either becomes a fix or a written reason for rejecting it.
- **Small, reviewable commits** with conventional-commit messages (`feat(backend): ...`). One concern
  per commit. Do not commit or push unless asked.
- **Domain first, then adapter, then UI.** Write the failing test before the implementation for the
  `internal/calculator` package.
- **Do not invent requirements.** If something is ambiguous, pick the simplest reading, implement it,
  and record the assumption in DESIGN.md under "Assumptions".
- **No speculative abstraction.** No interfaces with a single implementation "for testability" — the
  domain is already pure. No config system for two env vars.
- Report failures honestly: if coverage drops or a test fails, say so with the output.
