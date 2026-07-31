import { describe, expect, it } from 'vitest'
import {
  INITIAL_ENTRY,
  appendDecimalPoint,
  appendDigit,
  deleteLastCharacter,
  formatValue,
  parseEntry,
  toggleSign,
} from './entry'

describe('appendDigit', () => {
  it('replaces the entry when the next digit starts a new number', () => {
    expect(appendDigit('48', '7', true)).toBe('7')
  })

  it('appends when the user is mid-number', () => {
    expect(appendDigit('4', '2', false)).toBe('42')
  })

  // Otherwise every number begins "0…": 0, then 07, then 071.
  it('replaces a lone zero rather than growing it', () => {
    expect(appendDigit(INITIAL_ENTRY, '5', false)).toBe('5')
  })

  it('keeps the sign when replacing a negative zero', () => {
    expect(appendDigit('-0', '5', false)).toBe('-5')
  })
})

describe('appendDecimalPoint', () => {
  it('starts a new decimal from zero', () => {
    expect(appendDecimalPoint('48', true)).toBe('0.')
  })

  it('adds a point to the number being typed', () => {
    expect(appendDecimalPoint('3', false)).toBe('3.')
  })

  // "1.2.3" would be typeable and then rejected by the parser, which reports a
  // mistake the keypad should never have allowed.
  it('refuses a second point', () => {
    expect(appendDecimalPoint('3.1', false)).toBe('3.1')
  })
})

describe('deleteLastCharacter', () => {
  it('removes the last character', () => {
    expect(deleteLastCharacter('123', false)).toBe('12')
  })

  it('falls back to zero rather than an empty display', () => {
    expect(deleteLastCharacter('1', false)).toBe(INITIAL_ENTRY)
  })

  it('does not leave a bare minus sign', () => {
    expect(deleteLastCharacter('-5', false)).toBe(INITIAL_ENTRY)
  })

  // Trimming digits off a computed result produces a number nobody entered.
  it('clears rather than editing a result', () => {
    expect(deleteLastCharacter('48', true)).toBe(INITIAL_ENTRY)
  })
})

describe('toggleSign', () => {
  it('adds and removes the sign', () => {
    expect(toggleSign('5')).toBe('-5')
    expect(toggleSign('-5')).toBe('5')
  })

  // "-0" on the display reads as a bug.
  it.each(['0', '-0', '0.0'])('leaves %s alone', (entry) => {
    expect(toggleSign(entry)).toBe(entry)
  })
})

describe('formatValue', () => {
  it('shows an integer without a decimal part', () => {
    expect(formatValue(48)).toBe('48')
  })

  // The artefact this exists for: 0.1 + 0.2 comes back as 0.30000000000000004.
  it('trims binary floating point noise without inventing precision', () => {
    expect(formatValue(0.30000000000000004)).toBe('0.3')
    expect(formatValue(2.5)).toBe('2.5')
  })

  it('keeps a value that genuinely needs its digits', () => {
    expect(formatValue(1 / 3)).toBe('0.333333333333')
  })
})

describe('parseEntry', () => {
  it.each([
    ['5', 5],
    ['-5', -5],
    ['0.25', 0.25],
    // Three, finished. Refusing it would reject a number the user has typed.
    ['3.', 3],
  ])('reads %s', (entry, expected) => {
    expect(parseEntry(entry)).toBe(expected)
  })

  // Number('') is 0 and Number('-') is NaN, so these are named rather than left
  // to coincidence.
  it.each(['', '-', '.'])('refuses %o as incomplete', (entry) => {
    expect(parseEntry(entry)).toBeNull()
  })
})
