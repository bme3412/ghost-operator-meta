import { useEffect, useRef, useState } from 'react'
import type { PageIdea, PageIdeasResult, SkillSummary } from '../../../../shared/schemas'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'
import { publishedSkillForStarter } from '../../lib/starters'
import type { OnNav } from '../nav'
import { PageIdeas } from '../PageIdeas'

export function TeachView({
  onNav,
  initialGoal,
  initialExample
}: {
  onNav: OnNav
  initialGoal: string
  initialExample: string
}): React.JSX.Element {
  const [goal, setGoal] = useState(initialGoal)
  const [caseInput, setCaseInput] = useState(initialExample)
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null)
  const [goalHint, setGoalHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [topIdea, setTopIdea] = useState<PageIdea | null>(null)
  const [published, setPublished] = useState<SkillSummary[]>([])
  const goalRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.ghost.target
      .getInfo()
      .then((info) => setSiteId(info.id))
      .catch(() => undefined)
    window.ghost.skills
      .list()
      .then((rows) => setPublished(rows.filter((row) => row.activeVersion !== null)))
      .catch(() => undefined)
  }, [])

  const saltbreak = siteId === 'saltbreak'
  const goalPlaceholder = saltbreak
    ? 'e.g. Resolve support ticket T-101'
    : topIdea
      ? `e.g. ${topIdea.title}`
      : 'e.g. Search the store and collect the top results'
  const casePlaceholder = saltbreak
    ? 'e.g. T-101'
    : topIdea?.exampleInput
      ? `e.g. ${topIdea.exampleInput}`
      : 'e.g. An example to demonstrate on'
  const emptyGoalHint = saltbreak
    ? 'Describe the goal — e.g. Resolve support ticket T-101.'
    : topIdea
      ? `Describe the goal — e.g. ${topIdea.title}.`
      : 'Describe the goal.'

  const teachIdea = (idea: PageIdea): void => {
    setGoal(idea.title)
    setCaseInput(idea.exampleInput ?? '')
    setSelected({ id: idea.id, title: idea.title })
    setGoalHint(null)
    // The form sits below the ideas: bring the prefilled goal into view so
    // the click visibly lands.
    goalRef.current?.scrollIntoView({ block: 'nearest' })
    goalRef.current?.focus({ preventScroll: true })
  }

  const handleGoalChange = (value: string): void => {
    setGoal(value)
    if (selected !== null && value !== selected.title) setSelected(null)
    if (goalHint !== null) setGoalHint(null)
  }

  const handleResult = (result: PageIdeasResult | null): void => {
    setTopIdea(result?.ideas[0] ?? null)
  }

  const start = (): void => {
    const trimmedGoal = goal.trim()
    if (!trimmedGoal) {
      setGoalHint(emptyGoalHint)
      return
    }
    setBusy(true)
    setError(null)
    const trimmedCase = caseInput.trim()
    window.ghost.recorder
      .start(trimmedGoal, trimmedCase === '' ? null : trimmedCase)
      .catch((err: unknown) => {
        setError(friendlyError(err))
        setBusy(false)
      })
    // The panel switches to the recording view from the state push.
  }

  return (
    <div>
      <section className="card" aria-label="Teach a task">
        <PageIdeas
          bare
          hint="Pick one, or write your own below."
          selectedId={selected?.id ?? null}
          onTeach={teachIdea}
          onResult={handleResult}
          onStarter={(task) => {
            const existing = publishedSkillForStarter(published, task)
            if (existing) {
              onNav({ view: 'runSetup', skillId: existing.id, demonstrated: task.exampleInputs })
            } else {
              onNav({ view: 'review', scriptedId: task.id, scriptName: task.title })
            }
          }}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            start()
          }}
        >
          <div className="teach-field">
            <label htmlFor="teach-goal">Goal</label>
            <textarea
              id="teach-goal"
              ref={goalRef}
              className="teach-input"
              data-testid="teach-goal"
              data-semid="teach-goal"
              rows={2}
              autoFocus
              value={goal}
              onChange={(event) => handleGoalChange(event.target.value)}
              placeholder={goalPlaceholder}
            />
            {goalHint !== null && (
              <p className="teach-hint" role="alert" data-testid="teach-goal-hint">
                {goalHint}
              </p>
            )}
          </div>
          <div className="teach-field">
            <label htmlFor="teach-case">Example to try (optional)</label>
            <input
              id="teach-case"
              className="teach-input"
              data-testid="teach-case"
              data-semid="teach-case"
              type="text"
              value={caseInput}
              onChange={(event) => setCaseInput(event.target.value)}
              placeholder={casePlaceholder}
            />
            <p className="muted">
              What you demonstrate on. Next time you run this, Ghost asks for a different one.
            </p>
          </div>
          {error !== null && (
            <p className="alert-error" role="alert">
              {error}
            </p>
          )}
          <p className="muted">
            You’ll do this once in the website. Ghost records the clicks. You can add a note while
            recording.
          </p>
          <div className="field">
            <Button
              variant="primary"
              data-testid="teach-start"
              data-semid="teach-start"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Starting…' : 'Start recording'}
            </Button>
            <Button data-testid="teach-cancel" type="button" onClick={() => onNav({ view: 'home' })}>
              Cancel
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
