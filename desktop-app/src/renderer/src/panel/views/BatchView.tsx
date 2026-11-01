import { useEffect, useState } from 'react'
import type { BatchItem, BatchRecord } from '../../../../shared/schemas'
import { Button } from '../../components/Button'
import { choiceLabel } from '../../components/Decisions'
import { friendlyError } from '../../lib/errors'
import type { OnNav } from '../nav'

function statusLabel(item: BatchItem): string {
  switch (item.status) {
    case 'succeeded':
      return choiceLabel(item.choice ?? 'done')
    case 'escalated':
      return 'Needs you'
    case 'pending':
      return 'Waiting'
    case 'running':
      return 'Working…'
    case 'failed':
      return "Didn't finish"
    default:
      return item.status
  }
}

/** Live and finished view of a "Run on many" batch. */
export function BatchView({ onNav, batchId }: { onNav: OnNav; batchId: string }): React.JSX.Element {
  const [batch, setBatch] = useState<BatchRecord | null>(null)
  const [awayUrl, setAwayUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      window.ghost.batches
        .get(batchId)
        .then((next) => {
          if (!next) setError(`Batch ${batchId} was not found.`)
          else setBatch(next)
        })
        .catch((err: unknown) => setError(friendlyError(err)))
    }
    load()
    window.ghost.batches
      .awayUrl(batchId)
      .then(setAwayUrl)
      .catch(() => undefined)
    return window.ghost.library.onChanged(load)
  }, [batchId])

  if (error !== null) {
    return (
      <p className="alert-error" role="alert">
        {error}
      </p>
    )
  }
  if (!batch) return <p className="muted">Loading batch…</p>

  const handled = batch.items.filter((i) => i.status === 'succeeded').length
  const needsYou = batch.items.filter(
    (i) => i.status === 'escalated' || i.status === 'failed' || i.status === 'cancelled'
  ).length
  const noun = batch.inputKey === 'ticketId' ? 'ticket' : 'case'

  return (
    <div>
      <section className="card" aria-label="Batch result">
        <h2 data-semid="batch-headline">
          {batch.status === 'running'
            ? `Working through ${batch.items.length} ${noun}s…`
            : `Ghost resolved ${handled} ${noun}${handled === 1 ? '' : 's'}. ${needsYou === 0 ? 'Nothing needs you.' : `${needsYou} need${needsYou === 1 ? 's' : ''} you.`}`}
        </h2>
        <p className="muted">{batch.skillName}</p>
        <ul className="batch-list" data-semid="batch-items">
          {batch.items.map((item) => (
            <li key={item.caseId} data-semid={`batch-item-${item.caseId}`} data-status={item.status}>
              <span className="batch-id">{item.caseId}</span>
              <span>
                <strong>{statusLabel(item)}</strong>
                {item.rule ? (
                  <span className="muted"> — your rule “{item.rule}”</span>
                ) : item.reason || item.error ? (
                  <span className="muted"> — {item.reason ?? friendlyError(item.error)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {batch.status !== 'running' && (
          <p className={batch.notifiedAt ? 'muted' : 'alert-warn'} data-semid="batch-notify">
            {batch.notifiedAt
              ? 'Sent to your phone.'
              : (batch.notifyError ?? 'Sending to your phone…')}
          </p>
        )}
        {awayUrl && batch.status !== 'running' && (
          <p className="muted">
            Phone page:{' '}
            <span data-semid="batch-away-url" style={{ userSelect: 'all', wordBreak: 'break-all' }}>
              {awayUrl}
            </span>
          </p>
        )}
        <div className="field">
          {batch.status === 'running' ? (
            <Button
              data-semid="batch-cancel"
              onClick={() => {
                window.ghost.batches.cancel(batch.id).catch((err: unknown) => setError(friendlyError(err)))
              }}
            >
              Stop after this case
            </Button>
          ) : (
            <Button
              variant="primary"
              data-semid="batch-done"
              onClick={() => onNav({ view: 'library', libraryTab: 'runs' })}
            >
              See every run
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
