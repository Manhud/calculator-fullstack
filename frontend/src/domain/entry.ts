/**
 * The rules for the number being typed.
 *
 * A calculator's entry is a *string* until it is sent, not a number: "3." and
 * "-0" are states a user passes through that `number` cannot represent. Keeping
 * it textual is what lets the display show exactly what was typed.
 */

export const INITIAL_ENTRY = '0'

export function appendDigit(entry: string, digit: string, fresh: boolean): string {
  if (fresh || entry === INITIAL_ENTRY) return digit
  if (entry === '-0') return `-${digit}`
  return entry + digit
}

export function appendDecimalPoint(entry: string, fresh: boolean): string {
  if (fresh) return '0.'
  // One point per number. Without this, "1.2.3" is typeable and then rejected by
  // the parser, which reports a mistake the keypad should not have allowed.
  return entry.includes('.') ? entry : `${entry}.`
}

export function deleteLastCharacter(entry: string, fresh: boolean): string {
  // After a result, backspace clears rather than editing the result's digits:
  // trimming a computed value produces a number the user never entered.
  if (fresh) return INITIAL_ENTRY
  const trimmed = entry.slice(0, -1)
  if (trimmed === '' || trimmed === '-') return INITIAL_ENTRY
  return trimmed
}

export function toggleSign(entry: string): string {
  // Zero has no sign worth showing, and "-0" on the display reads as a bug.
  if (Number(entry) === 0) return entry
  return entry.startsWith('-') ? entry.slice(1) : `-${entry}`
}

/**
 * Formats a result for display.
 *
 * `toPrecision(12)` trims the artefacts of binary floating point — 0.1 + 0.2
 * arriving as 0.30000000000000004 — without inventing precision, and `Number`
 * strips the trailing zeros it leaves behind. The value sent to the service is
 * never rounded: that would change the calculation rather than its presentation.
 */
export function formatValue(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value)
  return String(Number(value.toPrecision(12)))
}

/**
 * The entry as a number the service can be asked about, or null when it is not
 * one yet.
 *
 * `Number('')` is 0 and `Number('-')` is NaN, so the incomplete states are named
 * rather than left to coincidence. "3." is allowed through: it is three, and
 * refusing it would reject a number the user has finished typing.
 */
export function parseEntry(entry: string): number | null {
  if (entry === '' || entry === '-' || entry === '.') return null
  const value = Number(entry)
  return Number.isFinite(value) ? value : null
}
