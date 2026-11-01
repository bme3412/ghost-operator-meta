import { useCallback, useEffect, useState } from 'react'
import type { ActivityFeed, Opportunity } from '../../../shared/schemas'
import { Button } from '../components/Button'
import { friendlyError } from '../lib/errors'
import type { OnNav } from './nav'
import { PageIdeas } from './PageIdeas'

/**
 * The Now feed: what happened (signal), why it matters (pattern), and the
 * next safe action. Clusters and matching are deterministic in the main
 * process; this view only renders and navigates.
 */
export function NowFeed({ onNav }: { onNav: OnNav }): React.JSX.Element {
  const [feed, setFeed] = useState<ActivityFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    window.ghost.activity
      .getFeed()
      .then(setFeed)
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

  const runReady = (opportunity: Opportunity): void => {
    if (!opportunity.skillId) return
    setBusyId(opportunity.id)
    window.ghost.batches
      .start({
        skillId: opportunity.skillId,
        inputKey: 'ticketId',
        caseIds: opportunity.caseIds,
        sharedInputs: {}
      })
      .then((batch) => {
        void window.ghost.activity.act(opportunity.id).catch(() => undefined)
        onNav({ view: 'batch', batchId: batch.id })
      })
      .catch((err: unknown) => setError(friendlyError(err)))
      .finally(() => setBusyId(null))
  }

  const reviewNeedsYou = (opportunity: Opportunity): void => {
    void window.ghost.activity.act(opportunity.id).catch(() => undefined)
    if (opportunity.skillId) {
      onNav({
        view: 'runSetup',
        skillId: opportunity.skillId,
        demonstrated: { ticketId: opportunity.caseIds[0] ?? '' }
      })
    } else {
      onNav({ view: 'teach', goal: `Handle ${opportunity.title.toLowerCase()}` })
    }
  }

  const renderOpportunity = (opportunity: Opportunity): React.JSX.Element => (
    <li key={opportunity.id} className="skill-card" data-semid={`feed-item-${opportunity.id}`}>
      <div>
        <strong>{opportunity.title}</strong>
        <p className="muted">Because… {opportunity.because}</p>
        {expandedId === opportunity.id && (
          <p className="muted" data-semid={`feed-preview-${opportunity.id}`}>
            Affected: {opportunity.caseIds.join(', ')}
            {opportunity.skillName ? ` · Skill: ${opportunity.skillName}` : ''}
          </p>
        )}
      </div>
      <div className="teach-actions">
        {opportunity.state === 'ready' ? (
          <>
            <Button
              data-semid={`feed-preview-btn-${opportunity.id}`}
              onClick={() => setExpandedId(expandedId === opportunity.id ? null : opportunity.id)}
            >
              {expandedId === opportunity.id ? 'Hide' : 'Preview'}
            </Button>
            <Button
              variant="primary"
              data-semid={`feed-run-${opportunity.id}`}
              disabled={busyId === opportunity.id}
              onClick={() => runReady(opportunity)}
            >
              Run on {opportunity.caseIds.length}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            data-semid={`feed-review-${opportunity.id}`}
            onClick={() => reviewNeedsYou(opportunity)}
          >
            Review
          </Button>
        )}
        <Button data-semid={`feed-dismiss-${opportunity.id}`} onClick={() => dismiss(opportunity)}>
          Dismiss
        </Button>
      </div>
    </li>
  )

  return (
    <div data-semid="now-feed">
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {feed?.warning && (
        <p className="alert-warn" role="status">
          {feed.warning}
        </p>
      )}
      {feed === null && <p className="muted">Watching for new work…</p>}

      {feed !== null && feed.needsYou.length > 0 && (
        <section className="card" aria-label="Needs you">
          <h2>Needs you</h2>
          <ul className="skill-cards">{feed.needsYou.map(renderOpportunity)}</ul>
        </section>
      )}
      {feed !== null && feed.ready.length > 0 && (
        <section className="card" aria-label="Ready to run">
          <h2>Ready to run</h2>
          <ul className="skill-cards">{feed.ready.map(renderOpportunity)}</ul>
        </section>
      )}
      {feed !== null && feed.needsYou.length === 0 && feed.ready.length === 0 && (
        <p className="muted" data-semid="feed-caught-up">
          All caught up. New tickets and orders will show up here.
        </p>
      )}

      <PageIdeas
        onTeach={(idea) => onNav({ view: 'teach', goal: idea.title, example: idea.exampleInput })}
      />

      {feed !== null && feed.recent.length > 0 && (
        <section className="card" aria-label="Recent activity">
          <h2>Recent activity</h2>
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
