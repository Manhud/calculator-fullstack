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

| Code                | Status | Cause                                                        |
| ------------------- | ------ | ------------------------------------------------------------ |
| `INVALID_JSON`      | 400    | Body is not valid JSON, is not an object, or holds more than one value |
| `UNKNOWN_OPERATION` | 400    | `operation` not in the allowed set                           |
| `INVALID_ARITY`     | 400    | Wrong number of operands for that operation                  |
| `INVALID_OPERAND`   | 400    | NaN, ±Inf, or non-numeric operand                            |
| `DIVISION_BY_ZERO`  | 400    | Divisor is 0                                                 |
| `NEGATIVE_SQRT`     | 400    | `sqrt` of a negative number                                  |
| `RESULT_OVERFLOW`   | 400    | Result is ±Inf or NaN after computing                        |
| `NOT_FOUND`         | 404    | No such endpoint                                             |
| `METHOD_NOT_ALLOWED`| 405    | Endpoint exists but not for that method                      |
| `INTERNAL_ERROR`    | 500    | A fault in this service: a panic, or a domain error with no mapping |

The first seven are faults in the request body and all answer 400 — splitting them across 400 and 422
would add a distinction no client acts on, since the code carries the meaning. `NOT_FOUND` and
`METHOD_NOT_ALLOWED` are about the request line rather than the body, and take the status that already
means exactly that.

`INTERNAL_ERROR` is the only server fault. It exists so a bug here is never reported as the client's
mistake — telling a caller its operands were invalid when the failure was ours sends it to fix input
that was never wrong.

**Every 4xx and 5xx response this service produces uses this envelope**, including the router's. A
`ServeMux` answers `text/plain` by default, and a JSON API that sometimes does not forces every client
to sniff the content type before parsing.

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

- Vite 8 + React 19 + TypeScript 6, `strict: true`. No `any`, no non-null `!`. No Redux/Zustand —
  `useReducer` at most. Node 22 LTS, pinned in `.nvmrc`.
- Linting is **oxlint**, which ships with the Vite React template and carries the jsx-a11y, react and
  vitest rule sets natively. `.oxlintrc.json` turns the accessibility rules into build failures. There
  is no ESLint in this project; adding one to run rules oxlint already has would be a second linter.
- **All network access lives in `src/api/`.** Components never call `fetch`. Types in `src/api/types.ts`
  mirror Section 3 exactly, including every error code.
- `useCalculator` owns the request state machine: `idle | loading | success | error`, where an error
  records its `origin` as `client` or `server`. Components render that state and hold no logic beyond
  presentation.

  An earlier version of this list included a `validating` state. It was removed: client validation is
  synchronous, so React never renders it and no test can observe it — a state that cannot exist is
  worse than no state, because it describes the app inaccurately. What replaced it, `origin`, is
  observable and carries the rule that actually matters: a server error always overrides a local one.
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

  | Key                       | Action                                   |
  | ------------------------- | ---------------------------------------- |
  | `0`–`9`, `.`, `-`, `e`    | typed into the focused operand field     |
  | `+`                       | select `add`                             |
  | `s`                       | select `subtract`                        |
  | `*`                       | select `multiply`                        |
  | `/`                       | select `divide`                          |
  | `^`                       | select `power`                           |
  | `r`                       | select `sqrt` (root)                     |
  | `%`                       | select `percentage`                      |
  | `Enter`                   | submit                                   |
  | `Escape`                  | clear operands, result and error         |
  | `Backspace`               | native field behaviour — never intercept |

  **Subtract is `s`, not `-`.** An earlier version of this table listed `-` in both rows, which cannot
  hold: the minus key has to reach the field or a negative number cannot be typed. Rule 1 below
  decides it — typing wins, so the shortcut moved.

  The remaining collision is `1e+5`: the `+` is claimed as a shortcut, so scientific notation has to
  be written `1e5`. Accepted rather than solved, because every fix costs more than the case is worth.

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
make lint           # gofmt, go vet, oxlint, tsc --noEmit
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
  someone has to remember: `strict` TypeScript, oxlint with its jsx-a11y and react plugins,
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

---

## 10. Delivery plan

Ordered so each phase can be verified before the next depends on it: domain, then the adapter over it,
then the UI against a contract that is already real. Each phase ends in one conventional commit, with
its `docs/PROMPTS.md` entry in the same commit, after the matching reviewer in `.claude/agents/` has
been run.

| Phase | Scope | Status |
| ----- | ----------------------------------------------------------------- | ------ |
| 0 | Repository, conventions, Makefile, coverage gate, README, DESIGN.md | done |
| 1 | `internal/calculator` — operations, sentinel errors, tests          | done |
| 2 | `transport/http` and `cmd/api` — routes, mapping, middleware, server | done, reviewed |
| 3 | Frontend — Vite, typed API client, `useCalculator`, `useKeyboard`, components | |
| 4 | Frontend tests — Vitest, React Testing Library, MSW                 | |
| 5 | Dockerfiles, compose, GitHub Actions                                | |
| 6 | README setup and API examples, coverage reports, final clean-clone check | |

The last item in Phase 6 is not paperwork: clone the repository into an empty directory and follow the
README literally, `docker compose up` included. A submission that fails there has failed regardless of
what the tests say locally.
