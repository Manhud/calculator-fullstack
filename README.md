# Calculator

A calculator split across two services: a Go REST API that owns the arithmetic, and a React +
TypeScript frontend that consumes it.

The interesting part is not the arithmetic. It is where the rules live, how a bad input is refused,
and what happens at the edges — division by zero, the square root of a negative, a result that
overflows past what a `float64` can hold.

## Design at a glance

**One endpoint, operation as data.** `POST /api/v1/calculations` takes `{"operation": "...",
"operands": [...]}` rather than exposing `/add`, `/divide` and a route per operation. One validation
path, one error envelope, and adding an operation touches a switch statement instead of a new route,
handler and test file.

**Errors are codes, not prose.** Every client fault returns a machine-readable code —
`DIVISION_BY_ZERO`, `NEGATIVE_SQRT`, `RESULT_OVERFLOW` and four others — alongside a human message.
The frontend branches on the code and never parses the message. A fault in the service itself is
`INTERNAL_ERROR` with a 500, kept distinct so a bug here is never reported as the caller's mistake.
Every error response uses that envelope, including the router's 404 and 405.

**The domain knows nothing about HTTP.** `internal/calculator` imports no transport, no JSON and no
framework, so the arithmetic is tested without starting a server. Dependencies point inward.

**Arithmetic is `float64`, deliberately.** It is idiomatic, dependency-free and adequate for a
calculator. It is *not* adequate for money: `0.1 + 0.2` is not `0.3`, and in a payments context this
would use exact decimal arithmetic or integer minor units instead. Results that come out `NaN` or
`±Inf` are rejected before encoding rather than serialised.

Full rationale, including the alternatives that were considered and rejected, is in
[docs/DESIGN.md](docs/DESIGN.md).

## Repository

```
backend/    Go service — pure domain in internal/calculator, HTTP adapter in internal/transport
frontend/   React + TypeScript — all network access confined to src/api
docs/       DESIGN.md (rationale) · PROMPTS.md (AI-usage log) · coverage/ (reports)
scripts/    coverage.sh — renders the report and fails the build below threshold
```

`CLAUDE.md` holds the conventions this repository is written against: the frozen API contract, the
dependency rule, and the definition of done. It is committed on purpose — the constraints were set
before the code, and it is the specification the review agents in `.claude/agents/` check against.

## Commands

```bash
make help       # list every target
make test       # both test suites
make coverage   # regenerate docs/coverage/ and enforce the thresholds
make lint       # gofmt, go vet, eslint, tsc --noEmit
```

## AI usage

This was built with Claude Code. [docs/PROMPTS.md](docs/PROMPTS.md) records the prompts, what came
back, and — the part worth reading — where the output was corrected or rejected, and why.
