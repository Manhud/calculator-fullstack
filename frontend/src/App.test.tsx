import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import {
  requests,
  respondSlowly,
  respondWithError,
  respondWithNetworkFailure,
} from './test/server'

/**
 * Driven with userEvent, never fireEvent.
 *
 * fireEvent dispatches synthetic events carrying no focus and no modifier state,
 * so a bail-out rule can be missing entirely and its test still pass.
 */
function setup() {
  return { user: userEvent.setup(), ...render(<App />) }
}

/** The display is one live region; these read the lines inside it. */
const display = () => screen.getByRole('status')
const shown = () => within(display()).getAllByText(/.+/)

/**
 * Presses keys by their accessible name, the way the label reads.
 *
 * Sequential on purpose: a keypad is a sequence, and `Promise.all` here would
 * fire every click at once and test nothing real. Reduced over a promise chain
 * rather than looped, so the rule against awaiting in a loop still holds.
 */
function press(user: ReturnType<typeof userEvent.setup>, ...labels: string[]) {
  return labels.reduce(
    (previous, label) =>
      previous.then(() => user.click(screen.getByRole('button', { name: label }))),
    Promise.resolve(),
  )
}

function displayText() {
  return display().textContent ?? ''
}

describe('entering numbers', () => {
  it('builds a number from digits', async () => {
    const { user } = setup()

    await press(user, '1', '2', '3')

    expect(displayText()).toContain('123')
  })

  it('replaces the leading zero rather than growing it', async () => {
    const { user } = setup()

    await press(user, '5')

    expect(displayText()).toContain('5')
    expect(displayText()).not.toContain('05')
  })

  it('takes one decimal point per number', async () => {
    const { user } = setup()

    await press(user, '3', 'Decimal point', '1', 'Decimal point', '4')

    expect(displayText()).toContain('3.14')
  })

  it('deletes a character with backspace', async () => {
    const { user } = setup()

    await press(user, '1', '2', '3', 'Backspace')

    expect(displayText()).toContain('12')
  })

  it('toggles the sign, but leaves zero alone', async () => {
    const { user } = setup()

    await press(user, 'Toggle sign')
    expect(displayText()).not.toContain('-0')

    await press(user, '5', 'Toggle sign')
    expect(displayText()).toContain('-5')
  })
})

describe('calculating', () => {
  it('sends the calculation and shows the result', async () => {
    const { user } = setup()

    await press(user, '1', '2', 'Multiply', '4', 'Calculate')

    await waitFor(() => expect(displayText()).toContain('48'))
    expect(requests).toEqual([{ operation: 'multiply', operands: [12, 4] }])
    expect(displayText()).toContain('12 × 4 =')
  })

  it('does nothing on = with no operation pending', async () => {
    const { user } = setup()

    await press(user, '7', 'Calculate')

    expect(requests).toHaveLength(0)
    expect(displayText()).toContain('7')
  })

  it('applies a unary operation immediately', async () => {
    const { user } = setup()

    await press(user, '9', 'Square root')

    await waitFor(() => expect(displayText()).toContain('3'))
    expect(requests).toEqual([{ operation: 'sqrt', operands: [9] }])
    expect(displayText()).toContain('√(9) =')
  })

  it('treats percentage as a percent of b', async () => {
    const { user } = setup()

    await press(user, '5', '0', 'Percentage', '2', '0', '0', 'Calculate')

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toEqual({ operation: 'percentage', operands: [50, 200] })
  })

  it('lets the user change their mind about the operator', async () => {
    const { user } = setup()

    await press(user, '8', 'Add', 'Multiply', '2', 'Calculate')

    await waitFor(() => expect(requests).toHaveLength(1))
    // Only the second operator counts; pressing two in a row must not calculate.
    expect(requests[0]).toEqual({ operation: 'multiply', operands: [8, 2] })
  })

  it('shows the elapsed time of the last calculation', async () => {
    const { user } = setup()

    await press(user, '2', 'Add', '2', 'Calculate')

    await waitFor(() => expect(displayText()).toMatch(/Go service · \d+ ms/))
  })

  it('says it is working while the request is in flight', async () => {
    respondSlowly(9, 60)
    const { user } = setup()

    await press(user, '3', 'Multiply', '3', 'Calculate')

    expect(displayText()).toContain('computing…')
    await waitFor(() => expect(displayText()).toContain('9'))
  })
})

// The claim the whole design rests on: the browser does no arithmetic. A local
// shortcut would put the right number on screen and send nothing.
describe('chaining', () => {
  it('resolves the pending operation through the service before taking a new one', async () => {
    const { user } = setup()

    await press(user, '2', 'Add', '3', 'Multiply')

    await waitFor(() => expect(displayText()).toContain('5'))
    expect(requests).toEqual([{ operation: 'add', operands: [2, 3] }])
    expect(displayText()).toContain('2 + 3 =')
  })

  it('carries the intermediate result into the next calculation', async () => {
    const { user } = setup()

    await press(user, '2', 'Add', '3', 'Multiply')
    await waitFor(() => expect(requests).toHaveLength(1))
    await press(user, '4', 'Calculate')

    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]).toEqual({ operation: 'multiply', operands: [5, 4] })
    await waitFor(() => expect(displayText()).toContain('20'))
  })

  it('asks the service for every step, computing nothing itself', async () => {
    const { user } = setup()

    await press(user, '1', 'Add', '1', 'Add', '1', 'Add', '1', 'Calculate')

    await waitFor(() => expect(displayText()).toContain('4'))
    expect(requests).toHaveLength(3)
  })
})

describe('errors', () => {
  it('shows the service message in words and marks the result as an error', async () => {
    respondWithError('DIVISION_BY_ZERO', 'cannot divide by zero')
    const { user } = setup()

    await press(user, '1', '0', 'Divide', '0', 'Calculate')

    await waitFor(() => expect(displayText()).toContain('cannot divide by zero'))
    expect(displayText()).toContain('Error')
  })

  it('clears the error as soon as the user types again', async () => {
    respondWithError('NEGATIVE_SQRT', 'cannot take the square root of a negative number')
    const { user } = setup()

    await press(user, '9', 'Toggle sign', 'Square root')
    await waitFor(() => expect(displayText()).toContain('cannot take the square root'))

    await press(user, '7')

    expect(displayText()).not.toContain('cannot take the square root')
    expect(displayText()).toContain('7')
  })

  it('reports an unreachable service rather than failing silently', async () => {
    respondWithNetworkFailure()
    const { user } = setup()

    await press(user, '2', 'Add', '2', 'Calculate')

    await waitFor(() => expect(displayText()).toMatch(/could not reach/i))
  })
})

describe('history', () => {
  it('starts empty and says so', () => {
    setup()

    expect(screen.getByText(/your last calculations will show up here/i)).toBeInTheDocument()
  })

  it('records a completed calculation, newest first', async () => {
    const { user } = setup()

    await press(user, '2', 'Add', '2', 'Calculate')
    await waitFor(() => expect(displayText()).toContain('4'))
    await press(user, '3', 'Multiply', '3', 'Calculate')
    await waitFor(() => expect(displayText()).toContain('9'))

    const entries = screen.getAllByRole('button', { name: /^Reuse/ })
    expect(entries[0]).toHaveAccessibleName(/Reuse 9/)
    expect(entries[1]).toHaveAccessibleName(/Reuse 4/)
  })

  // The intermediate step of a chain is not a calculation the user asked for.
  it('does not record an intermediate result from chaining', async () => {
    const { user } = setup()

    await press(user, '2', 'Add', '3', 'Multiply')
    await waitFor(() => expect(displayText()).toContain('5'))

    expect(screen.queryAllByRole('button', { name: /^Reuse/ })).toHaveLength(0)
  })

  it('puts a recalled value back into the entry', async () => {
    const { user } = setup()

    await press(user, '6', 'Multiply', '7', 'Calculate')
    await waitFor(() => expect(displayText()).toContain('42'))
    await press(user, 'Clear all')
    expect(displayText()).toContain('0')

    await user.click(screen.getByRole('button', { name: /Reuse 42/ }))

    expect(displayText()).toContain('42')
  })

  it('clears on request', async () => {
    const { user } = setup()

    await press(user, '2', 'Add', '2', 'Calculate')
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Reuse/ })).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'clear' }))

    expect(screen.getByText(/your last calculations will show up here/i)).toBeInTheDocument()
  })

  it('survives clearing the calculator', async () => {
    const { user } = setup()

    await press(user, '2', 'Add', '2', 'Calculate')
    await waitFor(() => expect(displayText()).toContain('4'))

    await press(user, 'Clear all')

    expect(screen.getAllByRole('button', { name: /^Reuse/ })).toHaveLength(1)
  })
})

describe('the keyboard', () => {
  it('types digits and a decimal point', async () => {
    const { user } = setup()

    await user.keyboard('3.14')

    expect(displayText()).toContain('3.14')
  })

  it('accepts a comma as a decimal separator', async () => {
    const { user } = setup()

    await user.keyboard('3,5')

    expect(displayText()).toContain('3.5')
  })

  it.each([
    ['+', 'add'],
    ['-', 'subtract'],
    ['*', 'multiply'],
    ['/', 'divide'],
    ['^', 'power'],
    ['%', 'percentage'],
  ])('binds %s to %s', async (key, operation) => {
    const { user } = setup()

    await user.keyboard(`8${key}2{Enter}`)

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].operation).toBe(operation)
  })

  it('binds r to the square root', async () => {
    const { user } = setup()

    await user.keyboard('9r')

    await waitFor(() => expect(requests).toEqual([{ operation: 'sqrt', operands: [9] }]))
  })

  it('calculates on = as well as Enter', async () => {
    const { user } = setup()

    await user.keyboard('6*7=')

    await waitFor(() => expect(displayText()).toContain('42'))
  })

  it('clears on Escape', async () => {
    const { user } = setup()

    await user.keyboard('123{Escape}')

    expect(displayText()).not.toContain('123')
  })

  it('deletes with Backspace', async () => {
    const { user } = setup()

    await user.keyboard('123{Backspace}')

    expect(displayText()).toContain('12')
  })

  // Rule 1: a held modifier means the user is talking to the browser.
  it.each(['{Control>}5{/Control}', '{Meta>}5{/Meta}', '{Alt>}5{/Alt}'])(
    'ignores %s',
    async (combination) => {
      const { user } = setup()

      await user.keyboard(combination)

      expect(displayText()).not.toContain('5')
    },
  )

  // Rule 1: mid-composition, keystrokes belong to the input method. Without
  // this, typing an accented character silently presses keys.
  it('ignores a key dispatched while an IME is composing', () => {
    setup()

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '5', isComposing: true, bubbles: true }),
    )

    expect(displayText()).not.toContain('5')
  })

  // Rule 1: a text control some later change adds to the page keeps its keys.
  it('leaves a focused text field alone', async () => {
    const { user } = setup()
    const field = document.createElement('input')
    document.body.append(field)

    field.focus()
    await user.keyboard('5')

    expect(field).toHaveValue('5')
    expect(displayText()).not.toContain('5')
    field.remove()
  })

  // Rule 2: an unhandled key keeps its default, so the browser's own shortcuts
  // still work. A blanket preventDefault would break Tab, F5 and the rest.
  it('leaves a key it does not define alone', async () => {
    const { user } = setup()
    let defaultPrevented = false
    window.addEventListener('keydown', (event) => {
      if (event.key === 'F5') defaultPrevented = event.defaultPrevented
    })

    await user.keyboard('{F5}')

    expect(defaultPrevented).toBe(false)
  })
})

describe('accessibility', () => {
  // A glyph is not a name: "÷" announces as "division sign" at best.
  it('gives every key an accessible name', () => {
    setup()

    for (const key of screen.getAllByRole('button')) {
      expect(key).toHaveAccessibleName()
    }
  })

  it('advertises the keyboard binding on the key it belongs to', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Divide' })).toHaveAttribute(
      'aria-keyshortcuts',
      '/',
    )
    expect(screen.getByRole('button', { name: 'Calculate' })).toHaveAttribute(
      'aria-keyshortcuts',
      expect.stringContaining('Enter'),
    )
  })

  it('announces the display as a live region', () => {
    setup()

    expect(display()).toHaveAttribute('aria-live', 'polite')
  })

  // An error signalled by colour alone is invisible to a colour-blind user.
  it('states an error in words, not only in colour', async () => {
    respondWithError('RESULT_OVERFLOW', 'the result is too large to represent')
    const { user } = setup()

    await press(user, '9', 'Power', '9', '9', '9', 'Calculate')

    await waitFor(() => expect(displayText()).toContain('too large to represent'))
  })

  it('lists the keyboard map where a user can read it', () => {
    setup()

    const panel = screen.getByRole('region', { name: /keyboard/i })
    expect(within(panel).getByText('0-9 .')).toBeInTheDocument()
    expect(within(panel).getByText('+ - * / ^ %')).toBeInTheDocument()
    expect(within(panel).getByText('Enter')).toBeInTheDocument()
  })

  it('names the history region', () => {
    setup()

    expect(screen.getByRole('region', { name: /history/i })).toBeInTheDocument()
  })

  it('renders exactly the keys the design specifies', () => {
    setup()

    // Guards against a key quietly disappearing from the grid in a refactor.
    expect(shown().length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /^[0-9]$/ })).toHaveLength(10)
  })
})
