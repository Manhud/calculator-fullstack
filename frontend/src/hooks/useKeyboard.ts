import { useEffect } from 'react'
import type { Operation } from '../api/types'
import { operationForShortcut } from '../domain/operations'

interface KeyboardActions {
  selectOperation: (operation: Operation) => void
  submit: () => void
  clear: () => void
}

/**
 * The key map from CLAUDE.md Section 5, and nothing beyond it.
 *
 * The rules that keep this from being a liability, in priority order:
 *
 *  1. Typing always wins. Digits, `.` and `-` are never synthesised here — they
 *     reach the focused field on their own. A hook that wrote them into state
 *     would break the moment there is more than one field.
 *  2. Bail out when a modifier is held, when the event target is outside the
 *     calculator, or when an IME is composing. Without the composition check,
 *     typing an accented character silently triggers shortcuts.
 *  3. preventDefault only on keys actually handled — a blanket call eats the
 *     browser's own shortcuts.
 *  4. Backspace is never intercepted.
 *  5. Everything here is also reachable by mouse and by Tab then Enter. The
 *     keyboard is an accelerator, never the only path.
 */
export function useKeyboard({ selectOperation, submit, clear }: KeyboardActions): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Rule 2: a held modifier means the user is talking to the browser or the
      // operating system, not to this app.
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // Rule 2: mid-composition, keystrokes belong to the input method.
      if (event.isComposing) return

      // Rule 2: ignore anything typed into a control that is not ours — a
      // future search box should not lose its slashes to the divide shortcut.
      //
      // The test is for a *foreign text control*, not merely for a target
      // outside the calculator. Driving the real page showed why: on load, and
      // after any click on the background, the event target is <body>, which is
      // outside the calculator by any reading — so a check on containment alone
      // left every shortcut dead until the user happened to focus a field.
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]') &&
        target.closest('[data-calculator]') === null
      ) {
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        submit()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        clear()
        return
      }

      // Rule 1 and rule 4: digits, '.', '-' and Backspace are deliberately
      // absent. They belong to the focused field and are left untouched.
      const operation = operationForShortcut(event.key)
      if (operation) {
        event.preventDefault()
        selectOperation(operation.id)
      }
      // Rule 3: anything unhandled falls through with its default intact.
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectOperation, submit, clear])
}
