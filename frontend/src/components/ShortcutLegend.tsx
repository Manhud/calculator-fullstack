import { OPERATION_LIST } from '../domain/operations'

/**
 * A shortcut nobody can discover is not a feature. The legend is rendered from
 * the same metadata the keyboard hook reads, so a key shown here cannot drift
 * from the key that works.
 */
export function ShortcutLegend() {
  return (
    <details className="rounded-lg border border-edge bg-panel-raised px-3.5 py-2.5">
      <summary className="cursor-pointer text-xs font-medium text-ink-dim">
        Keyboard shortcuts
      </summary>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {OPERATION_LIST.map((operation) => (
          <Row key={operation.id} keys={operation.shortcut} description={operation.label} />
        ))}
        <Row keys="Enter" description="Calculate" />
        <Row keys="Esc" description="Clear" />
      </dl>
    </details>
  )
}

function Row({ keys, description }: { keys: string; description: string }) {
  return (
    <>
      <dt>
        <kbd className="rounded border border-edge bg-panel px-1.5 py-0.5 font-mono text-ink">
          {keys}
        </kbd>
      </dt>
      <dd className="self-center text-ink-dim">{description}</dd>
    </>
  )
}
