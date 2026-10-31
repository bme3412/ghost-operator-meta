import { useCallback, useEffect, useState } from 'react'
import type {
  RecorderStatePush,
  RunProgress,
  RunRecord,
  SkillSummary,
  Suggestion
} from '../../../../shared/schemas'
import type { TargetStatus } from '../../../../shared/target'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'
import { TERMINAL_RUN, type OnNav } from '../nav'

const SETUP_COMMANDS = ['cd web-app', 'pnpm install', 'pnpm db:seed', 'pnpm dev:saltbreak'].join('\n')

interface ChecklistState {
  taught: boolean
  published: boolean
  ran: boolean
  loading: boolean
}

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
  const [checklist, setChecklist] = useState<ChecklistState>({
    taught: false,
    published: false,
    ran: false,
    loading: true
  })
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [listsLoaded, setListsLoaded] = useState(false)
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

  const refreshLibrary = useCallback(() => {
    Promise.all([
      window.ghost.recordings.list(),
      window.ghost.skills.list(),
      window.ghost.runs.list(),
      window.ghost.suggest.list()
    ])
      .then(([recordings, skillRows, runRows, suggestionRows]) => {
        const published = skillRows.filter((row) => row.activeVersion !== null)
        setSkills(published)
        setRuns(runRows)
        setSuggestions(suggestionRows.filter((row) => row.status === 'new').slice(0, 3))
        setListsLoaded(true)
        setChecklist({
          taught: recordings.length > 0,
          published: published.length > 0,
          ran: runRows.some((run) => run.status === 'succeeded'),
          loading: false
        })
      })
      .catch((err: unknown) => {
        setError(friendlyError(err))
        setListsLoaded(true)
        setChecklist((current) => ({ ...current, loading: false }))
      })
  }, [])

  useEffect(() => {
    refreshStatus()
    refreshLibrary()
    return window.ghost.library.onChanged(() => {
      refreshStatus()
      refreshLibrary()
    })
  }, [refreshStatus, refreshLibrary])

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

  const dismissSuggestion = (id: string): void => {
    window.ghost.suggest
      .dismiss(id)
      .then(refreshLibrary)
      .catch((err: unknown) => setError(friendlyError(err)))
  }

  const showWebsite = (): void => {
    window.ghost.target.show().catch((err: unknown) => setError(friendlyError(err)))
  }

  const reachable = status?.reachable === true
  const recording = recorder !== null && recorder.status !== 'idle'
  const running = progress !== null && !TERMINAL_RUN.has(progress.status)
  const skillNames = new Map(skills.map((row) => [row.id, row.name]))
  const recentRuns = runs.slice(-5).reverse()

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

      <section className="card" aria-label="Target status">
        {status === null && statusError === null && <p className="muted">Checking target…</p>}
        {statusError !== null && (
          <p className="alert-error" role="alert">
            {statusError}
          </p>
        )}
        {status !== null && (
          <p role="status" data-semid="home-target-status">
            <span className={`dot${reachable ? ' dot-ok' : ''}`} aria-hidden="true" />{' '}
            {reachable ? (
              <>
                Connected to <strong>{status.name}</strong>
              </>
            ) : (
              <>
                <strong>{status.name}</strong> is unreachable at{' '}
                <span className="muted">{status.url}</span>
              </>
            )}
          </p>
        )}
        {!reachable && (
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
        )}
      </section>

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

      <section className="card" aria-label="Skills">
        <h2>Skills</h2>
        {!listsLoaded && <p className="muted">Loading skills…</p>}
        {listsLoaded && skills.length === 0 && (
          <p className="muted">No skills yet — teach your first task above.</p>
        )}
        <ul className="skill-cards" data-semid="home-skills">
          {skills.map((row) => (
            <li key={row.id} className="skill-card" data-semid={`home-skill-${row.id}`}>
              <div>
                <strong>{row.name}</strong>
                <span className="muted">
                  {' '}
                  v{row.activeVersion}
                  {row.siteId ? ` · ${row.siteId}` : ''}
                </span>
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

      {suggestions.length > 0 && (
        <section className="card" aria-label="Suggestions">
          <h2>Suggested next tasks</h2>
          <ul className="suggestion-list" data-semid="home-suggestions">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} data-semid={`home-suggestion-${suggestion.id}`}>
                <strong>{suggestion.title}</strong>
                <p className="muted">{suggestion.why}</p>
                <div className="field">
                  <Button
                    data-semid={`home-suggestion-teach-${suggestion.id}`}
                    onClick={() =>
                      window.ghost.suggest
                        .accept(suggestion.id)
                        .then(refreshLibrary)
                        .catch((err: unknown) => setError(friendlyError(err)))
                    }
                  >
                    Teach this
                  </Button>
                  <Button
                    data-semid={`home-suggestion-dismiss-${suggestion.id}`}
                    onClick={() => dismissSuggestion(suggestion.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!checklist.loading && !checklist.ran && (
        <section className="card" aria-label="Getting started">
          <h2>Getting started</h2>
          <ul className="home-checklist" data-semid="home-checklist">
            <li>
              <span aria-hidden="true">{checklist.taught ? '✓' : '·'}</span>{' '}
              <strong>Teach a task</strong>
              <span className="muted"> — demonstrate the workflow once in the website.</span>
            </li>
            <li>
              <span aria-hidden="true">{checklist.published ? '✓' : '·'}</span>{' '}
              <strong>Review and publish</strong>
              <span className="muted"> — inspect what Ghost learned, then publish it.</span>
            </li>
            <li>
              <span aria-hidden="true">{checklist.ran ? '✓' : '·'}</span>{' '}
              <strong>Reuse on the next case</strong>
              <span className="muted"> — run it guided or let Ghost do it.</span>
            </li>
          </ul>
          <p className="muted">
            First demo to try: Staff → Support inbox in Saltbreak, resolve <code>T-101</code>,
            then reuse the skill on <code>T-102</code>.
          </p>
        </section>
      )}

      {recentRuns.length > 0 && (
        <section className="card" aria-label="Recent runs">
          <h2>Recent runs</h2>
          <ul className="run-list" data-semid="home-recent-runs">
            {recentRuns.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  className="btn-link"
                  data-semid={`home-run-record-${run.id}`}
                  onClick={() => onNav({ view: 'library', libraryTab: 'runs', focusId: run.id })}
                >
                  {skillNames.get(run.skillId) ?? run.skillId} v{run.skillVersion}
                </button>
                <span className="muted">
                  {' '}
                  · {run.mode} · {run.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
