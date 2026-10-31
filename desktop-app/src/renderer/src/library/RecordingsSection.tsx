import { useCallback, useEffect, useRef, useState } from 'react'
import { recipeErrorsFromRejection } from '../../../shared/policy/recipe'
import type { CompileResult, Proposal, ProviderId, Recording } from '../../../shared/schemas'
import { countReviewItems } from '../../../shared/skills/review'
import { TARGET } from '../../../shared/target'
import type { RecordingSummary } from '../../../shared/schemas'
import { Button } from '../components/Button'
import { friendlyError } from '../lib/errors'
import { bindingSentences, stepLabel } from '../lib/humanize'
import { Screenshot } from './Screenshot'

export function RecordingsSection({
  focusId,
  onSkillSaved
}: {
  focusId: string | null
  onSkillSaved: (skillId: string) => void
}): React.JSX.Element {
  const [summaries, setSummaries] = useState<RecordingSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(focusId)
  const [detail, setDetail] = useState<Recording | null>(null)
  const [providerId, setProviderId] = useState<ProviderId>('fixture')
  const providerTouched = useRef(false)
  const [compile, setCompile] = useState<CompileResult | null>(null)
  const [skillName, setSkillName] = useState('')
  const namedFor = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recipeErrors, setRecipeErrors] = useState<string[] | null>(null)

  const refreshList = useCallback(() => {
    window.ghost.recordings
      .list()
      .then(setSummaries)
      .catch((err: unknown) => setError(friendlyError(err)))
  }, [])

  useEffect(() => {
    refreshList()
    return window.ghost.library.onChanged(refreshList)
  }, [refreshList])
  useEffect(() => {
    window.ghost.providers
      .getDefault()
      .then((next) => {
        if (!providerTouched.current) setProviderId(next)
      })
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    if (focusId) setSelectedId(focusId)
  }, [focusId])

  useEffect(() => {
    setDetail(null)
    setCompile(null)
    if (!selectedId) return
    window.ghost.recordings
      .get(selectedId)
      .then(setDetail)
      .catch((err: unknown) => setError(friendlyError(err)))
  }, [selectedId])

  // Prefill the skill name from the recording goal (once per recording so
  // user edits are never clobbered).
  useEffect(() => {
    if (detail && namedFor.current !== detail.id) {
      namedFor.current = detail.id
      setSkillName(detail.goal)
    }
  }, [detail])

  const generate = (): void => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    window.ghost.skills
      .compile(selectedId, providerId)
      .then(setCompile)
      .catch((err: unknown) => setError(friendlyError(err)))
      .finally(() => setBusy(false))
  }

  const proposalReviewCount =
    compile && compile.ok ? countReviewItems(compile.proposal.recipe, compile.proposal.unresolved) : 0

  const save = (proposal: Proposal): void => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    setRecipeErrors(null)
    window.ghost.skills
      .saveDraft({
        name: skillName,
        recipe: proposal.recipe,
        recordingIds: [selectedId],
        providerId,
        unresolved: proposal.unresolved
      })
      .then((skill) => onSkillSaved(skill.id))
      .catch((err: unknown) => {
        const list = recipeErrorsFromRejection(err)
        if (list) {
          setRecipeErrors(list)
        } else {
          setError(friendlyError(err))
        }
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className="library-split">
      <div className="library-list" role="listbox" aria-label="Recordings">
        {summaries.length === 0 && (
          <p className="muted">No recordings yet. Teach a task from Home to create one.</p>
        )}
        {summaries.map((summary) => (
          <button
            key={summary.id}
            role="option"
            aria-selected={summary.id === selectedId}
            className={`list-item${summary.id === selectedId ? ' selected' : ''}`}
            data-semid={`recording-${summary.id}`}
            onClick={() => setSelectedId(summary.id)}
          >
            <strong>{summary.goal}</strong>
            <span className="muted">
              {summary.eventCount} events · {summary.noteCount} notes ·{' '}
              {new Date(summary.startedAt).toLocaleString()}
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
        {recipeErrors !== null && (
          <ul className="alert-error" role="alert" data-semid="skill-recipe-errors">
            {recipeErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        {!detail && <p className="muted">Select a recording to inspect its evidence.</p>}
        {detail && (
          <article>
            <h2 data-semid="recording-heading">{detail.goal}</h2>
            <p className="muted">
              {detail.id} · {detail.applicationScope} · {detail.events.length} events
            </p>
            {detail.notes.length > 0 && (
              <section aria-label="Notes">
                <h3>Notes</h3>
                <ul>
                  {detail.notes.map((note, index) => (
                    <li key={`${note.sequence}-${index}`}>
                      <span className="muted">@{note.sequence}</span> {note.text}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <details className="advanced">
              <summary>Advanced: provider and raw events</summary>
              <div className="field">
                <label htmlFor="provider">Provider</label>
                <select
                  id="provider"
                  data-semid="compile-provider"
                  value={providerId}
                  onChange={(event) => {
                    providerTouched.current = true
                    setProviderId(event.target.value as ProviderId)
                  }}
                >
                  <option value="fixture">Fixture (offline, deterministic)</option>
                  <option value="meta">Meta (requires MODEL_API_KEY)</option>
                </select>
                {providerId === 'fixture' && detail.applicationScope !== TARGET.id && (
                  <p className="muted" data-semid="fixture-site-hint">
                    Fixture is tuned for Saltbreak; set MODEL_API_KEY for general sites.
                  </p>
                )}
              </div>
              <table className="cases-table" data-semid="recording-events">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Type</th>
                    <th scope="col">Target</th>
                    <th scope="col">Value</th>
                    <th scope="col">Shot</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.events.map((event) => (
                    <tr key={event.sequence}>
                      <td>{event.sequence}</td>
                      <td>{event.type}</td>
                      <td>{event.semanticId ?? event.targetLabel ?? '—'}</td>
                      <td>{event.value ?? '—'}</td>
                      <td>
                        {event.screenshotRef ? (
                          <Screenshot shotRef={event.screenshotRef} alt={`Event ${event.sequence}`} />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <section aria-label="Generate procedure" className="card">
              <h3>Draft procedure</h3>
              <div className="field">
                <Button
                  variant="primary"
                  data-semid="generate-draft"
                  disabled={busy}
                  onClick={generate}
                >
                  {busy ? 'Working…' : 'Generate draft procedure'}
                </Button>
              </div>
              {compile && !compile.ok && (
                <ul className="alert-error" role="alert">
                  {compile.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
              {compile?.ok && (
                <div data-semid="proposal-preview">
                  {compile.proposal.unresolved.length > 0 && (
                    <ul className="alert-warn" data-semid="proposal-unresolved">
                      {compile.proposal.unresolved.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  <h4>Parameter bindings</h4>
                  <ul data-semid="proposal-bindings">
                    {bindingSentences(compile.proposal.demonstrated).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <h4>Steps</h4>
                  <ol data-semid="proposal-steps">
                    {compile.proposal.recipe.steps.map((step) => (
                      <li key={step.id}>
                        <strong>{stepLabel(step)}</strong>{' '}
                        <span className="muted">{step.id}</span>
                      </li>
                    ))}
                  </ol>
                  {proposalReviewCount > 0 && (
                    <p className="alert-warn" role="status" data-semid="guided-run-nudge">
                      Contains {proposalReviewCount} review items — guided runs recommended.
                    </p>
                  )}
                  <div className="field">
                    <label htmlFor="skill-name">Skill name</label>
                    <input
                      id="skill-name"
                      data-semid="skill-name"
                      type="text"
                      value={skillName}
                      onChange={(event) => setSkillName(event.target.value)}
                    />
                    <Button
                      variant="primary"
                      data-semid="save-draft"
                      disabled={busy}
                      onClick={() => save(compile.proposal)}
                    >
                      Save as draft skill
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </article>
        )}
      </div>
    </div>
  )
}
