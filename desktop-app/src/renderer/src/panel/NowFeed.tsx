import { useCallback, useEffect, useState } from 'react'
import type { ActivityFeed, Opportunity } from '../../../shared/schemas'
import { Button } from '../components/Button'
import { friendlyError } from '../lib/errors'
import type { OnNav } from './nav'


/** Outcome phrasing for a cluster: the proposed action, in owner language. */
export function outcomeTitle(opportunity: Opportunity): string {
  const n = opportunity.caseIds.length
  const action = opportunity.actionLabel
  if (opportunity.category === 'damaged') {
    return action
      ? `${action} ${n} damaged ${n === 1 ? 'delivery' : 'deliveries'}`
      : `${n} damaged ${n === 1 ? 'delivery' : 'deliveries'}`
  }
  if (opportunity.category === 'wrong-size') {
    return action
      ? `${action} ${n} wrong-size ${n === 1 ? 'item' : 'items'}`
      : `${n} wrong-size ${n === 1 ? 'item' : 'items'}`
  }
  if (opportunity.category === 'chargeback') return 'Payment dispute'
  return opportunity.title
}

function reviewLabel(opportunity: Opportunity): string {
  if (opportunity.state !== 'ready') return 'Open case'
  if (opportunity.actionLabel) return `Review ${opportunity.actionLabel.toLowerCase()}s`
  if (opportunity.category === 'damaged') return 'Review refunds'
  if (opportunity.category === 'wrong-size') return 'Review exchanges'
  return 'Review'
}

/**
 * Today's work list: a compact summary, exceptions first, then covered
 * work. Items open their detail in the same panel; nothing runs from here.
 */
export function NowFeed({ onNav }: { onNav: OnNav }): React.JSX.Element {
  const [feed, setFeed] = useState<ActivityFeed | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    window.ghost.activity
      .getFeed()
      .then((next) => {
        setFeed(next)
        setError(null)
      })
      .catch((err: unknown) => setError(friendlyError(err)))
  }, [])

  useEffect(() => {
    load()
    const offActivity = window.ghost.activity.onChanged(load)
    const offLibrary = window.ghost.library.onChanged(load)
    const timer = window.setInterval(load, 15_000)
    return () => {
      offActivity()
      offLibrary()
      window.clearInterval(timer)
    }
  }, [load])

  const dismiss = (opportunity: Opportunity): void => {
    window.ghost.activity
      .dismiss(opportunity.id)
      .then(load)
      .catch((err: unknown) => setError(friendlyError(err)))
  }

  const renderOpportunity = (opportunity: Opportunity, featured: boolean): React.JSX.Element => (
    <li
      key={opportunity.id}
      className={`skill-card${opportunity.state !== 'ready' ? ' feed-row-judgment' : ''}`}
      data-semid={`feed-item-${opportunity.id}`}
    >
      <div>
        <strong>{outcomeTitle(opportunity)}</strong>
        <p className="muted">
          {opportunity.state !== 'ready' && opportunity.category === 'chargeback'
            ? 'No matching rule in your playbook.'
            : opportunity.because}
        </p>
      </div>
      <div className="teach-actions">
        <Button
          variant={featured ? 'primary' : 'default'}
          data-semid={`feed-review-${opportunity.id}`}
          onClick={() => onNav({ view: 'workItem', opportunityId: opportunity.id })}
        >
          {reviewLabel(opportunity)}
        </Button>
        <Button data-semid={`feed-dismiss-${opportunity.id}`} onClick={() => dismiss(opportunity)}>
          Dismiss
        </Button>
      </div>
    </li>
  )

  const readyCases = feed?.ready.reduce((sum, o) => sum + o.caseIds.length, 0) ?? 0
  const needsCount = feed?.needsYou.length ?? 0

  return (
    <div data-semid="now-feed">
      {error !== null && feed === null && (
        <p className="alert-error" role="alert" data-semid="feed-load-failed">
          Today could not load. Check that Saltbreak is running, then reopen Today.
        </p>
      )}
      {feed?.warning && (
        <p className="alert-warn" role="status">
          {feed.warning}
        </p>
      )}
      {feed === null && error === null && <p className="muted">Loading today's work…</p>}

      {feed !== null && (readyCases > 0 || needsCount > 0) && (
        <p className="briefing-summary" data-semid="feed-summary">
          {readyCases > 0 && (
            <span>
              {readyCases} request{readyCases === 1 ? '' : 's'} ready for review
            </span>
          )}
          {readyCases > 0 && needsCount > 0 && <span aria-hidden="true"> · </span>}
          {needsCount > 0 && (
            <span>
              {needsCount} need{needsCount === 1 ? 's' : ''} your decision
            </span>
          )}
        </p>
      )}

      {error !== null && feed !== null && (
        <p className="alert-warn" role="status" data-semid="feed-stale">
          Couldn't refresh — this information may be out of date.
        </p>
      )}
      {feed !== null && feed.needsYou.length > 0 && (
        <section aria-label="Needs your judgment">
          <h2>Needs your judgment</h2>
          <ul className="skill-cards">
            {feed.needsYou.map((o, i) => renderOpportunity(o, i === 0))}
          </ul>
        </section>
      )}
      {feed !== null && feed.ready.length > 0 && (
        <section aria-label="Ready when you are">
          <h2>Ready when you are</h2>
          <ul className="skill-cards">
            {feed.ready.map((o, i) => renderOpportunity(o, feed.needsYou.length === 0 && i === 0))}
          </ul>
        </section>
      )}
      {feed !== null && feed.needsYou.length === 0 && feed.ready.length === 0 && (
        <p className="muted" data-semid="feed-caught-up">
          You're caught up. Nothing needs your decision right now.
        </p>
      )}

      {(feed !== null || error !== null) &&
        (feed !== null && feed.ready.length === 0 ? (
          <p>
            <Button
              variant="primary"
              data-testid="panel-teach"
              data-semid="teach"
              onClick={() => onNav({ view: 'teach' })}
            >
              Teach Muse
            </Button>{' '}
            <span className="muted">— no saved approach covers this yet.</span>
          </p>
        ) : (
          <p>
            <button
              type="button"
              className="btn-link"
              data-testid="panel-teach"
              data-semid="teach"
              onClick={() => onNav({ view: 'teach' })}
            >
              Teach Muse
            </button>{' '}
            <span className="muted">— show Muse something new, once.</span>
          </p>
        ))}

      {feed !== null && feed.recent.length > 0 && (
        <section aria-label="Earlier">
          <h2>Earlier</h2>
          <ul className="skill-cards" data-semid="feed-recent">
            {feed.recent.map((item) => (
              <li key={item.id} className="skill-card">
                <div>
                  <span>{item.title}</span>{' '}
                  <span className="muted">{new Date(item.at).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
