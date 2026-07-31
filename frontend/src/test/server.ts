import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { ErrorCode, Operation } from '../api/types'

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

/** Answers as the real service does: the arithmetic is irrelevant to these tests. */
export const server = setupServer(
  http.post(API, async ({ request }) => {
    const body = (await request.json()) as { operation: Operation; operands: number[] }
    return HttpResponse.json({
      operation: body.operation,
      operands: body.operands,
      result: 42,
    })
  }),
)

export function respondWith(result: number) {
  server.use(
    http.post(API, async ({ request }) => {
      const body = (await request.json()) as { operation: Operation; operands: number[] }
      return HttpResponse.json({ operation: body.operation, operands: body.operands, result })
    }),
  )
}

export function respondWithError(code: ErrorCode, message: string, status = 400) {
  server.use(
    http.post(API, () => HttpResponse.json({ error: { code, message } }, { status })),
  )
}

export function respondWithNetworkFailure() {
  server.use(http.post(API, () => HttpResponse.error()))
}

/** A body the contract does not describe, to exercise the client's own guard. */
export function respondWithGarbage() {
  server.use(http.post(API, () => HttpResponse.json({ unexpected: true })))
}

/** Delays the answer so a race can be constructed deterministically. */
export function respondSlowly(result: number, delayMs: number) {
  server.use(
    http.post(API, async ({ request }) => {
      const body = (await request.json()) as { operation: Operation; operands: number[] }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return HttpResponse.json({ operation: body.operation, operands: body.operands, result })
    }),
  )
}
