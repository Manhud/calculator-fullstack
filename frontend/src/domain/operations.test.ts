import { describe, expect, it } from 'vitest'
import { OPERATIONS } from '../api/types'
import { OPERATION_LIST, operationForShortcut, operationMeta } from './operations'

describe('the operation registry', () => {
  it('describes every operation the contract defines, and no others', () => {
    expect(OPERATION_LIST.map((op) => op.id).toSorted()).toEqual([...OPERATIONS].toSorted())
  })

  // Stated as a whole rather than checked in a loop with an `if`: a conditional
  // expectation passes silently whenever the condition is false.
  it('matches the arity the contract states', () => {
    const arities = Object.fromEntries(OPERATION_LIST.map((op) => [op.id, op.arity]))

    expect(arities).toEqual({
      add: 2,
      subtract: 2,
      multiply: 2,
      divide: 2,
      power: 2,
      percentage: 2,
      sqrt: 1,
    })
  })

  it('gives each operation one label per operand', () => {
    for (const operation of OPERATION_LIST) {
      expect(operation.operandLabels).toHaveLength(operation.arity)
      for (const label of operation.operandLabels) expect(label).not.toBe('')
    }
  })

  // Two operations sharing a key would make one of them unreachable, and the
  // legend would advertise a shortcut that does nothing.
  it('assigns a distinct shortcut to each operation', () => {
    const shortcuts = OPERATION_LIST.map((op) => op.shortcut)
    expect(new Set(shortcuts).size).toBe(shortcuts.length)
  })

  // A calculator that cannot take a negative number is broken, so the minus key
  // has to reach the field. Subtract is `s` for exactly that reason.
  it('never claims the minus key, which belongs to the operand field', () => {
    expect(OPERATION_LIST.map((op) => op.shortcut)).not.toContain('-')
    expect(operationMeta('subtract').shortcut).toBe('s')
  })

  it('resolves a shortcut back to its operation', () => {
    for (const operation of OPERATION_LIST) {
      expect(operationForShortcut(operation.shortcut)?.id).toBe(operation.id)
    }
  })

  it('returns nothing for a key no operation claims', () => {
    expect(operationForShortcut('z')).toBeUndefined()
  })
})
