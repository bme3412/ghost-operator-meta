import { useEffect, useState } from 'react'
import type { ProviderId, RunProgress } from '../../../../shared/schemas'
import { Button } from '../../components/Button'
import { DecisionList, RulesCard } from '../../components/Decisions'
import { friendlyError } from '../../lib/errors'
import { checkLabel, humanizeKey, stepLabel } from '../../lib/humanize'
import { TERMINAL_RUN, type OnNav } from '../nav'

/** Run-input bindings only (inputs.*), humanized; replay internals stay hidden. */
function inputBindings(
  bindings: Record<string, { path: string; value: string }>
): Array<{ key: string; value: string }> {
  return Object.values(bindings)
    .filter((view) => view.path.startsWith('inputs.'))
    .map((view) => ({ key: humanizeKey(view.path.replace(/^inputs\./, '')), value: view.value }))
}

export function RunningView({
  onNav,
  progress
}: {
  onNav: OnNav
  progress: RunProgress | null
}): React.JSX.Element {
  const [explanation, setExplanation] = useState<string | null>(null)
  const [providerId, setProviderId] = useState<ProviderId>('fixture')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setExplanation(null)
  }, [progress?.runId, progress?.current?.id])

  useEffect(() => {
    window.ghost.providers
      .getDefault()
      .then(setProviderId)
      .catch(() => undefined)
  }, [])

  if (!progress || TERMINAL_RUN.has(progress.status)) {
    return <p className="muted">No run in progress.</p>
  }

  const current = progress.current
  const guide = progress.mode === 'guide'

  const run = (action: () => Promise<unknown>): void => {
    setError(null)
    action().catch((err: unknown) => setError(friendlyError(err)))
  }

  const explain = (): void => {
    run(() =>
      window.ghost.runs.explain(progress.runId, providerId).then((result) => {
        setExplanation(result.explanation)
      })
    )
  }

  return (
    <div>
      <section className="card" aria-label="Run status">
        <p className="muted">
          {progress.skillName} v{progress.skillVersion} ·{' '}
          {guide ? 'Guide me' : 'Do it for me'} · {progress.status}
        </p>
        {progress.batch && (
          <p className="muted" data-semid="run-batch-progress">
            Case {progress.batch.index + 1} of {progress.batch.total}
            {progress.inputs['ticketId'] ? ` · ${progress.inputs['ticketId']}` : ''} ·{' '}
            <button
              type="button"
              className="btn-link"
              data-semid="run-batch-open"
              onClick={() => onNav({ view: 'batch', batchId: progress.batch!.id })}
            >
              See all cases
            </button>
          </p>
        )}
        {current && (
          <p className="muted" data-semid="run-progress">
            Step {current.index + 1} of {progress.steps.length}
          </p>
        )}
      </section>
      {progress.decisions.length > 0 && (
        <section className="card" aria-label="Ghost's decision">
          <h2>Ghost's decision</h2>
          <DecisionList decisions={progress.decisions} />
        </section>
      )}
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {progress.error && (
        <p className="alert-error" role="alert" data-semid="run-error">
          {friendlyError(progress.error)}
        </p>
      )}
      {current && (
        <section className="card" aria-label="Current step">
          <h2 data-testid="run-current-step" data-semid="run-current-step">
            {stepLabel(current)}
          </h2>
          {current.why && <p className="muted">Why: {current.why}</p>}
          {inputBindings(current.bindings).length > 0 && (
            <ul data-semid="run-current-inputs">
              {inputBindings(current.bindings).map((entry) => (
                <li key={entry.key}>
                  {entry.key}: <strong>{entry.value}</strong>
                </li>
              ))}
            </ul>
          )}
          {current.kind === 'decide' && current.rules && (
            <RulesCard rules={current.rules} options={current.options} />
          )}
          {current.expected && <p className="muted">Expected: {current.expected}</p>}
          {explanation && <p data-semid="run-explanation">{explanation}</p>}
          <div className="field">
            {progress.awaitingApproval && (
              <Button
                variant="primary"
                data-testid="run-approve"
                data-semid="run-approve"
                onClick={() => run(() => window.ghost.runs.approve(progress.runId))}
              >
                Approve & continue
              </Button>
            )}
            {!progress.awaitingApproval && guide && progress.status === 'running' && (
              <Button
                variant="primary"
                data-testid="run-next"
                data-semid="run-next"
                onClick={() => run(() => window.ghost.runs.advance(progress.runId))}
              >
                {current.kind === 'decide' ? 'Let Ghost decide' : 'Done — next step'}
              </Button>
            )}
            {!progress.awaitingApproval && progress.status === 'paused' && (
              <Button
                variant="primary"
                data-testid="run-resume"
                data-semid="run-resume"
                onClick={() => run(() => window.ghost.runs.resume(progress.runId))}
              >
                Resume
              </Button>
            )}
            {!progress.awaitingApproval && !guide && progress.status === 'running' && (
              <Button
                data-testid="run-pause"
                data-semid="run-pause"
                onClick={() => run(() => window.ghost.runs.pause(progress.runId))}
              >
                Pause
              </Button>
            )}
            {guide && current.kind === 'verify' && progress.status === 'running' && (
              <Button
                data-testid="run-retry"
                data-semid="run-retry"
                onClick={() => run(() => window.ghost.runs.retry(progress.runId))}
              >
                Retry checks
              </Button>
            )}
          </div>
          <div className="field">
            <Button
              data-testid="run-stop"
              data-semid="run-stop"
              onClick={() => run(() => window.ghost.runs.stop(progress.runId))}
            >
              Stop
            </Button>
            <Button
              data-testid="run-show-target"
              data-semid="show-target"
              onClick={() => run(() => window.ghost.runs.showTarget(progress.runId))}
            >
              Show website
            </Button>
            <button
              type="button"
              className="btn-link"
              data-testid="explain-step"
              data-semid="explain-step"
              onClick={explain}
            >
              Explain this step
            </button>
          </div>
        </section>
      )}
      {progress.steps.length > 0 && (
        <section className="card" aria-label="Procedure">
          <h2>Steps</h2>
          <ol className="sidecar-steps" data-semid="run-steps">
            {progress.steps.map((step) => (
              <li key={step.id}>
                {step.status === 'done' ? '✓' : step.status === 'current' ? '→' : '·'}{' '}
                {stepLabel(step)}
              </li>
            ))}
          </ol>
        </section>
      )}
      {progress.checks.length > 0 && (
        <section className="card" aria-label="Checks">
          <h2>Checks</h2>
          <ul data-semid="run-checks">
            {progress.checks.map((check, index) => (
              <li key={`${check.check}-${index}`}>
                {check.passed ? '✓' : '✗'} {checkLabel(check.check)}{' '}
                <span className="muted">— {check.observed}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button data-semid="run-home" onClick={() => onNav({ view: 'home' })}>
        Back to Home
      </Button>
    </div>
  )
}
