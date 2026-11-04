import { useEffect, useState } from 'react'
import type { Opportunity } from '../../../../shared/schemas'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'
import type { OnNav } from '../nav'
import { outcomeTitle } from '../NowFeed'

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * One work item, end to end: the same title, cases, and rule from Today
 * through approval. Opening this view runs nothing; only Approve does.
 */
export function WorkItemView({
  onNav,
  opportunityId
}: {
  onNav: OnNav
  opportunityId: string
}): React.JSX.Element {
  const [item, setItem] = useState<Opportunity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.ghost.activity
      .getFeed()
      .then((feed) => {
        const found = [...feed.needsYou, ...feed.ready].find((o) => o.id === opportunityId) ?? null
        setItem(found)
        if (!found) setError('This item is no longer waiting — it may already be handled.')
      })
      .catch((err: unknown) => setError(friendlyError(err)))
  }, [opportunityId])

  const approve = (): void => {
    if (!item?.skillId) return
    setBusy(true)
    window.ghost.batches
      .start({ skillId: item.skillId, inputKey: 'ticketId', caseIds: item.caseIds, sharedInputs: {} })
      .then((batch) => {
        void window.ghost.activity.act(item.id).catch(() => undefined)
        onNav({ view: 'batch', batchId: batch.id })
      })
      .catch((err: unknown) => setError(friendlyError(err)))
      .finally(() => setBusy(false))
  }

  const openCase = (caseId?: string): void => {
    if (!item) return
    // Opens the request in Saltbreak and keeps its context here. No
    // automation starts from this action.
    const target = caseId ?? item.caseIds[0]
    if (target) {
      window.ghost.target.openCase(target).catch((err: unknown) => setError(friendlyError(err)))
    }
  }

  if (error !== null && item === null) {
    return (
      <p className="alert-warn" role="status" data-semid="work-item-gone">
        {error}
      </p>
    )
  }
  if (item === null) return <p className="muted">Loading…</p>

  const action = item.actionLabel ?? 'Handle'
  const verb = `${action.toLowerCase()}${action === 'Handle' ? '' : 's'}`
  return (
    <div data-semid={`work-item-${item.id}`}>
      <h2>{outcomeTitle(item)}</h2>
      <p className="muted">Because… {item.because}</p>
      {item.ruleText ? (
        <p>
          <span className="rule-chip" data-semid="work-item-rule">
            Your rule: {item.ruleText}
          </span>
        </p>
      ) : item.skillName ? (
        <p className="muted" data-semid="work-item-rule">
          Playbook: {item.skillName} (no saved rule text for this work)
        </p>
      ) : (
        <p className="muted" data-semid="work-item-rule">
          No matching rule in your playbook.
        </p>
      )}
      <section aria-label="Cases">
        <h3>Cases</h3>
        <ul className="skill-cards" data-semid="work-item-cases">
          {(
            item.cases.length > 0
              ? item.cases
              : item.caseIds.map((id) => ({ id }) as import('../../../../shared/schemas').OpportunityCase)
          ).map(
            (entry) => (
              <li key={entry.id} className="skill-card">
                <div>
                  <strong>{entry.customer ?? 'Customer name unavailable'}</strong>{' '}
                  <span className="muted">{entry.id}</span>
                  <div className="muted">{entry.summary ?? 'Request summary unavailable'}</div>
                </div>
                <span className="muted">
                  {item.state === 'ready'
                    ? `${action}${entry.amountCents !== undefined ? ` ${money(entry.amountCents)}` : ' — amount unavailable'}`
                    : 'Waiting on you'}{' '}
                  <button
                    type="button"
                    className="btn-link"
                    data-semid={`work-item-case-open-${entry.id}`}
                    onClick={() => openCase(entry.id)}
                  >
                    Open case
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      </section>
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="teach-actions">
        {item.state === 'ready' ? (
          <Button
            variant="primary"
            data-semid="feed-run-approve"
            disabled={busy}
            onClick={approve}
          >
            Approve {item.caseIds.length} {verb === 'handle' ? 'actions' : verb}
          </Button>
        ) : (
          <Button variant="primary" data-semid="work-item-open-case" onClick={() => openCase()}>
            Open case
          </Button>
        )}
        <Button data-semid="work-item-not-now" onClick={() => onNav({ view: 'home' })}>
          Not now
        </Button>
        {item.state !== 'ready' && (
          <button
            type="button"
            className="btn-link"
            data-semid="work-item-teach"
            onClick={() => onNav({ view: 'teach', goal: `Handle ${item.title.toLowerCase()}` })}
          >
            Teach Muse to handle these
          </button>
        )}
      </div>
      <p className="muted">Nothing runs until you approve.</p>
    </div>
  )
}
