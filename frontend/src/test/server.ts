import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { CalculationRequest, ErrorCode, Operation } from '../api/types'

/**
 * The API is mocked at the network boundary with MSW rather than by replacing
 * the client module.
 *
 * Stubbing `calculate` would leave the one piece most likely to break — the
 * mapping from a response body to an outcome — untested, and would let a change
 * to the envelope pass every test. Here the client runs for real; only the wire
 * is fake.
 */
export const API = 'http://localhost:8080/api/v1/calculations'

/**
 * Every request the app has sent, in order.
 *
 * The keypad's central claim is that the browser computes nothing, so the tests
 * have to assert on what was *asked*, not only on what was shown. A local
 * shortcut would produce the right number on screen and no request here.
 */
export const requests: CalculationRequest[] = []

/** Mirrors the service so a chained calculation produces a sensible number. */
function compute(operation: Operation, operands: number[]): number {
  const [a, b] = operands
  switch (operation) {
    case 'add':
      return a + b
    case 'subtract':
      return a - b
    case 'multiply':
      return a * b
    case 'divide':
      return a / b
    case 'power':
      return a ** b
    case 'percentage':
      return (a * b) / 100
    case 'sqrt':
      return Math.sqrt(a)
  }
}

const arithmetic = http.post(API, async ({ request }) => {
  const body = (await request.json()) as CalculationRequest
  requests.push(body)
  return HttpResponse.json({
    operation: body.operation,
    operands: body.operands,
    result: compute(body.operation, body.operands),
  })
})

export const server = setupServer(arithmetic)

export function resetRequests() {
  requests.length = 0
}

export function respondWith(result: number) {
  server.use(
    http.post(API, async ({ request }) => {
      const body = (await request.json()) as CalculationRequest
      requests.push(body)
      return HttpResponse.json({ operation: body.operation, operands: body.operands, result })
    }),
  )
}

export function respondWithError(code: ErrorCode, message: string, status = 400) {
  server.use(
    http.post(API, async ({ request }) => {
      requests.push((await request.json()) as CalculationRequest)
      return HttpResponse.json({ error: { code, message } }, { status })
    }),
  )
}

export function respondWithNetworkFailure() {
  server.use(http.post(API, () => HttpResponse.error()))
}

/** A body the contract does not describe, to exercise the client's own guard. */
export function respondWithGarbage() {
  server.use(http.post(API, () => HttpResponse.json({ unexpected: true })))
}

/** Delays the answer so a race, or a loading state, can be observed. */
export function respondSlowly(result: number, delayMs: number) {
  server.use(
    http.post(API, async ({ request }) => {
      const body = (await request.json()) as CalculationRequest
      requests.push(body)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return HttpResponse.json({ operation: body.operation, operands: body.operands, result })
    }),
  )
}
