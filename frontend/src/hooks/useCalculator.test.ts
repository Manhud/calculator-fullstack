import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCalculator } from './useCalculator'
import {
  respondSlowly,
  respondWith,
  respondWithError,
  respondWithNetworkFailure,
} from '../test/server'

describe('useCalculator', () => {
  it('starts idle with one blank field per operand', () => {
    const { result } = renderHook(() => useCalculator())

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(result.current.operands).toEqual(['', ''])
  })

  it('reaches success with the server’s result', async () => {
    respondWith(2.5)
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.selectOperation('divide'))
    act(() => result.current.setOperand(0, '10'))
    act(() => result.current.setOperand(1, '4'))
    act(() => result.current.submit())

    await waitFor(() => expect(result.current.state.status).toBe('success'))
    expect(result.current.state).toMatchObject({ result: 2.5, operation: 'divide' })
  })

  it('rebuilds the operand list when the arity changes', () => {
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.setOperand(0, '9'))
    act(() => result.current.setOperand(1, '3'))
    act(() => result.current.selectOperation('sqrt'))

    expect(result.current.operands).toEqual([''])

    // Switching back must not resurrect the value the second field held.
    act(() => result.current.selectOperation('add'))
    expect(result.current.operands).toEqual(['', ''])
  })

  it('refuses to send a blank operand and says which field', () => {
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.setOperand(0, '10'))
    act(() => result.current.submit())

    // Asserted in one shot rather than behind a type guard: an `if` around an
    // expectation makes the test pass silently when the guard is false.
    expect(result.current.state).toMatchObject({
      status: 'error',
      origin: 'client',
      message: expect.stringContaining('Second number'),
    })
  })

  it('carries the server code on a server error', async () => {
    respondWithError('DIVISION_BY_ZERO', 'cannot divide by zero')
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.selectOperation('divide'))
    act(() => result.current.setOperand(0, '10'))
    act(() => result.current.setOperand(1, '0'))
    act(() => result.current.submit())

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state).toMatchObject({
      origin: 'server',
      code: 'DIVISION_BY_ZERO',
      message: 'cannot divide by zero',
    })
  })

  // Section 5: the server is authoritative. Local validation is a convenience,
  // and its verdict must never survive a contradicting answer from the service.
  it('lets a server error replace a client error', async () => {
    respondWithError('RESULT_OVERFLOW', 'the result is too large to represent')
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.setOperand(0, '1'))
    act(() => result.current.submit())
    expect(result.current.state).toMatchObject({ origin: 'client' })

    act(() => result.current.setOperand(1, '2'))
    act(() => result.current.submit())

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ origin: 'server', code: 'RESULT_OVERFLOW' }),
    )
  })

  it('reports an unreachable service without throwing', async () => {
    respondWithNetworkFailure()
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.setOperand(0, '1'))
    act(() => result.current.setOperand(1, '2'))
    act(() => result.current.submit())

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ origin: 'server', code: 'NETWORK_ERROR' }),
    )
  })

  // The race the request counter exists for: a slow answer arriving after the
  // user has moved on must not appear on screen.
  it('discards the answer to a superseded request', async () => {
    respondSlowly(111, 80)
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.setOperand(0, '1'))
    act(() => result.current.setOperand(1, '1'))
    act(() => result.current.submit())

    respondWith(222)
    act(() => result.current.setOperand(1, '2'))
    act(() => result.current.submit())

    await waitFor(() => expect(result.current.state.status).toBe('success'))
    expect(result.current.state).toMatchObject({ result: 222 })

    // Long enough for the first, slower answer to have arrived had it not been
    // discarded.
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(result.current.state).toMatchObject({ result: 222 })
  })

  // A result belonging to different inputs is worse than no result.
  it('drops a stale result as soon as an operand changes', async () => {
    respondWith(5)
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.setOperand(0, '2'))
    act(() => result.current.setOperand(1, '3'))
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.state.status).toBe('success'))

    act(() => result.current.setOperand(1, '4'))
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('clears operands, result and error', async () => {
    respondWith(5)
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.setOperand(0, '2'))
    act(() => result.current.setOperand(1, '3'))
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.state.status).toBe('success'))

    act(() => result.current.clear())

    expect(result.current.operands).toEqual(['', ''])
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('passes through loading on the way to a result', async () => {
    respondSlowly(7, 40)
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.setOperand(0, '3'))
    act(() => result.current.setOperand(1, '4'))
    act(() => result.current.submit())

    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('success'))
  })
})
