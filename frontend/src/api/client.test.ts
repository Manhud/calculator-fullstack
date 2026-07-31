import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { calculate } from './client'
import {
  API,
  respondWith,
  respondWithError,
  respondWithGarbage,
  respondWithNetworkFailure,
  server,
} from '../test/server'

describe('calculate', () => {
  it('returns a success outcome for a well-formed response', async () => {
    respondWith(2.5)

    const outcome = await calculate({ operation: 'divide', operands: [10, 4] })

    expect(outcome).toEqual({
      status: 'success',
      operation: 'divide',
      operands: [10, 4],
      result: 2.5,
    })
  })

  it('turns an error envelope into a failure outcome carrying the code', async () => {
    respondWithError('DIVISION_BY_ZERO', 'cannot divide by zero')

    const outcome = await calculate({ operation: 'divide', operands: [10, 0] })

    expect(outcome).toEqual({
      status: 'failure',
      code: 'DIVISION_BY_ZERO',
      message: 'cannot divide by zero',
    })
  })

  // 404, 405 and 500 use the same envelope, so the client must not branch on
  // response.ok alone and lose the code.
  it.each([
    ['NOT_FOUND', 404],
    ['METHOD_NOT_ALLOWED', 405],
    ['INTERNAL_ERROR', 500],
  ] as const)('reads the code from a %s response', async (code, status) => {
    respondWithError(code, 'something went wrong', status)

    const outcome = await calculate({ operation: 'add', operands: [1, 2] })

    expect(outcome).toMatchObject({ status: 'failure', code })
  })

  it('reports a network failure as its own code rather than throwing', async () => {
    respondWithNetworkFailure()

    const outcome = await calculate({ operation: 'add', operands: [1, 2] })

    expect(outcome).toMatchObject({ status: 'failure', code: 'NETWORK_ERROR' })
  })

  // The point of validating instead of casting: a body that does not match the
  // contract must surface as an error, not as `undefined` rendered on screen.
  it('rejects a success body missing the result field', async () => {
    respondWithGarbage()

    const outcome = await calculate({ operation: 'add', operands: [1, 2] })

    expect(outcome).toMatchObject({ status: 'failure', code: 'MALFORMED_RESPONSE' })
  })

  it('rejects a success body whose result is not a number', async () => {
    server.use(
      http.post(API, () =>
        HttpResponse.json({ operation: 'add', operands: [1, 2], result: 'three' }),
      ),
    )

    const outcome = await calculate({ operation: 'add', operands: [1, 2] })

    expect(outcome).toMatchObject({ status: 'failure', code: 'MALFORMED_RESPONSE' })
  })

  it('rejects a body that is not JSON at all', async () => {
    server.use(http.post(API, () => new HttpResponse('<html>gateway error</html>', { status: 502 })))

    const outcome = await calculate({ operation: 'add', operands: [1, 2] })

    expect(outcome).toMatchObject({ status: 'failure', code: 'MALFORMED_RESPONSE' })
  })

  // An unrecognised code would fall through every branch of an exhaustive
  // switch in the UI, so it is refused here rather than passed along.
  it('refuses an error code outside the contract', async () => {
    server.use(
      http.post(API, () =>
        HttpResponse.json({ error: { code: 'TEAPOT', message: 'nope' } }, { status: 400 }),
      ),
    )

    const outcome = await calculate({ operation: 'add', operands: [1, 2] })

    expect(outcome).toMatchObject({ status: 'failure', code: 'MALFORMED_RESPONSE' })
  })

  it('sends the operation and operands as the contract specifies', async () => {
    let received: unknown
    server.use(
      http.post(API, async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ operation: 'power', operands: [2, 10], result: 1024 })
      }),
    )

    await calculate({ operation: 'power', operands: [2, 10] })

    expect(received).toEqual({ operation: 'power', operands: [2, 10] })
  })

  // An abort is the caller discarding the answer, not a failure to report.
  it('propagates an abort instead of turning it into an outcome', async () => {
    const controller = new AbortController()
    const pending = calculate({ operation: 'add', operands: [1, 2] }, controller.signal)
    controller.abort()

    await expect(pending).rejects.toThrow(/abort/i)
  })
})
