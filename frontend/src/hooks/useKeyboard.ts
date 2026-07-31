import { useEffect } from 'react'
import { keyForBinding } from '../domain/keys'
import type { KeyAction } from '../domain/keys'

/**
 * Binds the keyboard to the keypad.
 *
 * A keypad has no text input, so this hook owns the keyboard outright — which
 * inverts the rules the form UI needed. There, typing had to win and `Backspace`
 * was never to be touched, because a field owned them; here nothing else does.
 *
 * The bindings live on the key definitions themselves, so a key shown on screen
 * and the key that works cannot drift apart.
 *
 * What survives from the earlier version is the bailing out, and it matters more
 * now than it did: this listener sees every keystroke on the page.
 *
 *  1. A held modifier means the user is talking to the browser or the operating
 *     system — Cmd-R is a reload, not a square root.
 *  2. Mid-composition, keystrokes belong to the input method. Without this,
 *     typing an accented character silently triggers keys.
 *  3. A text control that some later change adds to the page keeps its own keys.
 *  4. `preventDefault` fires only on a key that was handled. `/` opens quick-find
 *     in some browsers and `Backspace` can navigate back, so both are claimed
 *     deliberately — but an unhandled key keeps its default.
 */
export function useKeyboard(press: (action: KeyAction) => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.isComposing) return

      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
      ) {
        return
      }

      const key = keyForBinding(event.key)
      if (!key) return

      event.preventDefault()
      press(key.action)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [press])
}
