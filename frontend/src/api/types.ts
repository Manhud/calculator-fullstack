/**
 * Mirrors the API contract in CLAUDE.md Section 3. Changing anything here
 * without changing the contract, or the reverse, is drift — the two are meant to
 * be read side by side.
 */

export const OPERATIONS = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'sqrt',
  'percentage',
] as const

export type Operation = (typeof OPERATIONS)[number]

/**
 * The ten codes the service can send. Kept exhaustive so a `switch` over it can
 * be checked for completeness at compile time: adding a code to the contract
 * without handling it becomes a type error rather than a message nobody sees.
 */
export type ServerErrorCode =
  | 'INVALID_JSON'
  | 'UNKNOWN_OPERATION'
  | 'INVALID_ARITY'
  | 'INVALID_OPERAND'
  | 'DIVISION_BY_ZERO'
  | 'NEGATIVE_SQRT'
  | 'RESULT_OVERFLOW'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL_ERROR'

/**
 * Failures that begin here and never travelled the network. A separate union so
 * they cannot be mistaken for something the contract defines.
 */
export type ClientErrorCode = 'NETWORK_ERROR' | 'MALFORMED_RESPONSE'

export type ErrorCode = ServerErrorCode | ClientErrorCode

export interface CalculationRequest {
  operation: Operation
  operands: number[]
}

export interface CalculationSuccess {
  operation: Operation
  operands: number[]
  result: number
}

export interface CalculationFailure {
  code: ErrorCode
  message: string
}

/**
 * A discriminated union, so a success and a failure cannot both be represented.
 * A `{ result, error }` shape would allow both at once and force every consumer
 * to write a defensive branch for a state the server can never send.
 */
export type CalculationOutcome =
  | ({ status: 'success' } & CalculationSuccess)
  | ({ status: 'failure' } & CalculationFailure)
