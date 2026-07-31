import { useCallback, useEffect, useRef, useState } from 'react'
import { calculate } from '../api/client'
import type { Operation } from '../api/types'
import {
  INITIAL_ENTRY,
  appendDecimalPoint,
  appendDigit,
  deleteLastCharacter,
  formatValue,
  parseEntry,
  toggleSign,
} from '../domain/entry'
import { OPERATOR_GLYPH } from '../domain/keys'
import type { KeyAction } from '../domain/keys'

/** A binary operation waiting for its right-hand side. */
type BinaryOperation = Exclude<Operation, 'sqrt'>

export interface HistoryEntry {
  /** Monotonic, because the same calculation can legitimately appear twice and
   *  React needs to tell those two rows apart. */
  id: number
  expression: string
  value: string
}

export interface CalculatorState {
  /** The number being typed, or the last result. Textual: "3." is a real state. */
  entry: string
  /** The line above the result: "12 ×", "12 × 4 =", "√(9) =". */
  expression: string
  /** The next digit replaces the entry instead of appending to it. */
  fresh: boolean
  /** True while a request is in flight. */
  busy: boolean
  /** The message from the service, or from the client when it could not reach it. */
  error: string
  /** Round-trip time of the last successful calculation, for the status line. */
  latencyMs: number | null
  /** Newest first, capped. In memory only — a reload starts empty. */
  history: readonly HistoryEntry[]
}

const HISTORY_LIMIT = 8

const INITIAL_STATE: CalculatorState = {
  entry: INITIAL_ENTRY,
  expression: '',
  fresh: true,
  busy: false,
  error: '',
  latencyMs: null,
  history: [],
}

export interface Calculator {
  state: CalculatorState
  press: (action: KeyAction) => void
  recall: (entry: HistoryEntry) => void
  clearHistory: () => void
}

/**
 * The keypad's state machine.
 *
 * Every arithmetic result comes from the Go service, including the intermediate
 * one that chaining produces: pressing `×` after `2 + 3` sends `2 + 3` and waits.
 * Computing it here would be faster, would make the service decorative, and would
 * hide an outage behind answers the browser invented.
 *
 * State is mirrored into a ref and read from there. Deciding what a key does
 * means reading the current state *and* possibly firing a request, and a request
 * cannot live inside a `setState` updater: React invokes updaters twice under
 * StrictMode, which would send every calculation twice.
 */
export function useCalculator(): Calculator {
  const [state, setState] = useState<CalculatorState>(INITIAL_STATE)
  const stateRef = useRef<CalculatorState>(INITIAL_STATE)

  const update = useCallback((change: (current: CalculatorState) => CalculatorState) => {
    stateRef.current = change(stateRef.current)
    setState(stateRef.current)
  }, [])

  // Bookkeeping the display never shows directly.
  const accumulator = useRef<number | null>(null)
  const pending = useRef<BinaryOperation | null>(null)

  // Identifies the request whose answer is still wanted, so a slow reply cannot
  // land on a keypad the user has since moved on from.
  const latestRequest = useRef(0)
  const inFlight = useRef<AbortController | null>(null)
  const nextHistoryId = useRef(0)

  useEffect(() => () => inFlight.current?.abort(), [])

  const reset = useCallback(() => {
    inFlight.current?.abort()
    latestRequest.current += 1
    accumulator.current = null
    pending.current = null
    update((current) => ({ ...INITIAL_STATE, history: current.history }))
  }, [update])

  /**
   * Sends one calculation and folds the answer back in.
   *
   * `keepPending` says what the answer is for: chaining keeps it as the
   * accumulator for the operator just pressed, `=` turns it into the entry and
   * records it in the history.
   */
  const send = useCallback(
    (operation: Operation, operands: number[], expression: string, keepPending: boolean) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller

      latestRequest.current += 1
      const requestId = latestRequest.current
      const startedAt = performance.now()

      update((current) => ({ ...current, busy: true, error: '', expression }))

      void calculate({ operation, operands }, controller.signal)
        .then((outcome) => {
          if (requestId !== latestRequest.current) return
          const elapsed = Math.round(performance.now() - startedAt)

          if (outcome.status === 'failure') {
            accumulator.current = null
            pending.current = null
            update((current) => ({
              ...current,
              busy: false,
              error: outcome.message,
              fresh: true,
              latencyMs: null,
            }))
            return
          }

          const value = formatValue(outcome.result)
          if (keepPending) {
            accumulator.current = outcome.result
          } else {
            accumulator.current = null
            pending.current = null
          }

          update((current) => ({
            ...current,
            entry: value,
            busy: false,
            error: '',
            fresh: true,
            latencyMs: elapsed,
            history: keepPending
              ? current.history
              : [{ id: nextHistoryId.current++, expression, value }, ...current.history].slice(
                  0,
                  HISTORY_LIMIT,
                ),
          }))
        })
        .catch(() => {
          // Only an abort reaches here; the client turns everything else into an
          // outcome. An abort means the answer was no longer wanted.
        })
    },
    [update],
  )

  const press = useCallback(
    (action: KeyAction) => {
      const current = stateRef.current

      switch (action.kind) {
        case 'digit':
          update((s) => ({
            ...s,
            entry: appendDigit(s.entry, action.digit, s.fresh),
            fresh: false,
            error: '',
          }))
          return

        case 'decimal':
          update((s) => ({
            ...s,
            entry: appendDecimalPoint(s.entry, s.fresh),
            fresh: false,
            error: '',
          }))
          return

        case 'backspace':
          update((s) => ({
            ...s,
            entry: deleteLastCharacter(s.entry, s.fresh),
            fresh: false,
            error: '',
          }))
          return

        case 'toggleSign':
          update((s) => ({ ...s, entry: toggleSign(s.entry), error: '' }))
          return

        case 'clear':
          reset()
          return

        case 'unary': {
          const value = parseEntry(current.entry)
          if (value === null) return
          send('sqrt', [value], `√(${current.entry}) =`, false)
          return
        }

        case 'binary': {
          const value = parseEntry(current.entry)
          if (value === null) return
          const glyph = OPERATOR_GLYPH[action.operation] ?? '?'

          // Nothing pending, or the operator pressed straight after another one:
          // record the left-hand side and wait. `fresh` is what distinguishes
          // "2 + ×" — changing one's mind — from "2 + 3 ×", which must resolve.
          if (accumulator.current === null || pending.current === null || current.fresh) {
            accumulator.current = value
            pending.current = action.operation
            update((s) => ({ ...s, expression: `${formatValue(value)} ${glyph}`, fresh: true, error: '' }))
            return
          }

          // Chaining: resolve what is pending before taking the new operator.
          const previousGlyph = OPERATOR_GLYPH[pending.current] ?? '?'
          const expression = `${formatValue(accumulator.current)} ${previousGlyph} ${current.entry} =`
          const operands = [accumulator.current, value]
          const resolved = pending.current
          pending.current = action.operation
          send(resolved, operands, expression, true)
          return
        }

        case 'equals': {
          const value = parseEntry(current.entry)
          if (value === null) return
          // `=` with nothing pending does nothing, as on a real keypad.
          if (accumulator.current === null || pending.current === null) return

          const glyph = OPERATOR_GLYPH[pending.current] ?? '?'
          const expression = `${formatValue(accumulator.current)} ${glyph} ${current.entry} =`
          send(pending.current, [accumulator.current, value], expression, false)
          return
        }
      }
    },
    [reset, send, update],
  )

  const recall = useCallback(
    (historyEntry: HistoryEntry) => {
      update((s) => ({ ...s, entry: historyEntry.value, fresh: true, error: '' }))
    },
    [update],
  )

  const clearHistory = useCallback(() => {
    update((s) => ({ ...s, history: [] }))
  }, [update])

  return { state, press, recall, clearHistory }
}
