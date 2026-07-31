import type { CalculatorState } from '../hooks/useCalculator'

interface Props {
  state: CalculatorState
}

/**
 * Three lines: the expression being built, the current value, and a status line.
 *
 * The whole block is one live region rather than three. A screen reader should
 * hear "twelve times four equals, forty-eight" as one announcement, not as three
 * updates racing each other.
 */
export function Display({ state }: Props) {
  const { expression, entry, busy, error, latencyMs } = state

  return (
    <output
      aria-live="polite"
      className="flex min-h-[118px] flex-col justify-between gap-2 rounded-[14px] border border-display-edge bg-display px-[18px] py-4"
    >
      <p className="truncate font-mono text-sm tracking-[0.02em] text-ink-subtle">
        {expression || ' '}
      </p>

      <p className="truncate pb-1 text-right font-mono text-[40px]/[1.3] font-medium text-ink">
        {error ? 'Error' : entry}
      </p>

      {/*
        The status line carries three different things, and the error is the one
        that must never be conveyed by colour alone — it is the full message from
        the service, in words.
      */}
      <p className="min-h-[18px] text-right font-mono text-xs text-accent">
        {busy ? 'computing…' : error ? error : latencyMs === null ? ' ' : `Go service · ${latencyMs} ms`}
      </p>
    </output>
  )
}
