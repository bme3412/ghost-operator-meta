import { useEffect, useRef, useState } from 'react'
import type { RunRecord, SkillSummary } from '../../../shared/schemas'
import { Button } from '../components/Button'
import { DecisionList } from '../components/Decisions'
import { friendlyError } from '../lib/errors'
import { runModeLabel, runStatusLabel, stepLabel } from '../lib/humanize'

export function RunsSection({
  focusId,
  focusSkillId,
  onRunSkill,
  onOpenBatch
}: {
  focusId: string | null
  focusSkillId?: string
  onRunSkill?: () => void
  onOpenBatch?: (batchId: string) => void
}): React.JSX.Element {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(focusId)
  const [detail, setDetail] = useState<RunRecord | null>(null)
  const [skillNames, setSkillNames] = useState<Map<string, string>>(new Map())
  const [stepLabels, setStepLabels] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    const load = (): void => {
      window.ghost.runs
        .list()
        .then(setRuns)
        .catch((err: unknown) => setError(friendlyError(err)))
      window.ghost.skills
        .list()
        .then((rows: SkillSummary[]) => setSkillNames(new Map(rows.map((row) => [row.id, row.name]))))
        .catch(() => undefined)
      // Keep the open record fresh too: the list reloading alone left the
      // detail pane showing a stale snapshot of a running run.
      if (selectedRef.current) {
        window.ghost.runs
          .get(selectedRef.current)
          .then(setDetail)
          .catch(() => undefined)
      }
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
      .catch((err: unknown) => setError(friendlyError(err)))
  }, [selectedId])

  const detailSkillId = detail?.skillId
  const detailSkillVersion = detail?.skillVersion
  useEffect(() => {
    setStepLabels(new Map())
    if (!detailSkillId || detailSkillVersion === undefined) return
    window.ghost.skills
      .get(detailSkillId)
      .then((skill) => {
        const record = skill?.versions.find((v) => v.version === detailSkillVersion)
        if (record) {
          setStepLabels(new Map(record.recipe.steps.map((s) => [s.id, stepLabel(s)])))
        }
      })
      .catch(() => undefined)
  }, [detailSkillId, detailSkillVersion])

  const visibleRuns = focusSkillId ? runs.filter((run) => run.skillId === focusSkillId) : runs
  return (
    <div>
      {focusSkillId && (
        <p className="muted" data-semid="activity-filter">
          Showing activity for {skillNames.get(focusSkillId) ?? 'this playbook'} only.
        </p>
      )}
      <BatchList focusSkillId={focusSkillId} onOpenBatch={onOpenBatch} />
      <div className="library-split">
      <div className="library-list" role="listbox" aria-label="Runs">
        {visibleRuns.length === 0 && (
          <div>
            <p className="muted">No runs yet.</p>
            <Button data-semid="library-empty-run" onClick={() => onRunSkill?.()}>
              Run a skill
            </Button>
          </div>
        )}
        {visibleRuns.map((run) => (
          <button
            key={run.id}
            role="option"
            aria-selected={run.id === selectedId}
            className={`list-item${run.id === selectedId ? ' selected' : ''}`}
            data-semid={`run-${run.id}`}
            onClick={() => setSelectedId(run.id)}
          >
            <strong>
              {skillNames.get(run.skillId) ?? run.skillId} v{run.skillVersion}
            </strong>
            <span className="muted">
              {runModeLabel(run.mode)} · {runStatusLabel(run.status)} ·{' '}
              {new Date(run.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </button>
        ))}
      </div>
      <div className="library-detail">
        {error !== null && (
          <p className="alert-error" role="alert">
            {error}
          </p>
        )}
        {!detail && <p className="muted">Select a run to inspect its record.</p>}
        {detail && (
          <article>
            <h2 data-semid="run-heading">
              {skillNames.get(detail.skillId) ?? detail.skillId} v{detail.skillVersion}{' '}
              <span className="muted">
                ({runModeLabel(detail.mode)} · {runStatusLabel(detail.status)})
              </span>
            </h2>
            <p className="muted">
              {detail.id} · started {new Date(detail.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              {detail.endedAt && ` · ended ${new Date(detail.endedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`}
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
            {detail.decisions.length > 0 && (
              <section aria-label="Decisions">
                <h3>Decisions</h3>
                <DecisionList decisions={detail.decisions} />
              </section>
            )}
            <section aria-label="Step attempts">
              <h3>Step attempts</h3>
              {detail.attempts.length === 0 && <p className="muted">No attempts recorded.</p>}
              <ol data-semid="run-attempts">
                {detail.attempts.map((attempt, index) => (
                  <li key={`${attempt.stepId}-${index}`}>
                    {stepLabels.has(attempt.stepId) ? (
                      <strong>{stepLabels.get(attempt.stepId)}</strong>
                    ) : (
                      <span className="muted">{attempt.stepId}</span>
                    )}{' '}
                    (attempt {attempt.attempt + 1})
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
    </div>
  )
}

/** Batch results in Activity: the same record the completion screen shows. */
function BatchList({
  focusSkillId,
  onOpenBatch
}: {
  focusSkillId?: string
  onOpenBatch?: (batchId: string) => void
}): React.JSX.Element {
  const [batches, setBatches] = useState<Array<{
    id: string
    skillId: string
    skillName: string
    status: string
    startedAt: string
    items: Array<{ status: string }>
  }>>([])
  useEffect(() => {
    const load = (): void => {
      window.ghost.batches
        .list()
        .then((rows) =>
          setBatches(
            rows.map((b) => ({
              id: b.id,
              skillId: b.skillId,
              skillName: b.skillName,
              status: b.status,
              startedAt: b.startedAt,
              items: b.items
            }))
          )
        )
        .catch(() => undefined)
    }
    load()
    return window.ghost.library.onChanged(load)
  }, [])
  const visible = focusSkillId ? batches.filter((b) => b.skillId === focusSkillId) : batches
  if (visible.length === 0) return <></>
  return (
    <section aria-label="Batch results">
      <h3>Batch results</h3>
      <ul className="skill-cards" data-semid="activity-batches">
        {visible.map((batch) => {
          const done = batch.items.filter((i) => i.status === 'succeeded').length
          return (
            <li key={batch.id} className="skill-card">
              <div>
                <strong>
                  {done} completed · {batch.skillName}
                </strong>
                <div className="muted">
                  {new Date(batch.startedAt).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}
                </div>
              </div>
              <Button data-semid={`activity-batch-${batch.id}`} onClick={() => onOpenBatch?.(batch.id)}>
                View results
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
