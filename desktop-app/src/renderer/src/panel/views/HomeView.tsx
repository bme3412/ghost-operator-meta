import { useCallback, useEffect, useState } from 'react'
import type { RecorderStatePush, RunProgress, SkillSummary } from '../../../../shared/schemas'
import type { TargetStatus } from '../../../../shared/target'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'
import { publishedSkillForStarter } from '../../lib/starters'
import { TERMINAL_RUN, type OnNav } from '../nav'
import { PageIdeas } from '../PageIdeas'

const SETUP_COMMANDS = ['cd web-app', 'pnpm install', 'pnpm db:seed', 'pnpm dev:saltbreak'].join('\n')

export function HomeView({
  onNav,
  recorder,
  progress
}: {
  onNav: OnNav
  recorder: RecorderStatePush | null
  progress: RunProgress | null
}): React.JSX.Element {
  const [status, setStatus] = useState<TargetStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [skillsLoaded, setSkillsLoaded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(() => {
    window.ghost.target
      .getStatus()
      .then((next) => {
        setStatus(next)
        setStatusError(null)
      })
      .catch((err: unknown) => setStatusError(friendlyError(err)))
  }, [])

  const refreshSkills = useCallback(() => {
    window.ghost.skills
      .list()
      .then((skillRows) => {
        setSkills(skillRows.filter((row) => row.activeVersion !== null))
        setSkillsLoaded(true)
      })
      .catch((err: unknown) => {
        setError(friendlyError(err))
        setSkillsLoaded(true)
      })
  }, [])

  useEffect(() => {
    refreshStatus()
    refreshSkills()
    return window.ghost.library.onChanged(() => {
      refreshStatus()
      refreshSkills()
    })
  }, [refreshStatus, refreshSkills])

  // While the target is down, keep checking so starting Saltbreak turns the
  // status green without a manual retry. Stops as soon as it is reachable.
  useEffect(() => {
    if (status?.reachable !== false) return
    const timer = window.setInterval(refreshStatus, 5000)
    return () => window.clearInterval(timer)
  }, [status?.reachable, refreshStatus])

  const copySetup = (): void => {
    const done = (): void => {
      setCopied(true)
      setCopyFailed(false)
      window.setTimeout(() => setCopied(false), 2000)
    }
    const failed = (): void => setCopyFailed(true)
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(SETUP_COMMANDS).then(done).catch(failed)
    } else {
      failed()
    }
  }

  const showWebsite = (): void => {
    window.ghost.target.show().catch((err: unknown) => setError(friendlyError(err)))
  }

  const reachable = status?.reachable === true
  const recording = recorder !== null && recorder.status !== 'idle'
  const running = progress !== null && !TERMINAL_RUN.has(progress.status)

  return (
    <div>
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {recording && (
        <p className="alert-warn" role="status">
          Recording in progress —{' '}
          <Button data-semid="home-return-recording" onClick={() => onNav({ view: 'recording' })}>
            Return to recording
          </Button>
        </p>
      )}
      {running && progress !== null && (
        <p className="alert-warn" role="status">
          {progress.skillName} is running —{' '}
          <Button
            data-semid="home-return-run"
            onClick={() => onNav({ view: 'running', runId: progress.runId })}
          >
            View run
          </Button>
        </p>
      )}

      {reachable && status !== null ? (
        <p role="status" data-semid="home-target-status">
          <span className="dot dot-ok" aria-hidden="true" /> Connected to{' '}
          <strong>{status.name}</strong>
        </p>
      ) : (
        <section className="card" aria-label="Target status">
          {status === null && statusError === null && <p className="muted">Checking target…</p>}
          {statusError !== null && (
            <p className="alert-error" role="alert">
              {statusError}
            </p>
          )}
          {status !== null && (
            <p role="status" data-semid="home-target-status">
              <span className="dot" aria-hidden="true" /> <strong>{status.name}</strong> is
              unreachable at <span className="muted">{status.url}</span>
            </p>
          )}
          <div>
            <p className="muted">Run Saltbreak alongside Ghost Operator:</p>
            <pre className="code-block" data-semid="home-setup-commands">
              {SETUP_COMMANDS}
            </pre>
            <div className="field">
              <Button data-semid="home-copy-setup" onClick={copySetup}>
                {copied ? 'Copied' : 'Copy commands'}
              </Button>
              <Button data-semid="home-retry-target" onClick={refreshStatus}>
                Retry
              </Button>
              <Button data-semid="home-show-target" onClick={showWebsite}>
                Show website
              </Button>
            </div>
            {copyFailed && (
              <p className="teach-hint" role="alert">
                Copy failed — select the commands above manually.
              </p>
            )}
          </div>
        </section>
      )}

      <div className="field">
        <Button
          variant="primary"
          data-testid="panel-teach"
          data-semid="teach"
          onClick={() => onNav({ view: 'teach' })}
        >
          Teach a new task
        </Button>
      </div>
      {skillsLoaded && skills.length === 0 && (
        <p className="muted" data-semid="home-empty-hint">
          Show Ghost a task once, then reuse it.
        </p>
      )}

      {skills.length > 0 && (
        <section className="card" aria-label="Skills">
          <h2>Your skills</h2>
          <ul className="skill-cards" data-semid="home-skills">
            {skills.map((row) => (
              <li key={row.id} className="skill-card" data-semid={`home-skill-${row.id}`}>
                <div>
                  <strong>{row.name}</strong>
                </div>
                <Button
                  variant="primary"
                  data-semid={`home-run-${row.id}`}
                  onClick={() => onNav({ view: 'runSetup', skillId: row.id })}
                >
                  Run
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PageIdeas
        onTeach={(idea) => onNav({ view: 'teach', goal: idea.title, example: idea.exampleInput })}
        onStarter={(task) => {
          // Already published (seeded or taught): run it; don't teach a copy.
          const existing = publishedSkillForStarter(skills, task)
          if (existing) {
            onNav({ view: 'runSetup', skillId: existing.id, demonstrated: task.exampleInputs })
          } else {
            onNav({ view: 'review', scriptedId: task.id, scriptName: task.title })
          }
        }}
      />
    </div>
  )
}
