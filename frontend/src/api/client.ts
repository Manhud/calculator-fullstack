import { OPERATIONS } from './types'
import type {
  CalculationOutcome,
  CalculationRequest,
  ErrorCode,
  Operation,
  ServerErrorCode,
} from './types'

/**
 * The only module that calls fetch. Components receive outcomes; they never
 * learn that HTTP exists, which is what keeps them testable without a network.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

const SERVER_ERROR_CODES: ReadonlySet<string> = new Set<ServerErrorCode>([
  'INVALID_JSON',
  'UNKNOWN_OPERATION',
  'INVALID_ARITY',
  'INVALID_OPERAND',
  'DIVISION_BY_ZERO',
  'NEGATIVE_SQRT',
  'RESULT_OVERFLOW',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'INTERNAL_ERROR',
])

/**
 * A response body is untyped until proven otherwise. Casting it to the expected
 * shape would let a contract change reach the UI as `undefined` rendered on
 * screen instead of as an error the user can read.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const OPERATION_NAMES: ReadonlySet<string> = new Set<string>(OPERATIONS)

function parseSuccess(body: unknown): CalculationOutcome | null {
  if (!isRecord(body)) return null
  const { operation, operands, result } = body
  if (typeof operation !== 'string' || !OPERATION_NAMES.has(operation)) return null
  if (!Array.isArray(operands) || !operands.every((n) => typeof n === 'number')) return null
  if (typeof result !== 'number') return null
  return { status: 'success', operation: operation as Operation, operands, result }
}

function parseFailure(body: unknown): CalculationOutcome | null {
  if (!isRecord(body) || !isRecord(body.error)) return null
  const { code, message } = body.error
  if (typeof code !== 'string' || typeof message !== 'string') return null
  // An unrecognised code is treated as malformed rather than passed through:
  // the UI switches exhaustively over the contract, and a stray string would
  // fall through every branch.
  if (!SERVER_ERROR_CODES.has(code)) return null
  return { status: 'failure', code: code as ErrorCode, message }
}

function malformed(): CalculationOutcome {
  return {
    status: 'failure',
    code: 'MALFORMED_RESPONSE',
    message: 'The server sent a response this app does not understand.',
  }
}

/**
 * Sends a calculation and always resolves — never rejects. A thrown error would
 * make every caller wrap this in try/catch and invent its own failure shape;
 * returning the failure keeps one path through the state machine.
 *
 * `signal` lets the caller abort a request whose answer is no longer wanted.
 */
export async function calculate(
  request: CalculationRequest,
  signal?: AbortSignal,
): Promise<CalculationOutcome> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/v1/calculations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (error) {
    // An aborted request is not a failure to report; the caller discarded it.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return {
      status: 'failure',
      code: 'NETWORK_ERROR',
      message: 'Could not reach the calculator service. Check that it is running.',
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return malformed()
  }

  // Branch on the body rather than on response.ok: every error the service
  // produces carries the same envelope, including 404, 405 and 500.
  return (response.ok ? parseSuccess(body) : parseFailure(body)) ?? malformed()
}
