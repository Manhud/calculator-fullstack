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
`tsc --noEmit`, `eslint-plugin-jsx-a11y` and `go vet` fail the same way every time. So the reviewers
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
