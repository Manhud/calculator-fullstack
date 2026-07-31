import type { CalculatorState } from '../hooks/useCalculator'

interface Props {
  state: CalculatorState
}

/**
 * `role="alert"` because an error is worth interrupting for — unlike a result,
 * it needs acting on before anything else makes sense.
 *
 * The message is text, and the colour only reinforces it. An error signalled by
 * red alone is invisible to a colour-blind user and to anyone reading in
 * sunlight.
 */
export function ErrorBanner({ state }: Props) {
  if (state.status !== 'error') return null

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-alarm/50 bg-alarm/10 px-3.5 py-3"
    >
      <span aria-hidden="true" className="mt-px font-mono text-alarm">
        !
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm text-ink">{state.message}</p>
        {state.origin === 'server' && state.code ? (
          <p className="font-mono text-xs text-ink-dim">{state.code}</p>
        ) : null}
      </div>
    </div>
  )
}
