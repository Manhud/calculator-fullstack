import { describe, expect, it } from 'vitest'
import { operandProblemMessage, parseOperand } from './validation'

describe('parseOperand', () => {
  it.each([
    ['2', 2],
    ['-2', -2],
    ['2.5', 2.5],
    ['  7  ', 7],
    ['1e5', 100000],
    ['0', 0],
  ])('accepts %s', (raw, expected) => {
    expect(parseOperand(raw)).toEqual({ ok: true, value: expected })
  })

  // Number('') and Number('   ') are both 0, so without an explicit empty check
  // a blank field would quietly calculate with zero.
  it.each(['', '   '])('rejects %o as empty rather than reading it as zero', (raw) => {
    expect(parseOperand(raw)).toEqual({ ok: false, problem: 'empty' })
  })

  it.each(['abc', '1,5', '2..5', '--3'])('rejects %s as not a number', (raw) => {
    expect(parseOperand(raw)).toEqual({ ok: false, problem: 'not-a-number' })
  })

  // Number('1e400') is Infinity. The server rejects it too, but this saves the
  // round trip and names the problem more precisely.
  it.each(['1e400', '-1e400'])('rejects %s as beyond float64', (raw) => {
    expect(parseOperand(raw)).toEqual({ ok: false, problem: 'not-finite' })
  })

  it('gives every problem a message', () => {
    for (const problem of ['empty', 'not-a-number', 'not-finite'] as const) {
      expect(operandProblemMessage(problem)).not.toBe('')
    }
  })
})
