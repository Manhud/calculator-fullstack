import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

beforeAll(() => {
  // A request no handler matches is an error rather than a silent pass-through,
  // so a test that reaches an unexpected endpoint fails instead of hanging.
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
