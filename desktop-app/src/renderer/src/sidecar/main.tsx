import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type {
  ProviderId,
  RunMode,
  RunProgress,
  Skill,
  SkillSummary
} from '../../../shared/schemas'
import { isUnfamiliarSiteId } from '../../../shared/capture/sites'
import { TARGET } from '../../../shared/target'
import { Button } from '../components/Button'
import '../styles.css'

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled'])

/** Input keys a recipe needs, scanned from {{inputs.*}} placeholders. */
function collectInputs(skill: Skill | null): string[] {
  if (!skill || skill.activeVersion === null) return []
  const record = skill.versions.find((v) => v.version === skill.activeVersion)
  if (!record) return []
  const haystack = JSON.stringify({
    bindings: record.recipe.steps.map((s) => s.bindings),
    checks: record.recipe.steps.map((s) => s.checks)
  })
  const keys = new Set<string>()
  for (const match of haystack.matchAll(/\{\{\s*(?:inputs\.)?([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (match[1]) keys.add(match[1])
  }
  return [...keys]
}

function StartPanel({ onStarted }: { onStarted: () => void }): React.JSX.Element {
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [skillId, setSkillId] = useState('')
  const [skill, setSkill] = useState<Skill | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Current target site. undefined while loading; a failed lookup leaves it
  // undefined (no banner) rather than blocking the start panel.
  const [siteId, setSiteId] = useState<string | undefined>(undefined)

  useEffect(() => {
    const load = (): void => {
      window.ghost.skills
        .list()
        .then((rows) => {
          const published = rows.filter((row) => row.activeVersion !== null)
          setSkills(published)
          setSkillId((current) => {
            if (current && published.some((row) => row.id === current)) return current
            return published[0]?.id || ''
          })
        })
        .catch((err: unknown) => setError(String(err)))
    }
    load()
    window.ghost.target
      .getInfo()
      .then((info) => setSiteId(info.id))
      .catch(() => undefined)
    return window.ghost.library.onChanged(load)
  }, [])

  useEffect(() => {
    setSkill(null)
    setInputs({})
    if (!skillId) return
    window.ghost.skills
      .get(skillId)
      .then(setSkill)
      .catch((err: unknown) => setError(String(err)))
  }, [skillId])

  const needed = collectInputs(skill)
  const ready = skillId !== '' && needed.every((key) => (inputs[key] ?? '').trim() !== '')
  const unfamiliar = siteId !== undefined && isUnfamiliarSiteId(siteId)

  const start = (mode: RunMode): void => {
    if (!ready) return
    if (
      mode === 'assisted' &&
      unfamiliar &&
      !window.confirm(
        'This site is unfamiliar — assisted runs act on their own. Start an assisted run anyway?'
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    window.ghost.runs
      .start({ skillId, mode, inputs })
      .then(() => onStarted())
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setBusy(false))
  }

  const guideRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (unfamiliar) guideRef.current?.focus()
  }, [unfamiliar])

  return (
    <div className="card" data-semid="run-start-panel">
      <h2>Reuse a skill</h2>
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {unfamiliar && (
        <p className="alert-warn" role="status" data-semid="unfamiliar-site-banner">
          Unfamiliar site — guided mode recommended: you confirm each step.
        </p>
      )}
      <div className="field">
        <label htmlFor="run-skill">Procedure</label>
        <select
          id="run-skill"
          data-semid="run-skill-select"
          value={skillId}
          onChange={(event) => setSkillId(event.target.value)}
        >
          {skills.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} (v{row.activeVersion}){row.siteId ? ` · ${row.siteId}` : ''}
            </option>
          ))}
        </select>
      </div>
      {needed.map((key) => (
        <div className="field" key={key}>
          <label htmlFor={`run-input-${key}`}>{key}</label>
          <input
            id={`run-input-${key}`}
            data-semid={`run-input-${key}`}
            type="text"
            value={inputs[key] ?? ''}
            placeholder={`e.g. ${key === 'ticketId' ? 'T-102' : 'value'}`}
            onChange={(event) => setInputs((current) => ({ ...current, [key]: event.target.value }))}
          />
        </div>
      ))}
      {skills.length === 0 && (
        <p className="alert-warn">No published skills yet. Teach and publish one first.</p>
      )}
      <div className="field">
        <Button
          ref={guideRef}
          variant="primary"
          data-semid="guide-me"
          disabled={busy || !ready}
          onClick={() => start('guide')}
        >
          Guide me
        </Button>
        <Button
          data-semid="assisted-run"
          disabled={busy || !ready}
          onClick={() => start('assisted')}
        >
          Assisted run
        </Button>
      </div>
    </div>
  )
}

function RunView({
  progress,
  onNewRun
}: {
  progress: RunProgress
  onNewRun: () => void
}): React.JSX.Element {
  const [compact, setCompact] = useState(false)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [providerId, setProviderId] = useState<ProviderId>('fixture')
  const providerTouched = useRef(false)
  const [skillSiteId, setSkillSiteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const done = TERMINAL.has(progress.status)
  const current = progress.current

  useEffect(() => {
    setExplanation(null)
  }, [progress.runId, current?.id])

  useEffect(() => {
    window.ghost.providers
      .getDefault()
      .then((next) => {
        if (!providerTouched.current) setProviderId(next)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    setSkillSiteId(null)
    window.ghost.skills
      .get(progress.skillId)
      .then((skill) => {
        const record = skill?.versions.find((v) => v.version === skill.activeVersion)
        setSkillSiteId(record?.recipe.allowedApplications[0] ?? null)
      })
      .catch(() => undefined)
  }, [progress.skillId])

  const run = (action: () => Promise<unknown>): void => {
    setError(null)
    action().catch((err: unknown) => setError(String(err)))
  }

  const explain = (): void => {
    run(() =>
      window.ghost.runs.explain(progress.runId, providerId).then((result) => {
        setExplanation(`[${result.providerId}] ${result.explanation}`)
      })
    )
  }

  return (
    <div>
      <div className="card" data-semid="run-header">
        <p className="muted">
          {progress.skillName} v{progress.skillVersion} · {progress.mode} · {progress.status}
        </p>
        <h2 data-semid="run-target">
          {progress.skillName} run
        </h2>
        {Object.keys(progress.inputs).length > 0 && (
          <p className="muted" data-semid="run-inputs">
            {Object.entries(progress.inputs)
              .map(([key, value]) => `${key}=${value}`)
              .join(' · ')}
          </p>
        )}
        {current && (
          <p className="muted" data-semid="run-progress">
            Step {current.index + 1} of {progress.steps.length}
          </p>
        )}
        <Button data-semid="sidecar-compact" onClick={() => setCompact((value) => !value)}>
          {compact ? 'Expand' : 'Compact'}
        </Button>
      </div>
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {progress.error && (
        <p className="alert-error" role="alert" data-semid="run-error">
          {progress.error}
        </p>
      )}
      {current && !done && (
        <section className="card sidecar-current" aria-label="Current step">
          <h3 data-semid="run-current-step">
            {current.id} [{current.kind}]
          </h3>
          {current.goal && <p>{current.goal}</p>}
          {current.why && (
            <p className="muted" data-semid="run-current-why">
              Why: {current.why}
            </p>
          )}
          {Object.keys(current.bindings).length > 0 && (
            <ul data-semid="run-current-inputs">
              {Object.entries(current.bindings).map(([name, view]) => (
                <li key={name}>
                  {name}: <strong>{view.value}</strong> <span className="muted">({view.path})</span>
                </li>
              ))}
            </ul>
          )}
          {current.expected && (
            <p className="muted" data-semid="run-current-expected">
              Expected: {current.expected}
            </p>
          )}
          {explanation && (
            <p data-semid="run-explanation">{explanation}</p>
          )}
          <div className="field">
            <Button
              data-semid="show-target"
              onClick={() => run(() => window.ghost.runs.showTarget(progress.runId))}
            >
              Show target
            </Button>
            <Button data-semid="explain-step" onClick={explain}>
              Explain step
            </Button>
            <select
              aria-label="Explanation provider"
              data-semid="explain-provider"
              value={providerId}
              onChange={(event) => {
                providerTouched.current = true
                setProviderId(event.target.value as ProviderId)
              }}
            >
              <option value="fixture">Fixture</option>
              <option value="meta">Meta</option>
            </select>
            {providerId === 'fixture' &&
              skillSiteId !== null &&
              skillSiteId !== TARGET.id && (
                <p className="muted" data-semid="fixture-site-hint">
                  Fixture is tuned for Saltbreak; set MODEL_API_KEY for general sites.
                </p>
              )}
          </div>
          <div className="field">
            {progress.status === 'running' && !progress.awaitingApproval && (
              <Button
                data-semid="run-pause"
                onClick={() => run(() => window.ghost.runs.pause(progress.runId))}
              >
                Pause
              </Button>
            )}
            {progress.status === 'paused' && !progress.awaitingApproval && (
              <Button
                variant="primary"
                data-semid="run-resume"
                onClick={() => run(() => window.ghost.runs.resume(progress.runId))}
              >
                Resume
              </Button>
            )}
            {progress.awaitingApproval && (
              <Button
                variant="primary"
                data-semid="run-approve"
                onClick={() => run(() => window.ghost.runs.approve(progress.runId))}
              >
                Approve & continue
              </Button>
            )}
            <Button
              data-semid="run-stop"
              onClick={() => run(() => window.ghost.runs.stop(progress.runId))}
            >
              Stop
            </Button>
          </div>
          {progress.mode === 'guide' && progress.status === 'running' && (
            <div className="field">
              <Button
                variant="primary"
                data-semid="run-next"
                onClick={() => run(() => window.ghost.runs.advance(progress.runId))}
              >
                Done — next step
              </Button>
              {current.kind === 'verify' && (
                <Button
                  data-semid="run-retry"
                  onClick={() => run(() => window.ghost.runs.retry(progress.runId))}
                >
                  Retry checks
                </Button>
              )}
            </div>
          )}
        </section>
      )}
      {!compact && progress.steps.length > 0 && (
        <section className="card" aria-label="Procedure">
          <h3>Procedure</h3>
          <ol className="sidecar-steps" data-semid="run-steps">
            {progress.steps.map((step) => (
              <li key={step.id}>
                {step.status === 'done' ? '✓' : step.status === 'current' ? '→' : '·'} {step.id}
              </li>
            ))}
          </ol>
        </section>
      )}
      {!compact && progress.checks.length > 0 && (
        <section className="card" aria-label="Checks">
          <h3>Checks</h3>
          <ul data-semid="run-checks">
            {progress.checks.map((check, index) => (
              <li key={`${check.check}-${index}`}>
                {check.passed ? '✓' : '✗'} {check.check} — {check.observed}
              </li>
            ))}
          </ul>
        </section>
      )}
      {done && (
        <div className="card">
          {progress.status === 'succeeded' ? (
            <p className="alert-success" role="status" data-semid="run-succeeded">
              Run succeeded. Business state verified.
            </p>
          ) : (
            <p className="alert-warn" role="status" data-semid="run-ended">
              Run {progress.status}.
            </p>
          )}
          <div className="field">
            <Button
              data-semid="run-show-studio"
              onClick={() => run(() => window.ghost.runs.showInStudio(progress.runId))}
            >
              View run in Studio
            </Button>
            <Button data-semid="run-new" onClick={onNewRun}>
              New run
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SidecarApp(): React.JSX.Element {
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [showStart, setShowStart] = useState(true)

  useEffect(() => {
    window.ghost.runs
      .getState()
      .then((next) => {
        setProgress(next)
        if (next && !TERMINAL.has(next.status)) setShowStart(false)
      })
      .catch(() => undefined)
    return window.ghost.runs.onProgress((next) => {
      setProgress(next)
      if (next && !TERMINAL.has(next.status)) setShowStart(false)
    })
  }, [])

  return (
    <main className="page">
      <header className="app-header">
        <h1 data-testid="sidecar-heading" data-semid="sidecar-title">
          Guide
        </h1>
      </header>
      {(showStart || !progress) && <StartPanel onStarted={() => setShowStart(false)} />}
      {!showStart && progress && <RunView progress={progress} onNewRun={() => setShowStart(true)} />}
    </main>
  )
}

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <SidecarApp />
    </StrictMode>
  )
}
