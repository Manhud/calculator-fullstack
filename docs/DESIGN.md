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

The code set is closed — ten codes, listed exhaustively in `CLAUDE.md` Section 3. Every one has a
test that provokes it, and a test asserts that nothing outside the set is ever emitted. A closed set
is what lets the frontend handle each case deliberately instead of falling back to "something went
wrong", and what lets its union type be checked for exhaustiveness at compile time.

Domain errors are Go sentinel values matched with `errors.Is`. The mapping from sentinel to code
lives in the transport layer alone, which is what keeps the domain free of HTTP.

**Every client fault is `400`.** `422 Unprocessable Entity` is arguably more precise for a
semantically invalid operand, but splitting client faults across two status codes adds a distinction
the frontend does not act on — it reads the code either way.

**Server faults are separate, and that separation was added after a review.** The first version
mapped an unmapped domain error onto `INVALID_OPERAND` with a 400. That is a lie with consequences: a
caller told its operands were invalid retries with different operands and fails again, while the real
defect leaves no trace. `INTERNAL_ERROR` with a 500 now covers both that case and a recovered panic,
and both log at error level. It is the only code outside the 400 family.

**Every error response is the envelope, including the router's.** A `ServeMux` answers an unmatched
path with `text/plain` by default, so a client that parses every response as JSON would throw on the
one response it did not expect. The bare paths are registered alongside the method-aware patterns to
take that over.

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
and an overflow surfaces as `RESULT_OVERFLOW` instead of a broken response body.

On the way in, the two layers refuse non-finite operands for different reasons, and the split is
deliberate. `encoding/json` already rejects an out-of-range literal like `1e400` with an
`UnmarshalTypeError` — it does *not* decode to `+Inf`, which was verified against the decoder rather
than assumed — and `NaN` and `Infinity` are not JSON syntax at all. So the transport layer maps those
decode failures onto `INVALID_OPERAND`, and no request can hand the domain a non-finite value.

The domain still checks. It defends its own boundary, not the HTTP one: it is an ordinary Go package
that any caller can import, and a guarantee that holds only because of what happens to sit in front of
it is not a guarantee. The practical consequence is that `ErrInvalidOperand` is unreachable through
the API, so the mapping from that sentinel to its error code is covered by testing the mapping
function directly rather than by a request that cannot be constructed.

## Validation on both sides, deliberately

The frontend duplicates the server's rules. This is not an oversight.

The client validates for feedback — the user learns that `sqrt` takes one operand while typing, not
after a round trip. The server validates because it cannot trust a client it does not control; the
API is reachable with `curl` regardless of what the UI permits.

Where they disagree, the server wins. A server error always overrides local state, so a client rule
that drifts out of date degrades the experience without corrupting the result.

## Scope

Kept deliberately small: no auth, no persistence, no database, no users, no state management library.
The assignment asks for correctness, clarity and maintainability, and each of those would trade some
of all three for something nobody requested.

Two things did come in later — chaining and an in-memory history — and they arrived with the keypad
redesign rather than by accretion. The reasoning is below, and `CLAUDE.md` Section 1 was changed to
match: a scope that quietly grows is worse than one that is revised in the open.

### The keypad, and why the form went away

The first frontend was a form: choose one of seven operations, fill in "First number" and "Second
number", press Calculate. It worked, it was accessible, and it was tested — and it took four
interactions to add two numbers, which is not how anyone uses a calculator.

It is now a keypad. You type `12 × 4 =` the way you would on a physical one, the expression builds on
the line above the result, and the last few answers sit beside it where they can be reused.

**This brought two things that were previously out of scope**, and the scope was changed rather than
the design bent around it. *Chaining* — `2 + 3 ×` resolving `2 + 3` before accepting the new operator
— is not a feature bolted onto a keypad; it is what makes one a calculator rather than a form with
smaller buttons. *History* is where the results of a keypad go: it is eight entries held in memory,
gone on reload, and closer to a display of what just happened than to a feature with storage behind it.

**Every arithmetic result still comes from the Go service, including the intermediate ones.** Chaining
three operations makes three requests. Computing the intermediate step in the browser would be faster
and invisible, and it would make the service decorative — an outage would show correct answers the
browser invented. The reference prototype included exactly such a local fallback so it could be demoed
without a backend; it is deliberately absent here.

**What the redesign did not touch**: the API layer, the contract, the error taxonomy, and every
guarantee in Section 5 that is not about layout. Keys are real buttons with names — `÷` announces as
"Divide", not as "division sign" — the display is a live region, errors are words rather than a colour,
and focus stays visible. The test suite was the safety net: it was rewritten alongside the UI, and a
label or a role lost in the rewrite fails the build rather than shipping.

**Fonts are self-hosted** through `@fontsource` rather than fetched from Google. A CDN request fails
inside a container with no internet, and this is meant to be run with `docker compose up`.

**The state machine is mirrored into a ref.** Deciding what a key does means reading the current state
*and* sometimes firing a request, and a request cannot live inside a `setState` updater: React invokes
updaters twice under StrictMode, which would send every calculation twice.

### Additions beyond the assignment

**Keyboard input.** Not requested, added on purpose: a calculator you cannot type into is a demo
rather than a tool. Scoped tightly — one hook, no keybinding library.

The rules changed with the keypad, and the change is instructive. While the UI was a form, typing had
to win and `Backspace` was never to be intercepted, because a text field owned them; subtract was
bound to `s` so the minus key could reach the field. A keypad has no text field, so the hook owns the
keyboard outright, `±` handles the sign, and `-` means subtract — which is what a hand reaching for it
expects. What survived unchanged is the bailing out, and it matters more now than it did: this
listener sees every keystroke on the page, so it stands aside for a held modifier, for IME
composition, and for any text control a later change might add.

**Operation chaining and history.** Both were explicitly out of scope while the UI was a form, and
both came in with the keypad. See "The keypad, and why the form went away" above.

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
