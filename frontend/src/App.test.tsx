import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { respondSlowly, respondWith, respondWithError } from './test/server'

/**
 * Driven with userEvent, never fireEvent.
 *
 * fireEvent dispatches synthetic events that carry no focus and no modifier
 * state, so a bail-out rule can be missing entirely and its test still pass.
 * userEvent types through the real focus path, which is the only way the
 * keyboard rules in Section 5 are actually exercised.
 */
function setup() {
  return { user: userEvent.setup(), ...render(<App />) }
}

const result = () => screen.getByRole('status')

describe('calculating', () => {
  it('sends the operands and shows the result', async () => {
    respondWith(2.5)
    const { user } = setup()

    await user.click(screen.getByRole('radio', { name: /divide/i }))
    await user.type(screen.getByLabelText('Divide'), '10')
    await user.type(screen.getByLabelText('By'), '4')
    await user.click(screen.getByRole('button', { name: /calculate/i }))

    await waitFor(() => expect(result()).toHaveTextContent('2.5'))
  })

  it('relabels the fields for the chosen operation', async () => {
    const { user } = setup()

    expect(screen.getByLabelText('First number')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /percentage/i }))

    expect(screen.getByLabelText('Percent')).toBeInTheDocument()
    expect(screen.getByLabelText('Of')).toBeInTheDocument()
  })

  it('shows one field for a unary operation', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('radio', { name: /square root/i }))

    expect(screen.getByLabelText('Value')).toBeInTheDocument()
    expect(screen.queryByLabelText('Second number')).not.toBeInTheDocument()
  })

  it('reports a server error as text, with its code', async () => {
    respondWithError('DIVISION_BY_ZERO', 'cannot divide by zero')
    const { user } = setup()

    await user.click(screen.getByRole('radio', { name: /divide/i }))
    await user.type(screen.getByLabelText('Divide'), '10')
    await user.type(screen.getByLabelText('By'), '0')
    await user.click(screen.getByRole('button', { name: /calculate/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('cannot divide by zero')
    expect(alert).toHaveTextContent('DIVISION_BY_ZERO')
  })

  it('refuses a blank field before sending anything', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText('First number'), '10')
    await user.click(screen.getByRole('button', { name: /calculate/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/second number/i)
  })

  it('announces that it is working', async () => {
    respondSlowly(9, 60)
    const { user } = setup()

    await user.type(screen.getByLabelText('First number'), '3')
    await user.type(screen.getByLabelText('Second number'), '6')
    await user.click(screen.getByRole('button', { name: /calculate/i }))

    expect(result()).toHaveTextContent(/calculating/i)
    await waitFor(() => expect(result()).toHaveTextContent('9'))
  })
})

describe('the keyboard', () => {
  // Rule 1: the hook must not synthesise digits. If it wrote them into state
  // itself this would still pass with one field and break with two.
  it('lets digits, a decimal point and a minus sign reach the focused field', async () => {
    const { user } = setup()

    const first = screen.getByLabelText('First number')
    await user.click(first)
    await user.keyboard('-12.5')

    expect(first).toHaveValue('-12.5')
    // The minus must not have selected an operation on its way through.
    expect(screen.getByRole('radio', { name: /add/i })).toBeChecked()
  })

  it.each([
    ['+', /add/i],
    ['s', /subtract/i],
    ['*', /multiply/i],
    ['/', /divide/i],
    ['^', /power/i],
    ['r', /square root/i],
    ['%', /percentage/i],
  ])('selects an operation with %s', async (key, name) => {
    const { user } = setup()

    await user.click(screen.getByRole('radio', { name: /multiply/i }))
    await user.keyboard(key)

    expect(screen.getByRole('radio', { name })).toBeChecked()
  })

  // The regression found by driving the real page: on load the event target is
  // <body>, and a containment check alone left every shortcut dead until the
  // user happened to focus a field.
  it('works with nothing focused, as on page load', async () => {
    const { user } = setup()

    expect(document.body).toHaveFocus()
    await user.keyboard('/')

    expect(screen.getByRole('radio', { name: /divide/i })).toBeChecked()
  })

  it('submits on Enter', async () => {
    respondWith(15)
    const { user } = setup()

    await user.type(screen.getByLabelText('First number'), '10')
    await user.type(screen.getByLabelText('Second number'), '5')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(result()).toHaveTextContent('15'))
  })

  it('clears on Escape', async () => {
    respondWith(15)
    const { user } = setup()

    await user.type(screen.getByLabelText('First number'), '10')
    await user.type(screen.getByLabelText('Second number'), '5')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(result()).toHaveTextContent('15'))

    await user.keyboard('{Escape}')

    expect(screen.getByLabelText('First number')).toHaveValue('')
    expect(result()).not.toHaveTextContent('15')
  })

  // Rule 4: Backspace belongs to the field. Intercepting it would make the
  // calculator impossible to correct a typo in.
  it('never intercepts Backspace', async () => {
    const { user } = setup()

    const first = screen.getByLabelText('First number')
    await user.click(first)
    await user.keyboard('123{Backspace}')

    expect(first).toHaveValue('12')
  })

  // Rule 2: a held modifier means the user is talking to the browser.
  it.each(['{Control>}/{/Control}', '{Meta>}/{/Meta}', '{Alt>}/{/Alt}'])(
    'ignores %s',
    async (combination) => {
      const { user } = setup()

      await user.keyboard(combination)

      expect(screen.getByRole('radio', { name: /add/i })).toBeChecked()
    },
  )

  // Rule 2: a text control outside the calculator keeps its own keys.
  it('leaves a field outside the calculator alone', async () => {
    const { user } = setup()
    const outside = document.createElement('input')
    document.body.append(outside)

    outside.focus()
    await user.keyboard('/')

    expect(outside).toHaveValue('/')
    expect(screen.getByRole('radio', { name: /add/i })).toBeChecked()
    outside.remove()
  })

  // Rule 2: mid-composition, keystrokes belong to the input method. Without
  // this, typing an accented character silently triggers shortcuts.
  it('ignores a key dispatched while an IME is composing', async () => {
    setup()
    const field = screen.getByLabelText('First number')
    field.focus()

    // userEvent has no composition API, so the event is dispatched directly.
    // It is the only assertion in this file that does, and it says why.
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: '/', isComposing: true, bubbles: true }),
    )

    expect(screen.getByRole('radio', { name: /add/i })).toBeChecked()
  })

  // The other regression from the browser: disabling the focused control during
  // a request hands focus back to <body>, losing the user's place after every
  // calculation and — with the bug above — the keyboard along with it.
  it('keeps focus in the field across a calculation', async () => {
    respondWith(15)
    const { user } = setup()

    await user.type(screen.getByLabelText('First number'), '10')
    const second = screen.getByLabelText('Second number')
    await user.type(second, '5')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(result()).toHaveTextContent('15'))
    expect(second).toHaveFocus()
  })
})

describe('accessibility', () => {
  it.each(['add', 'divide', 'percentage', 'square root'])(
    'labels every operand field for %s',
    async (operation) => {
      const { user } = setup()

      await user.click(screen.getByRole('radio', { name: new RegExp(operation, 'i') }))

      for (const field of screen.getAllByRole('textbox')) {
        expect(field).toHaveAccessibleName()
      }
    },
  )

  it('gives every operation control an accessible name and its shortcut', () => {
    setup()

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAccessibleName()
      expect(radio).toHaveAttribute('aria-keyshortcuts')
    }
  })

  // An error must interrupt; a result must not steal focus from the field.
  it('uses alert for errors and status for results', async () => {
    respondWithError('NEGATIVE_SQRT', 'cannot take the square root of a negative number')
    const { user } = setup()

    expect(screen.getByRole('status')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /square root/i }))
    await user.type(screen.getByLabelText('Value'), '-1')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  // An error signalled by colour alone is invisible to a colour-blind user.
  it('states the error in words, not only in colour', async () => {
    respondWithError('RESULT_OVERFLOW', 'the result is too large to represent')
    const { user } = setup()

    await user.type(screen.getByLabelText('First number'), '10')
    await user.type(screen.getByLabelText('Second number'), '400')
    await user.keyboard('{Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('too large')
  })

  // A shortcut nobody can find is not a feature.
  it('lists every shortcut where a user can read it', async () => {
    const { user } = setup()

    const summary = screen.getByText(/keyboard shortcuts/i)
    await user.click(summary)

    // Scoped through the DOM rather than by role: <details> has no role in this
    // ARIA mapping, and an unscoped search would match the picker, whose symbols
    // include '+' and '%' too. Adding ARIA purely to make a query work would be
    // shaping the markup around the test.
    const legend = summary.parentElement
    if (!legend) throw new Error('the shortcut summary has no container')
    for (const key of ['+', 's', '*', '/', '^', 'r', '%', 'Enter', 'Esc']) {
      expect(within(legend).getByText(key)).toBeInTheDocument()
    }
  })
})
