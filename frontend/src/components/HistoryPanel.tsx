import type { HistoryEntry } from '../hooks/useCalculator'

interface Props {
  history: readonly HistoryEntry[]
  onRecall: (entry: HistoryEntry) => void
  onClear: () => void
}

/**
 * The last few results, newest first, each reusable as the next input.
 *
 * In memory only: it is a record of what just happened on this page, not a
 * feature with storage behind it.
 */
export function HistoryPanel({ history, onRecall, onClear }: Props) {
  return (
    <section
      aria-labelledby="history-heading"
      className="flex flex-col gap-2.5 rounded-2xl border border-card-edge bg-card px-4 py-3.5"
    >
      <div className="flex items-center justify-between">
        <h2
          id="history-heading"
          className="text-xs font-semibold tracking-[0.08em] text-ink-subtle uppercase"
        >
          History
        </h2>
        {history.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-ink-subtle hover:text-ink-body"
          >
            clear
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <p className="text-[13px] text-ink-faintest">Your last calculations will show up here.</p>
      ) : (
        <ul className="flex flex-col">
          {history.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onRecall(entry)}
                // The name says what pressing it does. "12 × 4 = 48" alone would
                // read as a statement rather than as something actionable.
                aria-label={`Reuse ${entry.value} from ${entry.expression}`}
                className="flex w-full flex-col items-end border-t border-rule pt-2 pb-1.5 hover:opacity-75"
              >
                <span aria-hidden="true" className="font-mono text-xs text-ink-fainter">
                  {entry.expression}
                </span>
                <span aria-hidden="true" className="font-mono text-base text-ink-body">
                  {entry.value}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
