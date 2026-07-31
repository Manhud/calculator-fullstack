import { ErrorBanner } from './components/ErrorBanner'
import { OperandFields } from './components/OperandFields'
import { OperationPicker } from './components/OperationPicker'
import { ResultDisplay } from './components/ResultDisplay'
import { ShortcutLegend } from './components/ShortcutLegend'
import { operationMeta } from './domain/operations'
import { useCalculator } from './hooks/useCalculator'
import { useKeyboard } from './hooks/useKeyboard'

export default function App() {
  const { state, operation, operands, selectOperation, setOperand, submit, clear } =
    useCalculator()

  useKeyboard({ selectOperation, submit, clear })

  const meta = operationMeta(operation)
  const busy = state.status === 'loading'

  return (
    // data-calculator marks the region the keyboard hook answers for. Anything
    // outside it keeps its own keys.
    <main
      data-calculator
      className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-8 sm:py-12"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Calculator</h1>
        <p className="text-sm text-ink-dim">
          Every result is computed by the Go service, not in the browser.
        </p>
      </header>

      <ResultDisplay state={state} />

      {/*
        Nothing is disabled while a request is in flight, and that is deliberate.
        Disabling the control the user is focused on hands focus back to <body>,
        which loses their place after every calculation and — before the keyboard
        hook was corrected — killed the shortcuts along with it. The hook already
        makes a second submit safe: it aborts the first and ignores its answer.
        aria-busy reports the state without taking anything away.
      */}
      <form
        className="flex flex-col gap-4"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <OperationPicker selected={operation} onSelect={selectOperation} />

        <OperandFields operation={meta} values={operands} onChange={setOperand} />

        <ErrorBanner state={state} />

        <div className="flex gap-2">
          {/* Both actions are reachable by mouse and by Tab, so the shortcuts
              stay accelerators rather than the only way in. */}
          <button
            type="submit"
            aria-keyshortcuts="Enter"
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink"
          >
            {busy ? 'Calculating…' : 'Calculate'}
          </button>
          <button
            type="button"
            onClick={clear}
            aria-keyshortcuts="Escape"
            className="rounded-lg border border-edge px-4 py-2.5 text-sm font-medium text-ink-dim"
          >
            Clear
          </button>
        </div>
      </form>

      <ShortcutLegend />
    </main>
  )
}
