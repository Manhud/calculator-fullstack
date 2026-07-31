import { describe, expect, it } from 'vitest'
import { OPERATIONS } from '../api/types'
import { KEYPAD, OPERATOR_GLYPH, keyForBinding } from './keys'

describe('the keypad definition', () => {
  it('offers every operation the contract defines', () => {
    const offered = KEYPAD.flatMap((key) =>
      key.action.kind === 'binary' || key.action.kind === 'unary' ? [key.action.operation] : [],
    )

    expect(offered.toSorted()).toEqual([...OPERATIONS].toSorted())
  })

  // A digit's glyph is its name; a symbol's is not. "÷" announces as "division
  // sign" at best and as nothing at worst, so those need a word.
  it('names every key whose glyph is a symbol', () => {
    const symbolic = KEYPAD.filter((key) => !/^[0-9]$/.test(key.symbol))

    for (const key of symbolic) {
      expect(key.label.trim()).not.toBe('')
      expect(key.label).not.toBe(key.symbol)
      expect(key.label).toMatch(/[a-z]/i)
    }
  })

  // A key bound twice would make one of the two unreachable, and the panel would
  // advertise a shortcut that does nothing.
  it('binds each keyboard key to exactly one action', () => {
    const bindings = KEYPAD.flatMap((key) => [...key.bindings])

    expect(new Set(bindings).size).toBe(bindings.length)
  })

  it('resolves each binding back to its key', () => {
    for (const key of KEYPAD) {
      for (const binding of key.bindings) {
        expect(keyForBinding(binding)?.label).toBe(key.label)
      }
    }
  })

  it('claims no key it does not define', () => {
    expect(keyForBinding('z')).toBeUndefined()
    expect(keyForBinding('F5')).toBeUndefined()
    expect(keyForBinding('Tab')).toBeUndefined()
  })

  // The form UI reserved '-' for typing a negative number and moved subtract to
  // 's'. A keypad has ± for the sign, so '-' means subtract — which is what a
  // hand reaching for it expects.
  it('binds the minus key to subtract, and offers a separate sign toggle', () => {
    expect(keyForBinding('-')?.label).toBe('Subtract')
    expect(KEYPAD.some((key) => key.action.kind === 'toggleSign')).toBe(true)
  })

  it('offers both Enter and = for calculating', () => {
    expect(keyForBinding('Enter')?.action.kind).toBe('equals')
    expect(keyForBinding('=')?.action.kind).toBe('equals')
  })

  // Some layouts put a comma where others put a full stop.
  it('accepts either decimal separator', () => {
    expect(keyForBinding('.')?.action.kind).toBe('decimal')
    expect(keyForBinding(',')?.action.kind).toBe('decimal')
  })

  it('has a glyph for every binary operator it can display', () => {
    const binaryOperations = KEYPAD.flatMap((key) =>
      key.action.kind === 'binary' ? [key.action.operation] : [],
    )

    // Filtered first rather than asserted behind an `if`: a conditional
    // expectation passes silently whenever the condition is false.
    for (const operation of binaryOperations) {
      expect(OPERATOR_GLYPH[operation]).toBeTruthy()
    }
  })
})
