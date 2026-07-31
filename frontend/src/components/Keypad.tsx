import { KEYPAD } from '../domain/keys'
import type { KeyAction, KeyDefinition } from '../domain/keys'

interface Props {
  onPress: (action: KeyAction) => void
}

/**
 * Colour families from the design tokens. Kept as whole class strings rather
 * than interpolated fragments, because Tailwind only ships the classes it can
 * see in the source.
 */
const VARIANT: Record<KeyDefinition['variant'], string> = {
  digit: 'bg-key-digit border-key-digit-edge text-ink hover:bg-key-digit-hover text-xl',
  operator: 'bg-key-operator border-key-operator-edge text-accent hover:bg-key-operator-hover text-xl',
  function: 'bg-key-function border-key-function-edge text-ink-soft hover:bg-key-function-hover text-[17px]',
  clear: 'bg-key-clear border-key-clear-edge text-danger hover:bg-key-clear-hover font-sans text-[15px] font-semibold',
  equals: 'bg-accent border-accent text-on-accent hover:bg-accent-hover text-[22px] font-bold',
}

export function Keypad({ onPress }: Props) {
  return (
    // The row height lives on the grid, not on the keys: a fixed height on the
    // button would cap the `=` key at one row and quietly cancel its row span.
    <div className="grid grid-cols-4 gap-2.5 [grid-auto-rows:3.5rem]">
      {KEYPAD.map((key) => (
        <button
          key={key.label}
          type="button"
          // The glyph is decorative, so the accessible name is set explicitly:
          // "÷" announces as "division sign" at best, and as nothing at worst.
          aria-label={key.label}
          aria-keyshortcuts={key.bindings.join(' ') || undefined}
          onClick={() => onPress(key.action)}
          className={[
            'flex h-full items-center justify-center rounded-xl border font-mono transition-colors',
            VARIANT[key.variant],
            key.span ?? '',
          ].join(' ')}
        >
          <span aria-hidden="true">{key.symbol}</span>
        </button>
      ))}
    </div>
  )
}
