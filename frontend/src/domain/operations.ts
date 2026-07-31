import type { Operation } from '../api/types'

/**
 * One description of each operation, used by the buttons, the field labels and
 * the keyboard map. Kept in a single place so those three cannot drift: a
 * shortcut shown on a button that the handler does not implement is worse than
 * no shortcut at all.
 */
export interface OperationMeta {
  id: Operation
  /** Shown on the button and read by screen readers. */
  label: string
  /** Shown alongside the label. Decorative — never the only identification. */
  symbol: string
  arity: 1 | 2
  /** The key from CLAUDE.md Section 5 that selects this operation. */
  shortcut: string
  /**
   * Field labels. "Operand 1" and "Operand 2" would be accurate and useless;
   * percentage in particular is unreadable without naming its two roles.
   */
  operandLabels: readonly [string] | readonly [string, string]
}

export const OPERATION_LIST: readonly OperationMeta[] = [
  {
    id: 'add',
    label: 'Add',
    symbol: '+',
    arity: 2,
    shortcut: '+',
    operandLabels: ['First number', 'Second number'],
  },
  {
    id: 'subtract',
    label: 'Subtract',
    symbol: '−',
    arity: 2,
    // 's', not '-'. The minus key has to reach the field so a negative number
    // can be typed at all, and typing always wins over a shortcut.
    shortcut: 's',
    operandLabels: ['Start with', 'Subtract'],
  },
  {
    id: 'multiply',
    label: 'Multiply',
    symbol: '×',
    arity: 2,
    shortcut: '*',
    operandLabels: ['First number', 'Second number'],
  },
  {
    id: 'divide',
    label: 'Divide',
    symbol: '÷',
    arity: 2,
    shortcut: '/',
    operandLabels: ['Divide', 'By'],
  },
  {
    id: 'power',
    label: 'Power',
    symbol: 'xʸ',
    arity: 2,
    shortcut: '^',
    operandLabels: ['Base', 'Exponent'],
  },
  {
    id: 'sqrt',
    label: 'Square root',
    symbol: '√',
    arity: 1,
    shortcut: 'r',
    operandLabels: ['Value'],
  },
  {
    id: 'percentage',
    label: 'Percentage',
    symbol: '%',
    arity: 2,
    shortcut: '%',
    operandLabels: ['Percent', 'Of'],
  },
] as const

const BY_ID = new Map<Operation, OperationMeta>(OPERATION_LIST.map((op) => [op.id, op]))

export function operationMeta(id: Operation): OperationMeta {
  const meta = BY_ID.get(id)
  // Unreachable while Operation is the union of the ids above, but the alternative
  // is a non-null assertion that would silently return undefined if that changed.
  if (!meta) throw new Error(`no metadata for operation ${id}`)
  return meta
}

const BY_SHORTCUT = new Map<string, OperationMeta>(
  OPERATION_LIST.map((op) => [op.shortcut, op]),
)

export function operationForShortcut(key: string): OperationMeta | undefined {
  return BY_SHORTCUT.get(key)
}
