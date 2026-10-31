import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageIdea, PageIdeasResult } from '../../../shared/schemas'
import type { StarterTask } from '../../../shared/target'
import { friendlyError } from '../lib/errors'

/** Rows shown per page; the rest stay one click away via Teach. */
const MAX_ROWS = 3

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function tooltipFor(idea: PageIdea): string {
  return idea.exampleInput ? `${idea.why} Try: ${idea.exampleInput}.` : idea.why
}

/**
 * Contextual ideas for the page showing in the target window. Paints the
 * heuristic list instantly, then replaces it when the AI ideas arrive
 * (immediately on a cache hit), and re-fetches on every page change.
 */
export function PageIdeas({
  onTeach,
  onResult,
  onStarter,
  selectedId,
  hint,
  bare
}: {
  onTeach: (idea: PageIdea) => void
  onResult?: (result: PageIdeasResult | null) => void
  /** Tap-to-run for a curated starter task (review flow, not Teach). */
  onStarter?: (task: StarterTask) => void
  /** Highlighted row, if any. Only the Teach list selects. */
  selectedId?: string | null
  /** One line under the heading (Teach only; Home has no form below). */
  hint?: string
  /** Skip the card wrapper when the parent provides it. */
  bare?: boolean
}): React.JSX.Element {
  const [result, setResult] = useState<PageIdeasResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [starters, setStarters] = useState<StarterTask[]>([])
  const [pagePath, setPagePath] = useState<string | null>(null)
  const requestId = useRef(0)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const fetchIdeas = useCallback((refresh: boolean): void => {
    requestId.current += 1
    const id = requestId.current
    setLoading(true)
    setError(null)
    window.ghost.suggest
      .forPage({ fast: true, refresh })
      .then((fast) => {
        if (requestId.current !== id) return
        setResult(fast)
        onResultRef.current?.(fast)
        // A cached AI result needs no second round trip.
        if (fast.source === 'ai') {
          setLoading(false)
          return
        }
        return window.ghost.suggest.forPage({ refresh }).then((full) => {
          if (requestId.current !== id) return
          setResult(full)
          onResultRef.current?.(full)
          setLoading(false)
        })
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return
        setError(friendlyError(err))
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchIdeas(false)
  }, [fetchIdeas])

  useEffect(() => {
    window.ghost.target
      .getInfo()
      .then((info) => setStarters(info.starterTasks ?? []))
      .catch(() => undefined)
  }, [])

  useEffect(
    () =>
      window.ghost.target.onPageChanged((page) => {
        try {
          setPagePath(new URL(page.url).pathname)
        } catch {
          setPagePath(null)
        }
        fetchIdeas(false)
      }),
    [fetchIdeas]
  )

  // Owner starters on /staff/*, shopper starters on the storefront; while the
  // page is still unknown, show everything rather than an empty card.
  const areaStarters =
    pagePath === null
      ? starters
      : starters.filter((task) =>
          pagePath.startsWith('/staff/') ? task.audience === 'owner' : task.audience === 'shopper'
        )
  const rows = (result?.ideas ?? []).slice(0, MAX_ROWS)

  const body = (
    <>
      <div className="idea-head">
        <h2>Ideas for this page</h2>
        <button
          type="button"
          className="btn-link"
          data-semid="page-ideas-refresh"
          onClick={() => fetchIdeas(true)}
          disabled={loading && result === null}
        >
          Refresh
        </button>
      </div>
      {result !== null && result.page.url !== '' && (
        <p className="muted">{hostOf(result.page.url)}</p>
      )}
      {hint !== undefined && <p className="muted">{hint}</p>}
      {loading && result === null && !error && <p className="muted">Reading this page…</p>}
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {result !== null && result.ideas.length === 0 && result.page.url !== '' && !loading && error === null && (
        <p className="muted">No automatable tasks spotted on this page yet.</p>
      )}
      {onStarter && areaStarters.length > 0 && (
        <ul className="idea-list" data-semid="starter-tasks">
          {areaStarters.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                className="idea-row"
                data-semid={`starter-teach-${task.id}`}
                title={task.title}
                onClick={() => onStarter(task)}
              >
                <strong>{task.title}</strong>
                <span className="audience">
                  {task.audience === 'owner' ? 'For the shop owner' : 'For shoppers'}
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <ul className="idea-list" data-semid="page-ideas">
          {rows.map((idea) => (
            <li key={idea.id}>
              <button
                type="button"
                className={`idea-row${idea.id === selectedId ? ' selected' : ''}`}
                data-semid={`page-idea-teach-${idea.id}`}
                title={tooltipFor(idea)}
                onClick={() => onTeach(idea)}
              >
                <strong>{idea.title}</strong>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && result !== null && <p className="muted">Polishing with AI…</p>}
      {result?.warning && <p className="muted">{result.warning}</p>}
    </>
  )

  if (bare) return body
  return (
    <section className="card" aria-label="Ideas for this page">
      {body}
    </section>
  )
}
