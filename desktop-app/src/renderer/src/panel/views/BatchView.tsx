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

  const handledItems = batch.items.filter((i) => i.status === 'succeeded')
  const decisionItems = batch.items.filter((i) => i.status === 'escalated')
  const failedItems = batch.items.filter(
    (i) => i.status === 'failed' || i.status === 'cancelled'
  )
  const handled = handledItems.length
  const noun = batch.inputKey === 'ticketId' ? 'ticket' : 'case'
  const headlineParts = [`Muse resolved ${handled} ${noun}${handled === 1 ? '' : 's'}.`]
  if (decisionItems.length > 0) {
    headlineParts.push(
      `${decisionItems.length} need${decisionItems.length === 1 ? 's' : ''} your judgment.`
    )
  }
  if (failedItems.length > 0) headlineParts.push(`${failedItems.length} didn't finish.`)
  if (decisionItems.length === 0 && failedItems.length === 0 && batch.status !== 'running') {
    headlineParts.push('Nothing needs your judgment.')
  }

  const renderItem = (item: (typeof batch.items)[number]): React.JSX.Element => (
    <li key={item.caseId} data-semid={`batch-item-${item.caseId}`} data-status={item.status}>
      <span className="batch-id">{item.caseId}</span>
      <span>
        <strong>{statusLabel(item)}</strong>
        {item.rule ? (
          <span className="muted"> — your rule “{item.rule}”</span>
        ) : item.reason || item.error ? (
          <span className="muted"> — {item.reason ?? friendlyError(item.error)}</span>
        ) : null}{' '}
        <button
          type="button"
          className="btn-link"
          data-semid={`batch-open-case-${item.caseId}`}
          onClick={() =>
            window.ghost.target.openCase(item.caseId).catch((err: unknown) => setError(friendlyError(err)))
          }
        >
          Open case
        </button>
      </span>
    </li>
  )

  return (
    <div>
      <section className="card" aria-label="Batch result">
        <h2 data-semid="batch-headline">
          {batch.status === 'running'
            ? `Working through ${batch.items.length} ${noun}s…`
            : headlineParts.join(' ')}
        </h2>
        <p className="muted" data-semid="batch-playbook">
          Playbook: {batch.skillName}
          {batch.skillVersion !== undefined ? ` · version ${batch.skillVersion}` : ''}
        </p>
        {decisionItems.length > 0 && (
          <>
            <h3>Needs your decision</h3>
            <ul className="batch-list" data-semid="batch-needs-decision">
              {decisionItems.map(renderItem)}
            </ul>
          </>
        )}
        {handledItems.length > 0 && (
          <>
            <h3>Completed</h3>
            <ul className="batch-list" data-semid="batch-items">
              {handledItems.map(renderItem)}
            </ul>
          </>
        )}
        {failedItems.length > 0 && (
          <>
            <h3>Didn't finish</h3>
            <ul className="batch-list" data-semid="batch-failed">
              {failedItems.map(renderItem)}
            </ul>
          </>
        )}
        {batch.status === 'running' && (
          <ul className="batch-list" data-semid="batch-items">
            {batch.items.filter((i) => i.status !== 'succeeded').map(renderItem)}
          </ul>
        )}
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
          ) : decisionItems.length > 0 ? (
            <>
              <Button
                variant="primary"
                data-semid="batch-review-first"
                onClick={() => {
                  const first = decisionItems[0]
                  if (first) window.ghost.target.openCase(first.caseId).catch(() => undefined)
                }}
              >
                Review {decisionItems[0]?.caseId}
              </Button>
              <Button data-semid="batch-done" onClick={() => onNav({ view: 'home' })}>
                Back to Today
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              data-semid="batch-done"
              onClick={() => onNav({ view: 'home' })}
            >
              Back to Today
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
