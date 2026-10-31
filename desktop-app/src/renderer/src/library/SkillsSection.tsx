import { useCallback, useEffect, useState } from 'react'
import { recipeErrorsFromRejection } from '../../../shared/policy/recipe'
import {
  SkillRecipe,
  type Skill,
  type SkillSummary,
  type SkillVersionRecord
} from '../../../shared/schemas'
import { stepOutcomes } from '../../../shared/skills/branches'
import { countReviewItems } from '../../../shared/skills/review'
import { Button } from '../components/Button'
import { friendlyError } from '../lib/errors'
import { checkLabel, humanizeKey, stepLabel } from '../lib/humanize'

export function SkillsSection({
  focusId,
  onNavigate
}: {
  focusId: string | null
  onNavigate?: (section: 'recordings' | 'skills' | 'runs' | 'map') => void
}): React.JSX.Element {
  const [summaries, setSummaries] = useState<SkillSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(focusId)
  const [skill, setSkill] = useState<Skill | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [instructions, setInstructions] = useState('')
  const [recipeJson, setRecipeJson] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recipeErrors, setRecipeErrors] = useState<string[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const showError = useCallback((err: unknown): void => {
    const list = recipeErrorsFromRejection(err)
    if (list) {
      setRecipeErrors(list)
      setError(null)
    } else {
      setRecipeErrors(null)
      setError(friendlyError(err))
    }
  }, [])

  const clearError = useCallback((): void => {
    setError(null)
    setRecipeErrors(null)
  }, [])

  const refreshList = useCallback(() => {
    window.ghost.skills
      .list()
      .then(setSummaries)
      .catch((err: unknown) => setError(friendlyError(err)))
  }, [])

  const refreshSkill = useCallback(
    (id: string) => {
      window.ghost.skills
        .get(id)
        .then((next) => {
          setSkill(next)
          if (next) {
            const latest = next.versions[next.versions.length - 1]
            setVersion((current) =>
              current !== null && next.versions.some((v) => v.version === current)
                ? current
                : (latest?.version ?? null)
            )
          }
        })
        .catch((err: unknown) => setError(friendlyError(err)))
    },
    []
  )

  useEffect(() => {
    refreshList()
    return window.ghost.library.onChanged(refreshList)
  }, [refreshList])
  useEffect(() => {
    if (focusId) setSelectedId(focusId)
  }, [focusId])
  useEffect(() => {
    setSkill(null)
    setVersion(null)
    if (selectedId) refreshSkill(selectedId)
  }, [selectedId, refreshSkill])

  const record: SkillVersionRecord | null =
    skill?.versions.find((v) => v.version === version) ?? null

  useEffect(() => {
    setInstructions(record?.instructions ?? '')
    setRecipeJson(record ? JSON.stringify(record.recipe, null, 2) : '')
    setNotice(null)
  }, [record?.version, record?.instructions, skill?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (): void => {
    if (!skill || !record) return
    let recipe: SkillRecipe
    try {
      recipe = SkillRecipe.parse(JSON.parse(recipeJson))
    } catch (err) {
      setError(`Recipe is not valid: ${(err as Error).message}`)
      return
    }
    setBusy(true)
    clearError()
    window.ghost.skills
      .updateDraft({ skillId: skill.id, version: record.version, recipe, instructions })
      .then((next) => {
        setSkill(next)
        refreshList()
        setNotice('Draft saved.')
      })
      .catch(showError)
      .finally(() => setBusy(false))
  }

  const publish = (): void => {
    if (!skill || !record) return
    setBusy(true)
    clearError()
    window.ghost.skills
      .publish({ skillId: skill.id, version: record.version })
      .then((next) => {
        setSkill(next)
        refreshList()
        setNotice(`Version ${record.version} published.`)
      })
      .catch(showError)
      .finally(() => setBusy(false))
  }

  const newDraftFromPublished = (): void => {
    if (!skill || !record) return
    setBusy(true)
    clearError()
    window.ghost.skills
      .saveDraft({
        skillId: skill.id,
        name: skill.name,
        recipe: record.recipe,
        recordingIds: record.recordingIds,
        providerId: record.providerId,
        unresolved: []
      })
      .then((next) => {
        setSkill(next)
        refreshList()
        const latest = next.versions[next.versions.length - 1]
        setVersion(latest?.version ?? null)
        setNotice('New draft version created.')
      })
      .catch(showError)
      .finally(() => setBusy(false))
  }

  const isDraft = record?.status === 'draft'
  const reviewCount = record ? countReviewItems(record.recipe, record.unresolved) : 0

  return (
    <div className="library-split">
      <div className="library-list" role="listbox" aria-label="Skills">
        {summaries.length === 0 && (
          <div>
            <p className="muted">No skills yet. Compile a recording to create one.</p>
            <Button data-semid="empty-open-recordings" onClick={() => onNavigate?.('recordings')}>
              Go to recordings
            </Button>
          </div>
        )}
        {summaries.map((summary) => (
          <button
            key={summary.id}
            role="option"
            aria-selected={summary.id === selectedId}
            className={`list-item${summary.id === selectedId ? ' selected' : ''}`}
            data-semid={`skill-${summary.id}`}
            onClick={() => setSelectedId(summary.id)}
          >
            <strong>{summary.name}</strong>
            <span className="muted">
              v{summary.latestVersion} ({summary.latestStatus})
              {summary.activeVersion !== null && ` · active v${summary.activeVersion}`}
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
        {notice !== null && (
          <p className="alert-success" role="status">
            {notice}
          </p>
        )}
        {!skill && <p className="muted">Select a skill to inspect and edit it.</p>}
        {skill && (
          <article>
            <h2 data-semid="skill-heading">{skill.name}</h2>
            <div className="version-tabs" role="tablist" aria-label="Versions">
              {skill.versions.map((v) => (
                <button
                  key={v.version}
                  role="tab"
                  aria-selected={v.version === version}
                  className={`tab${v.version === version ? ' selected' : ''}`}
                  data-semid={`skill-version-${v.version}`}
                  onClick={() => setVersion(v.version)}
                >
                  v{v.version} ({v.status})
                </button>
              ))}
            </div>
            {record && (
              <>
                <p className="muted">
                  Created {new Date(record.createdAt).toLocaleString()}
                  {record.recordingIds.length > 0 &&
                    ` · Evidence: ${record.recordingIds.join(', ')}`}
                </p>
                {record.unresolved.length > 0 && (
                  <ul className="alert-warn" data-semid="skill-unresolved">
                    {record.unresolved.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                <section aria-label="Steps">
                  <h3>Steps</h3>
                  <ol className="steps-list" data-semid="skill-steps">
                    {record.recipe.steps.map((step) => (
                      <li key={step.id}>
                        <strong>{stepLabel(step)}</strong>
                        {step.kind === 'review' && (
                          <span className="muted"> — needs your review on each run</span>
                        )}
                        <div className="muted">{step.id}</div>
                        {Object.keys(step.bindings).length > 0 && (
                          <div className="muted">
                            Binds:{' '}
                            {Object.entries(step.bindings)
                              .map(([k, v]) => `${humanizeKey(k)} ← ${v}`)
                              .join(', ')}
                          </div>
                        )}
                        {step.checks.length > 0 && (
                          <div className="muted">
                            Checks:{' '}
                            {step.checks.map((c) => checkLabel(c.name, c.expected)).join('; ')}
                          </div>
                        )}
                        {step.why && <div className="muted">Why: {step.why}</div>}
                      </li>
                    ))}
                  </ol>
                </section>
                <section aria-label="Instructions">
                  <h3>Instructions</h3>
                  <textarea
                    className="code-area"
                    rows={10}
                    data-semid="skill-instructions"
                    value={instructions}
                    disabled={!isDraft}
                    onChange={(event) => setInstructions(event.target.value)}
                  />
                </section>
                <details className="advanced">
                  <summary>Advanced</summary>
                  <p className="muted">Drafted with provider: {record.providerId}</p>
                  <section aria-label="Branches">
                    <h3>Branches</h3>
                    <ul className="steps-list" data-semid="skill-branches">
                      {record.recipe.steps.map((step) => (
                        <li key={step.id}>
                          <strong>{step.id}</strong>
                          <ul>
                            {stepOutcomes(step).map((outcome) => (
                              <li key={outcome} className="muted">
                                {outcome}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section aria-label="Recipe JSON">
                    <h3>Recipe JSON</h3>
                    <textarea
                      className="code-area"
                      rows={12}
                      data-semid="skill-recipe-json"
                      value={recipeJson}
                      disabled={!isDraft}
                      spellCheck={false}
                      onChange={(event) => setRecipeJson(event.target.value)}
                    />
                  </section>
                </details>
                {reviewCount > 0 && (
                  <p className="alert-warn" role="status" data-semid="guided-run-nudge">
                    Contains {reviewCount} review item{reviewCount === 1 ? '' : 's'} — guided
                    runs recommended.
                  </p>
                )}
                <div className="field">
                  {isDraft && (
                    <>
                      <Button
                        variant="primary"
                        data-semid="skill-save"
                        disabled={busy}
                        onClick={save}
                      >
                        Save draft
                      </Button>
                      <Button data-semid="skill-publish" disabled={busy} onClick={publish}>
                        Publish
                      </Button>
                    </>
                  )}
                  {!isDraft && (
                    <Button data-semid="skill-new-draft" disabled={busy} onClick={newDraftFromPublished}>
                      Edit as new draft
                    </Button>
                  )}
                </div>
              </>
            )}
          </article>
        )}
      </div>
    </div>
  )
}
