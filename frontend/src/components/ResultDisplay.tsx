import type { CalculatorState } from '../hooks/useCalculator'

interface Props {
  state: CalculatorState
}

/**
 * Formats for display only. The value sent to the server is never rounded — that
 * would silently change the calculation.
 *
 * toPrecision(12) trims the artefacts of binary floating point (0.1 + 0.2
 * showing as 0.30000000000000004) without inventing precision, and Number()
 * strips the trailing zeros it leaves behind.
 */
function formatResult(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  return String(Number(value.toPrecision(12)))
}

/**
 * `<output>` carries an implicit `role="status"`, so the result is announced when
 * it arrives without stealing focus from the field the user is in. `role="alert"`
 * would interrupt them, which is right for an error and wrong for an answer.
 */
export function ResultDisplay({ state }: Props) {
  return (
    <output
      aria-live="polite"
      className="block rounded-xl border border-edge bg-panel px-4 py-6 text-center font-mono text-4xl leading-none break-all sm:text-5xl"
    >
      {state.status === 'success' ? (
        <span className="text-accent">{formatResult(state.result)}</span>
      ) : (
        <span className="text-ink-dim/40">
          {state.status === 'loading' ? 'Calculating…' : '—'}
        </span>
      )}
    </output>
  )
}
