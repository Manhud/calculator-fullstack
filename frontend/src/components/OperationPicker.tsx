import type { Operation } from '../api/types'
import { OPERATION_LIST } from '../domain/operations'

interface Props {
  selected: Operation
  onSelect: (operation: Operation) => void
}

/**
 * Native radio inputs in a fieldset, styled through the `peer` variants.
 *
 * The first version used buttons with `role="radio"` inside a `role="radiogroup"`.
 * That markup promises arrow-key navigation and a single tab stop, and delivers
 * neither unless both are implemented by hand — an ARIA role the code does not
 * honour is worse than no role, because assistive technology believes it. Real
 * radios come with the behaviour built in.
 */
export function OperationPicker({ selected, onSelect }: Props) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="sr-only">Operation</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPERATION_LIST.map((operation) => (
          <label key={operation.id} className="cursor-pointer">
            <input
              type="radio"
              name="operation"
              value={operation.id}
              checked={operation.id === selected}
              aria-keyshortcuts={operation.shortcut}
              onChange={() => onSelect(operation.id)}
              className="peer sr-only"
            />
            {/* The input is visually hidden, so its focus ring has to be drawn
                here or keyboard users cannot see where they are. */}
            <span
              className={[
                'flex flex-col items-center gap-1 rounded-lg border px-3 py-3 transition-colors',
                'border-edge bg-panel-raised text-ink',
                'peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
              ].join(' ')}
            >
              {/* Decoration: the label below is the accessible name. */}
              <span aria-hidden="true" className="font-mono text-lg leading-none">
                {operation.symbol}
              </span>
              <span className="text-xs font-medium">{operation.label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
