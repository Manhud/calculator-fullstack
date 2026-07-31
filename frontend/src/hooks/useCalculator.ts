import { useCallback, useEffect, useRef, useState } from 'react'
import { calculate } from '../api/client'
import type { ErrorCode, Operation } from '../api/types'
import { operationMeta } from '../domain/operations'
import { operandProblemMessage, parseOperand } from '../domain/validation'

/**
 * The request lifecycle.
 *
 * CLAUDE.md Section 5 originally listed a `validating` state. It was removed:
 * client validation is synchronous, so React never renders that state and no
 * test can observe it. What does need modelling is where a failure came from —
 * the server is authoritative, and proving that requires the state to remember
 * which side produced the error.
 */
export type CalculatorState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; operation: Operation; operands: number[]; result: number }
  | { status: 'error'; origin: 'client' | 'server'; code?: ErrorCode; message: string }

export interface Calculator {
  state: CalculatorState
  operation: Operation
  operands: string[]
  selectOperation: (operation: Operation) => void
  setOperand: (index: number, value: string) => void
  submit: () => void
  clear: () => void
}

const DEFAULT_OPERATION: Operation = 'add'

function blankOperands(operation: Operation): string[] {
  return Array.from({ length: operationMeta(operation).arity }, () => '')
}

export function useCalculator(): Calculator {
  const [operation, setOperation] = useState<Operation>(DEFAULT_OPERATION)
  const [operands, setOperands] = useState<string[]>(() => blankOperands(DEFAULT_OPERATION))
  const [state, setState] = useState<CalculatorState>({ status: 'idle' })

  // Identifies the request whose answer is still wanted. A slow response that
  // arrives after the user changed the input must be discarded, not rendered:
  // otherwise the screen shows an answer to a question no longer on it.
  const latestRequest = useRef(0)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => {
    // Abandon anything still in flight when the component goes away, so a
    // resolved promise cannot call setState on an unmounted component.
    return () => inFlight.current?.abort()
  }, [])

  const selectOperation = useCallback((next: Operation) => {
    setOperation((current) => {
      if (current === next) return current
      // Arity differs between operations, so the operand list is rebuilt rather
      // than truncated — switching to sqrt must not leave a stale second value
      // that reappears on switching back.
      setOperands(blankOperands(next))
      setState({ status: 'idle' })
      return next
    })
  }, [])

  const setOperand = useCallback((index: number, value: string) => {
    setOperands((current) => {
      if (current[index] === value) return current
      const next = [...current]
      next[index] = value
      return next
    })
    // Typing invalidates the answer on screen. Leaving it would let the user
    // read a result that belongs to different inputs.
    setState((current) => (current.status === 'idle' ? current : { status: 'idle' }))
  }, [])

  const clear = useCallback(() => {
    inFlight.current?.abort()
    latestRequest.current += 1
    setOperands(blankOperands(operation))
    setState({ status: 'idle' })
  }, [operation])

  const submit = useCallback(() => {
    const parsed = operands.map(parseOperand)
    const firstProblem = parsed.findIndex((operand) => !operand.ok)
    if (firstProblem !== -1) {
      const failed = parsed[firstProblem]
      if (!failed.ok) {
        const { operandLabels } = operationMeta(operation)
        setState({
          status: 'error',
          origin: 'client',
          message: `${operandLabels[firstProblem]}: ${operandProblemMessage(failed.problem)}`,
        })
      }
      return
    }

    const values = parsed.map((operand) => (operand.ok ? operand.value : 0))

    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    latestRequest.current += 1
    const requestId = latestRequest.current
    setState({ status: 'loading' })

    void calculate({ operation, operands: values }, controller.signal)
      .then((outcome) => {
        if (requestId !== latestRequest.current) return
        if (outcome.status === 'success') {
          setState({
            status: 'success',
            operation: outcome.operation,
            operands: outcome.operands,
            result: outcome.result,
          })
          return
        }
        // A server failure replaces whatever the client had concluded. The
        // server is authoritative; local validation is a convenience.
        setState({
          status: 'error',
          origin: 'server',
          code: outcome.code,
          message: outcome.message,
        })
      })
      .catch(() => {
        // Only an abort reaches here, and an abort means the answer was no
        // longer wanted. Anything else was turned into an outcome by the client.
      })
  }, [operands, operation])

  return { state, operation, operands, selectOperation, setOperand, submit, clear }
}
