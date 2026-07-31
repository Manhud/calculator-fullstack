import { Display } from './components/Display'
import { HistoryPanel } from './components/HistoryPanel'
import { KeyboardPanel } from './components/KeyboardPanel'
import { Keypad } from './components/Keypad'
import { useCalculator } from './hooks/useCalculator'
import { useKeyboard } from './hooks/useKeyboard'

export default function App() {
  const { state, press, recall, clearHistory } = useCalculator()

  useKeyboard(press)

  return (
    <div className="flex flex-col items-center gap-7 px-5 pt-10 pb-15">
      <header className="flex w-full max-w-[760px] flex-col gap-1">
        <h1 className="text-[22px] font-semibold text-ink">Calculator</h1>
        <p className="text-sm text-ink-subtle">
          Type an expression the way you would on a real calculator — every result is computed by
          the Go service.
        </p>
      </header>

      <main className="flex w-full max-w-[760px] flex-wrap items-start gap-5">
        <div className="flex min-w-[300px] flex-[1_1_340px] flex-col gap-4 rounded-[20px] border border-card-edge bg-card p-[18px] shadow-[0_24px_60px_-30px_#000]">
          <Display state={state} />
          <Keypad onPress={press} />
        </div>

        {/* On a narrow viewport the wrap drops this column below the keypad. */}
        <div className="flex min-w-[240px] flex-[1_1_240px] flex-col gap-3">
          <HistoryPanel history={state.history} onRecall={recall} onClear={clearHistory} />
          <KeyboardPanel />
        </div>
      </main>
    </div>
  )
}
