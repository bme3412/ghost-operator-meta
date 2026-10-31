import { useState } from 'react'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'
import type { OnNav } from '../nav'

export function TeachView({
  onNav,
  initialGoal
}: {
  onNav: OnNav
  initialGoal: string
}): React.JSX.Element {
  const [goal, setGoal] = useState(initialGoal)
  const [caseInput, setCaseInput] = useState('')
  const [goalHint, setGoalHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const start = (): void => {
    const trimmedGoal = goal.trim()
    if (!trimmedGoal) {
      setGoalHint('Describe the goal — e.g. Resolve support ticket T-101.')
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
        <h2>What should Ghost learn?</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            start()
          }}
        >
          <div className="teach-field">
            <label htmlFor="teach-goal">Goal</label>
            <input
              id="teach-goal"
              className="teach-input"
              data-testid="teach-goal"
              data-semid="teach-goal"
              type="text"
              autoFocus
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value)
                if (goalHint !== null) setGoalHint(null)
              }}
              placeholder="e.g. Resolve support ticket T-101"
            />
            {goalHint !== null && (
              <p className="teach-hint" role="alert" data-testid="teach-goal-hint">
                {goalHint}
              </p>
            )}
          </div>
          <details className="disclosure">
            <summary>More options</summary>
            <div className="teach-field">
              <label htmlFor="teach-case">Example record (optional)</label>
              <input
                id="teach-case"
                className="teach-input"
                data-testid="teach-case"
                data-semid="teach-case"
                type="text"
                value={caseInput}
                onChange={(event) => setCaseInput(event.target.value)}
                placeholder="e.g. T-101"
              />
              <p className="muted">
                The record you demonstrate on. Ghost learns to ask for a different one on each
                run.
              </p>
            </div>
          </details>
          {error !== null && (
            <p className="alert-error" role="alert">
              {error}
            </p>
          )}
          <div className="field">
            <Button
              variant="primary"
              data-testid="teach-start"
              data-semid="teach-start"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Starting…' : 'Start demonstrating'}
            </Button>
            <Button data-testid="teach-cancel" type="button" onClick={() => onNav({ view: 'home' })}>
              Cancel
            </Button>
          </div>
        </form>
      </section>
      <p className="muted">
        Ghost records your clicks and typing in the website. Demonstrate the task once, add a
        note where you make a judgment call, then finish.
      </p>
    </div>
  )
}
