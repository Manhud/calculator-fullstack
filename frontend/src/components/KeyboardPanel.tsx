/**
 * The keyboard map, where a user can read it.
 *
 * Grouped by what a person would look for rather than listed key by key: nobody
 * scans eleven rows to learn that digits type digits.
 */
const ROWS: readonly { keys: string; description: string }[] = [
  { keys: '0-9 .', description: 'Enter numbers' },
  { keys: '+ - * / ^ %', description: 'Operators' },
  { keys: 'r', description: 'Square root' },
  { keys: 'Enter', description: 'Calculate' },
  { keys: 'Esc', description: 'Clear all' },
  { keys: 'Backspace', description: 'Delete a character' },
]

export function KeyboardPanel() {
  return (
    <section
      aria-labelledby="keyboard-heading"
      className="flex flex-col gap-2.5 rounded-2xl border border-card-edge bg-card px-4 py-3.5"
    >
      <h2
        id="keyboard-heading"
        className="text-xs font-semibold tracking-[0.08em] text-ink-subtle uppercase"
      >
        Keyboard
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
        {ROWS.map((row) => (
          <div key={row.keys} className="contents">
            <dt>
              <kbd className="rounded-md border border-code-edge bg-display px-[7px] py-0.5 font-mono text-[13px] text-ink-soft">
                {row.keys}
              </kbd>
            </dt>
            <dd className="self-center text-[13px] text-ink-muted">{row.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
