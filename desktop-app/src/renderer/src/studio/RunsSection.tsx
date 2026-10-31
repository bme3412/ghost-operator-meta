import { useEffect, useState } from 'react'
import type { RunRecord } from '../../../shared/schemas'

export function RunsSection({ focusId }: { focusId: string | null }): React.JSX.Element {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(focusId)
  const [detail, setDetail] = useState<RunRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      window.ghost.runs
        .list()
        .then(setRuns)
        .catch((err: unknown) => setError(String(err)))
    }
    load()
    const offLibrary = window.ghost.library.onChanged(load)
    const offProgress = window.ghost.runs.onProgress(() => load())
    return () => {
      offLibrary()
      offProgress()
    }
  }, [])
  useEffect(() => {
    if (focusId) setSelectedId(focusId)
  }, [focusId])
  useEffect(() => {
    setDetail(null)
    if (!selectedId) return
    window.ghost.runs
      .get(selectedId)
      .then(setDetail)
      .catch((err: unknown) => setError(String(err)))
  }, [selectedId])

  return (
    <div className="studio-split">
      <div className="studio-list" role="listbox" aria-label="Runs">
        {runs.length === 0 && <p className="muted">No runs yet. Start one from the sidecar.</p>}
        {runs.map((run) => (
          <button
            key={run.id}
            role="option"
            aria-selected={run.id === selectedId}
            className={`list-item${run.id === selectedId ? ' selected' : ''}`}
            data-semid={`run-${run.id}`}
            onClick={() => setSelectedId(run.id)}
          >
            <strong>
              {run.skillId} v{run.skillVersion}
            </strong>
            <span className="muted">
              {run.mode} · {run.status} · {new Date(run.startedAt).toLocaleString()}
            </span>
          </button>
        ))}
      </div>
      <div className="studio-detail">
        {error !== null && (
          <p className="alert-error" role="alert">
            {error}
          </p>
        )}
        {!detail && <p className="muted">Select a run to inspect its record.</p>}
        {detail && (
          <article>
            <h2 data-semid="run-heading">
              {detail.skillId} v{detail.skillVersion}{' '}
              <span className="muted">
                ({detail.mode} · {detail.status})
              </span>
            </h2>
            <p className="muted">
              {detail.id} · started {new Date(detail.startedAt).toLocaleString()}
              {detail.endedAt && ` · ended ${new Date(detail.endedAt).toLocaleString()}`}
            </p>
            {detail.error && (
              <p className="alert-error" role="alert">
                {detail.error}
              </p>
            )}
            <section aria-label="Bound inputs">
              <h3>Bound inputs</h3>
              <ul data-semid="run-inputs">
                {Object.entries(detail.inputs).map(([key, value]) => (
                  <li key={key}>
                    {key}: <strong>{value}</strong>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Step attempts">
              <h3>Step attempts</h3>
              {detail.attempts.length === 0 && <p className="muted">No attempts recorded.</p>}
              <ol data-semid="run-attempts">
                {detail.attempts.map((attempt, index) => (
                  <li key={`${attempt.stepId}-${index}`}>
                    <strong>{attempt.stepId}</strong> (attempt {attempt.attempt + 1})
                    {attempt.passed !== undefined && (attempt.passed ? ' ✓' : ' ✗')}
                    <div className="muted">{attempt.observedOutcome}</div>
                    {attempt.actions.length > 0 && (
                      <div className="muted">Actions: {attempt.actions.join('; ')}</div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <section aria-label="Verification">
              <h3>Verification</h3>
              {detail.checks.length === 0 && <p className="muted">No checks evaluated.</p>}
              <ul data-semid="run-verification">
                {detail.checks.map((check, index) => (
                  <li key={`${check.check}-${index}`}>
                    {check.passed ? '✓' : '✗'} {check.check} — {check.observed}
                  </li>
                ))}
              </ul>
            </section>
          </article>
        )}
      </div>
    </div>
  )
}
