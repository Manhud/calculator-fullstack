import type { Operation } from '../api/types'

/**
 * The keypad, described once.
 *
 * Layout, labels, keyboard bindings and behaviour all read from this list, so a
 * key shown on screen cannot disagree with the key that works — the failure mode
 * of every hand-maintained shortcut legend.
 */

export type KeyAction =
  | { kind: 'digit'; digit: string }
  | { kind: 'decimal' }
  | { kind: 'binary'; operation: Extract<Operation, 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percentage'> }
  | { kind: 'unary'; operation: Extract<Operation, 'sqrt'> }
  | { kind: 'equals' }
  | { kind: 'clear' }
  | { kind: 'backspace' }
  | { kind: 'toggleSign' }

export interface KeyDefinition {
  /** The glyph on the key. Decorative — `label` is the accessible name. */
  symbol: string
  /** What a screen reader announces, and what the tests query by. */
  label: string
  action: KeyAction
  /** Keyboard keys that trigger it. Several where a keyboard offers alternatives. */
  bindings: readonly string[]
  /** Drives the colour family; see index.css. */
  variant: 'digit' | 'operator' | 'function' | 'clear' | 'equals'
  /** Tailwind classes for the cells that are not one column by one row. */
  span?: string
}

export const KEYPAD: readonly KeyDefinition[] = [
  { symbol: 'AC', label: 'Clear all', action: { kind: 'clear' }, bindings: ['Escape'], variant: 'clear' },
  { symbol: '⌫', label: 'Backspace', action: { kind: 'backspace' }, bindings: ['Backspace'], variant: 'function' },
  { symbol: '√', label: 'Square root', action: { kind: 'unary', operation: 'sqrt' }, bindings: ['r'], variant: 'function' },
  { symbol: '÷', label: 'Divide', action: { kind: 'binary', operation: 'divide' }, bindings: ['/'], variant: 'operator' },

  { symbol: 'xʸ', label: 'Power', action: { kind: 'binary', operation: 'power' }, bindings: ['^'], variant: 'function' },
  { symbol: '%', label: 'Percentage', action: { kind: 'binary', operation: 'percentage' }, bindings: ['%'], variant: 'function' },
  { symbol: '±', label: 'Toggle sign', action: { kind: 'toggleSign' }, bindings: [], variant: 'function' },
  { symbol: '×', label: 'Multiply', action: { kind: 'binary', operation: 'multiply' }, bindings: ['*'], variant: 'operator' },

  { symbol: '7', label: '7', action: { kind: 'digit', digit: '7' }, bindings: ['7'], variant: 'digit' },
  { symbol: '8', label: '8', action: { kind: 'digit', digit: '8' }, bindings: ['8'], variant: 'digit' },
  { symbol: '9', label: '9', action: { kind: 'digit', digit: '9' }, bindings: ['9'], variant: 'digit' },
  { symbol: '−', label: 'Subtract', action: { kind: 'binary', operation: 'subtract' }, bindings: ['-'], variant: 'operator' },

  { symbol: '4', label: '4', action: { kind: 'digit', digit: '4' }, bindings: ['4'], variant: 'digit' },
  { symbol: '5', label: '5', action: { kind: 'digit', digit: '5' }, bindings: ['5'], variant: 'digit' },
  { symbol: '6', label: '6', action: { kind: 'digit', digit: '6' }, bindings: ['6'], variant: 'digit' },
  { symbol: '+', label: 'Add', action: { kind: 'binary', operation: 'add' }, bindings: ['+'], variant: 'operator' },

  { symbol: '1', label: '1', action: { kind: 'digit', digit: '1' }, bindings: ['1'], variant: 'digit' },
  { symbol: '2', label: '2', action: { kind: 'digit', digit: '2' }, bindings: ['2'], variant: 'digit' },
  { symbol: '3', label: '3', action: { kind: 'digit', digit: '3' }, bindings: ['3'], variant: 'digit' },
  {
    symbol: '=',
    label: 'Calculate',
    action: { kind: 'equals' },
    bindings: ['Enter', '='],
    variant: 'equals',
    span: 'row-span-2',
  },

  {
    symbol: '0',
    label: '0',
    action: { kind: 'digit', digit: '0' },
    bindings: ['0'],
    variant: 'digit',
    span: 'col-span-2',
  },
  { symbol: '.', label: 'Decimal point', action: { kind: 'decimal' }, bindings: ['.', ','], variant: 'digit' },
]

const BY_BINDING = new Map<string, KeyDefinition>()
for (const key of KEYPAD) {
  for (const binding of key.bindings) BY_BINDING.set(binding, key)
}

export function keyForBinding(pressed: string): KeyDefinition | undefined {
  return BY_BINDING.get(pressed)
}

/**
 * How an operation reads in the expression line. Distinct from the key symbol
 * only for readability: `xʸ` is a good key and a poor infix operator.
 */
export const OPERATOR_GLYPH: Record<string, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percentage: '% of',
}
