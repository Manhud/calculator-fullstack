import type { OperationMeta } from '../domain/operations'

interface Props {
  operation: OperationMeta
  values: string[]
  onChange: (index: number, value: string) => void
}

/**
 * One labelled field per operand.
 *
 * `inputMode="decimal"` brings up the numeric keypad on a phone without the
 * baggage of `type="number"`, whose spinners and silent rejection of partial
 * input ("1e", "-") make it worse than text for a field being typed into.
 */
export function OperandFields({ operation, values, onChange }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {operation.operandLabels.map((label, index) => {
        const id = `operand-${operation.id}-${index}`
        return (
          <div key={id} className="flex flex-col gap-1.5">
            {/* A real label, associated by htmlFor. A placeholder is not a label:
                it disappears exactly when the user needs it. */}
            <label htmlFor={id} className="text-xs font-medium text-ink-dim">
              {label}
            </label>
            <input
              id={id}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={values[index] ?? ''}
              onChange={(event) => onChange(index, event.target.value)}
              className={[
                'rounded-lg border border-edge bg-panel px-3 py-2.5',
                'font-mono text-lg text-ink',
              ].join(' ')}
            />
          </div>
        )
      })}
    </div>
  )
}
