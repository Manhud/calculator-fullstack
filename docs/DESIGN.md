# Design decisions

Written as decisions are made rather than reconstructed at the end. Each entry records the
alternative that was rejected, because a decision without a discarded option is not a decision.

## One endpoint, operation as data

`POST /api/v1/calculations` carries the operation in the body:

```json
{ "operation": "divide", "operands": [10, 4] }
```

**Rejected:** a route per operation — `POST /api/v1/add`, `/divide`, and so on. It is the more
REST-purist reading, and it makes each operation independently discoverable.

**Why the single endpoint won.** Seven routes means seven decode paths, seven arity checks and seven
places for the error envelope to drift apart. Adding an operation touches a switch statement and a
map instead of a route, a handler and a test file. The resource here is the *calculation*, and the
operation is one of its attributes — `sqrt` is no more a resource than `divide` is.

**What it costs.** The URL no longer describes the work, so an HTTP cache or a gateway cannot
distinguish operations without reading the body. For a stateless calculator with no cacheable
responses, that costs nothing. For an API where operations had different rate limits or permissions,
it would, and separate routes would be the better answer.

## Errors are codes, with a message beside them

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "cannot divide by zero" } }
```

The code is the contract; the message is for a human reading a log. The frontend branches on the
code and never parses the message, so message wording can change without breaking a client.

The code set is closed — seven codes, listed exhaustively in `CLAUDE.md` Section 3. Every one has a
test that provokes it. A closed set is what lets the frontend handle each case deliberately instead
of falling back to "something went wrong".

Domain errors are Go sentinel values matched with `errors.Is`. The mapping from sentinel to code
lives in the transport layer alone, which is what keeps the domain free of HTTP.

**Every client fault is `400`.** `422 Unprocessable Entity` is arguably more precise for a
semantically invalid operand, but splitting client faults across two status codes adds a distinction
the frontend does not act on — it reads the code either way.

## The domain does not know about HTTP

`internal/calculator` imports nothing from this repository and nothing transport-shaped. The
arithmetic is tested without starting a server, and the HTTP layer is tested with `httptest` without
reimplementing arithmetic.

This is the first thing worth checking in the repository, and it is checkable mechanically: if
`net/http` or `encoding/json` appears in the domain's imports, the design has been violated.

## `float64`, and why that would be wrong for money

All arithmetic is `float64`. It is idiomatic Go, dependency-free, and its precision is adequate for a
calculator UI.

It is the wrong choice for money. `0.1 + 0.2` evaluates to `0.30000000000000004`, and binary floating
point cannot represent most decimal fractions exactly. In a payments system this would use exact
decimal arithmetic (`shopspring/decimal`) or integer minor units — cents as `int64` — where rounding
is explicit and auditable rather than an artefact of the representation.

The decision here is scope, not ignorance of the trade-off, and the migration path is a swap of the
numeric type inside the domain package. The transport layer and the frontend contract do not change.

**Non-finite results are rejected, not serialised.** `NaN` and `±Inf` are not representable in JSON —
`encoding/json` errors rather than emitting them. Every operation checks its result before returning,
and an overflow surfaces as `RESULT_OVERFLOW` instead of a broken response body. This also covers the
subtler input case: a request containing `1e400` decodes *successfully* into `+Inf`, so operands are
validated as finite on the way in as well as on the way out.

## Validation on both sides, deliberately

The frontend duplicates the server's rules. This is not an oversight.

The client validates for feedback — the user learns that `sqrt` takes one operand while typing, not
after a round trip. The server validates because it cannot trust a client it does not control; the
API is reachable with `curl` regardless of what the UI permits.

Where they disagree, the server wins. A server error always overrides local state, so a client rule
that drifts out of date degrades the experience without corrupting the result.

## Scope

Kept deliberately small: no auth, no persistence, no calculation history, no state management
library. The assignment asks for correctness, clarity and maintainability, and each of those
additions would trade some of all three for a feature nobody requested.

### Additions beyond the assignment

**Keyboard input.** Not requested, added on purpose: a calculator you cannot type into is a demo
rather than a tool. Scoped tightly — a hook of roughly forty lines, no keybinding library. The rules
that keep it from becoming a liability are in `CLAUDE.md` Section 5: it never synthesises digits, it
bails out on modifier keys and on IME composition, it never intercepts `Backspace`, and every action
it offers is also reachable by mouse and by `Tab`.

**Tailwind v4** for styling, and **not** shadcn/ui. Tailwind gives consistent spacing and colour
scales without inventing a design system for a form with two inputs. A component generator would
vendor a few hundred lines of code into the repository that the author did not write, which is the
opposite of what a small, readable submission should contain.

## Assumptions

- `percentage` is `a percent of b` — `percentage(50, 200) = 100`. The assignment does not define it,
  and this is the reading that matches how a percentage key behaves on a physical calculator.
- `power` accepts a negative or fractional exponent. `power(-8, 1/3)` is `NaN` in IEEE 754 rather
  than `-2`, and is rejected as `RESULT_OVERFLOW` rather than special-cased.
- Operand count is exactly the arity of the operation — two for everything except `sqrt`, which takes
  one. Extra operands are refused rather than ignored, so a malformed request is never silently
  reinterpreted as a valid one.
