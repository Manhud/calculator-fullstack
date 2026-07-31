/**
 * Client-side validation, duplicated from the server on purpose.
 *
 * It exists for feedback, not for safety: the user learns that "abc" is not a
 * number while typing rather than after a round trip. The server validates the
 * same rules because it cannot trust a client it does not control, and a server
 * error always overrides anything decided here.
 */

export type OperandProblem = 'empty' | 'not-a-number' | 'not-finite'

export type ParsedOperand =
  | { ok: true; value: number }
  | { ok: false; problem: OperandProblem }

export function parseOperand(raw: string): ParsedOperand {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, problem: 'empty' }

  // Number('') is 0 and Number(' ') is 0, which is why the empty check comes
  // first: without it, an empty field would quietly calculate with zero.
  const value = Number(trimmed)
  if (Number.isNaN(value)) return { ok: false, problem: 'not-a-number' }
  // Number('1e400') is Infinity. The server rejects it too, but only after a
  // round trip that this saves.
  if (!Number.isFinite(value)) return { ok: false, problem: 'not-finite' }

  return { ok: true, value }
}

export function operandProblemMessage(problem: OperandProblem): string {
  switch (problem) {
    case 'empty':
      return 'Enter a number.'
    case 'not-a-number':
      return 'This is not a number.'
    case 'not-finite':
      return 'This number is too large to calculate with.'
  }
}
