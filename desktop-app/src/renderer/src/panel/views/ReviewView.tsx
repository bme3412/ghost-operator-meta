import { useEffect, useRef, useState } from 'react'
import { takePendingUpdateSkillId } from '../../lib/pendingUpdate'
import type { Proposal } from '../../../../shared/schemas'
import { Button } from '../../components/Button'
import { RulesCard } from '../../components/Decisions'
import { friendlyError } from '../../lib/errors'
import { bindingSentences, demonstratedInputs, stepLabel } from '../../lib/humanize'
import type { OnNav } from '../nav'

type Phase = 'generating' | 'ready' | 'failed'

export function ReviewView({
  onNav,
  recordingId,
  scriptedId,
  scriptName
}: {
  onNav: OnNav
  /** Demonstrated flow: compile this recording. Mutually exclusive with scriptedId. */
  recordingId?: string
  /** Curated flow: load this canned fixture script instead of compiling. */
  scriptedId?: string
  /** Default skill name for the curated flow. */
  scriptName?: string
}): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('generating')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [providerId, setProviderId] = useState<string>('fixture')
  const [skillName, setSkillName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [updateSkillId] = useState<string | null>(() => takePendingUpdateSkillId())
  const startedFor = useRef<string | null>(null)
  // Stale completions (StrictMode re-invocation, recording change, manual
  // retry racing an earlier attempt) must never paint another run's draft.
  const runToken = useRef(0)

  const generate = (): void => {
    const token = ++runToken.current
    setPhase('generating')
    setError(null)
    setProposal(null)
    if (scriptedId) {
      setProviderId('fixture')
      window.ghost.skills
        .script(scriptedId)
        .then((result) => {
          if (runToken.current !== token) return
          if (!result.ok) {
            setPhase('failed')
            setError(result.errors.join('; '))
            return
          }
          setProposal(result.proposal)
          setPhase('ready')
        })
        .catch((err: unknown) => {
          if (runToken.current !== token) return
          setPhase('failed')
          setError(friendlyError(err))
        })
      return
    }
    if (!recordingId) {
      setPhase('failed')
      setError('Nothing to review.')
      return
    }
    window.ghost.providers
      .getDefault()
      .then((provider) => {
        if (runToken.current !== token) return null
        setProviderId(provider)
        return window.ghost.skills.compile(recordingId, provider)
      })
      .then((result) => {
        if (runToken.current !== token || result === null) return
        if (!result.ok) {
          setPhase('failed')
          setError(result.errors.join('; '))
          return
        }
        setProposal(result.proposal)
        setPhase('ready')
      })
      .catch((err: unknown) => {
        if (runToken.current !== token) return
        setPhase('failed')
        setError(friendlyError(err))
      })
  }

  // The draft generates automatically on entry, using the default provider.
  // The curated flow names the skill from the starter task instead.
  useEffect(() => {
    const key = scriptedId ?? recordingId ?? ''
    if (startedFor.current === key) return
    startedFor.current = key
    generate()
    if (scriptedId) {
      setSkillName(scriptName ?? '')
      return
    }
    if (!recordingId) return
    const token = runToken.current
    window.ghost.recordings
      .get(recordingId)
      .then((recording) => {
        if (recording && runToken.current === token) setSkillName(recording.goal)
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId, scriptedId])

  const [savedMatch, setSavedMatch] = useState<{
    id: string
    count: number
    skillId: string
  } | null>(null)

  const save = (publish: boolean): void => {
    if (!proposal || skillName.trim() === '') {
      setError('Give the skill a name first.')
      return
    }
    setBusy(true)
    setError(null)
    window.ghost.skills
      .saveDraft({
        // Revising: append a new version to the same playbook, never a copy.
        ...(updateSkillId ? { skillId: updateSkillId } : {}),
        name: skillName.trim(),
        recipe: proposal.recipe,
        recordingIds: recordingId ? [recordingId] : [],
        providerId,
        unresolved: proposal.unresolved
      })
      .then((skill) => {
        if (!publish) {
          onNav({ view: 'library', libraryTab: 'skills', focusId: skill.id })
          return null
        }
        const latest = skill.versions[skill.versions.length - 1]
        if (!latest) throw new Error('The saved draft has no version to publish.')
        return window.ghost.skills
          .publish({ skillId: skill.id, version: latest.version })
          .then(async () => {
            // If open work already matches this approach, offer its review
            // first; otherwise go straight to a first manual run. The lookup
            // must never stall the save: give it a short budget.
            const lookup = window.ghost.activity
              .getFeed()
              .then((feed) =>
                [...feed.ready, ...feed.needsYou].find((o) => o.skillId === skill.id)
              )
              .catch(() => undefined)
            const match = await Promise.race([
              lookup,
              new Promise<undefined>((resolve) => {
                window.setTimeout(() => resolve(undefined), 10_000)
              })
            ])
            if (match) {
              setSavedMatch({ id: match.id, count: match.caseIds.length, skillId: skill.id })
              setBusy(false)
            } else {
              onNav({
                view: 'runSetup',
                skillId: skill.id,
                demonstrated: demonstratedInputs(proposal.demonstrated)
              })
            }
          })
      })
      .catch((err: unknown) => {
        setError(friendlyError(err))
        setBusy(false)
      })
  }

  return (
    <div>
      <section className="card" aria-label="Learned procedure">
        {phase === 'generating' && (
          <p className="muted" role="status" data-testid="review-generating">
            {scriptedId ? 'Loading the curated script…' : 'Learning the procedure from your demonstration…'}
          </p>
        )}
        {phase === 'failed' && (
          <div>
            <p className="alert-error" role="alert">
              {error ?? 'Could not learn a procedure from this demonstration.'}
            </p>
            <div className="field">
              <Button data-testid="review-retry" onClick={generate}>
                Try again
              </Button>
            </div>
          </div>
        )}
        {savedMatch !== null && (
          <div data-semid="review-saved-match">
            <h2>Saved. This already matches open work.</h2>
            <p className="muted">
              {savedMatch.count} open request{savedMatch.count === 1 ? '' : 's'} match this
              approach. Review them before anything runs.
            </p>
            <div className="teach-actions">
              <Button
                variant="primary"
                data-semid="review-matching-requests"
                onClick={() => onNav({ view: 'workItem', opportunityId: savedMatch.id })}
              >
                Review matching requests
              </Button>
              <Button
                data-semid="review-run-once"
                onClick={() =>
                  onNav({
                    view: 'runSetup',
                    skillId: savedMatch.skillId,
                    demonstrated: proposal ? demonstratedInputs(proposal.demonstrated) : undefined
                  })
                }
              >
                Run it once instead
              </Button>
            </div>
          </div>
        )}
        {phase === 'ready' && proposal !== null && savedMatch === null && (
          <div>
            <p className="stage-steps" aria-label="Teaching progress">
              <span>1 · Show Muse</span>
              <span aria-hidden="true">→</span>
              <span className="stage-current">2 · Check my understanding</span>
              <span aria-hidden="true">→</span>
              <span>3 · Ready to use</span>
            </p>
            <h2>Here is what Muse learned</h2>
            <ol className="steps-plain" data-testid="review-steps" data-semid="review-steps">
              {proposal.recipe.steps.map((step, index) => (
                <li key={step.id}>
                  <strong>
                    {index + 1}. {stepLabel(step)}
                  </strong>
                  {step.kind === 'review' && (
                    <span className="muted"> — needs your review on each run</span>
                  )}
                  {step.why && <div className="muted">{step.why}</div>}
                  {step.kind === 'decide' && step.rules && (
                    <RulesCard rules={step.rules} options={step.options} />
                  )}
                </li>
              ))}
            </ol>
            {bindingSentences(proposal.demonstrated).length > 0 && (
              <ul className="binding-lines" data-testid="review-bindings">
                {bindingSentences(proposal.demonstrated).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {proposal.unresolved.length > 0 && (
              <ul className="callout-list" data-testid="review-unresolved">
                {proposal.unresolved.map((item) => (
                  <li key={item} className="alert-warn">
                    {item}
                  </li>
                ))}
              </ul>
            )}
            <div className="teach-field">
              <label htmlFor="skill-name">Skill name</label>
              <input
                id="skill-name"
                className="teach-input"
                data-testid="skill-name"
                data-semid="skill-name"
                type="text"
                value={skillName}
                onChange={(event) => setSkillName(event.target.value)}
              />
            </div>
            {error !== null && (
              <p className="alert-error" role="alert">
                {error}
              </p>
            )}
            <div className="field">
              <Button
                variant="primary"
                data-testid="review-save-publish"
                data-semid="save-publish"
                disabled={busy}
                onClick={() => save(true)}
              >
                {busy ? 'Saving…' : 'Save approach'}
              </Button>
              <button
                type="button"
                className="btn-link"
                data-testid="review-save-draft"
                data-semid="save-draft"
                disabled={busy}
                onClick={() => save(false)}
              >
                Save as draft
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
