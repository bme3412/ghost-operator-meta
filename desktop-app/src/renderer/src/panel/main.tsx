import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { RecorderStatePush, RunProgress } from '../../../shared/schemas'
import '../styles.css'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { friendlyError } from '../lib/errors'
import { BatchView } from './views/BatchView'
import { WorkItemView } from './views/WorkItemView'
import { HomeView } from './views/HomeView'
import { LibraryView } from './views/LibraryView'
import { RecordingView } from './views/RecordingView'
import { ResultView } from './views/ResultView'
import { ReviewView } from './views/ReviewView'
import { RunSetupView } from './views/RunSetupView'
import { RunningView } from './views/RunningView'
import { SettingsView } from './views/SettingsView'
import { TeachView } from './views/TeachView'
import { TERMINAL_RUN, type PanelNav, type PanelView } from './nav'

const TITLES: Record<PanelView, string> = {
  home: 'Muse',
  teach: 'Teach Muse',
  recording: 'Muse is watching',
  review: 'What Muse learned',
  runSetup: 'Run a playbook',
  running: 'Muse is working',
  result: 'Work report',
  batch: 'Work report',
  library: 'Playbook',
  workItem: 'Review work',
  settings: 'Settings'
}

/** Heading for a nav destination (used by the contextual back label). */
function titleFor(nav: PanelNav): string {
  if (nav.view === 'home') return 'Today'
  if (nav.view === 'library') return nav.libraryTab === 'runs' ? 'Activity' : 'Playbook'
  return TITLES[nav.view]
}

/** Which primary tab a view belongs to. */
function tabFor(nav: PanelNav): 'today' | 'playbook' | 'activity' {
  if (nav.view === 'library') {
    if (nav.libraryTab === 'runs') return 'activity'
    return 'playbook'
  }
  if (nav.view === 'settings') return 'today'
  return 'today'
}

function PanelApp(): React.JSX.Element {
  const [nav, setNav] = useState<PanelNav>({ view: 'home' })
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    const check = (): void => {
      window.ghost.target
        .getStatus()
        .then((status) => setConnected(status.reachable))
        .catch(() => setConnected(false))
    }
    check()
    const timer = window.setInterval(check, 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const [recorder, setRecorder] = useState<RecorderStatePush | null>(null)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [bridgeError, setBridgeError] = useState<string | null>(null)
  const navRef = useRef(nav)
  navRef.current = nav

  useEffect(() => {
    window.ghost.recorder
      .getState()
      .then(setRecorder)
      .catch((err: unknown) => setBridgeError(friendlyError(err)))
    return window.ghost.recorder.onState(setRecorder)
  }, [])

  useEffect(() => {
    window.ghost.runs
      .getState()
      .then(setProgress)
      .catch((err: unknown) => setBridgeError(friendlyError(err)))
    return window.ghost.runs.onProgress(setProgress)
  }, [])

  useEffect(() => window.ghost.panel.onNavigate((params) => setNav({ ...params })), [])

  // The view follows live recorder/runner state, but only on status edges:
  // switching on every push would yank Back-to-Home straight back while a
  // recording or run keeps emitting. Explicit navigation wins everywhere
  // else (review, result, library, settings).
  const prevRecorderStatus = useRef<string | null>(null)
  const prevRunStatus = useRef<string | null>(null)
  const prevRunId = useRef<string | null>(null)
  useEffect(() => {
    if (!recorder) return
    const was = prevRecorderStatus.current
    prevRecorderStatus.current = recorder.status
    const active = recorder.status !== 'idle'
    const view = navRef.current.view
    if (active && (was === 'idle' || was === null) && (view === 'home' || view === 'teach')) {
      setNav({ view: 'recording' })
    } else if (!active && was !== null && was !== 'idle' && view === 'recording') {
      // Cancel lands home; finish navigates to review from the main process.
      setNav({ view: 'home' })
    }
  }, [recorder])

  useEffect(() => {
    if (!progress) return
    const was = prevRunStatus.current
    const wasId = prevRunId.current
    prevRunStatus.current = progress.status
    prevRunId.current = progress.runId
    const terminal = TERMINAL_RUN.has(progress.status)
    const wasTerminal = was !== null && TERMINAL_RUN.has(was)
    const view = navRef.current.view
    // Batch runs chain one case after another: stay on the running view
    // between cases, and let main navigate to the batch summary at the end.
    const followViews = progress.batch ? ['home', 'runSetup', 'running', 'result'] : ['home', 'runSetup']
    if (
      !terminal &&
      (was === null || wasTerminal || wasId !== progress.runId) &&
      followViews.includes(view)
    ) {
      setNav({ view: 'running', runId: progress.runId })
    } else if (
      terminal &&
      !progress.batch &&
      !wasTerminal &&
      wasId === progress.runId &&
      view === 'running'
    ) {
      setNav({ view: 'result', runId: progress.runId })
    }
  }, [progress])

  // The panel never auto-expands: Playbook and Activity live at docked
  // width like everything else.
  const [history, setHistory] = useState<PanelNav[]>([])
  const onNav = (next: PanelNav): void => {
    // Capture the view being left from this render's state, not the ref:
    // updater functions may run after navRef has already moved on.
    const leaving = nav
    setHistory((stack) => [...stack.slice(-9), leaving])
    setNav(next)
  }
  const backTarget: PanelNav = history[history.length - 1] ?? { view: 'home' }
  const goBack = (): void => {
    setHistory((stack) => stack.slice(0, -1))
    setNav(backTarget)
  }
  const [overflowOpen, setOverflowOpen] = useState(false)
  const activeTab = tabFor(nav)

  return (
    <main className="panel-root">
      <header className="panel-header">
        <span className="panel-brand" data-testid="panel-title" data-semid="panel-title">
          Muse
          <span className="panel-subbrand" role="status" data-semid="home-target-status">
            Saltbreak Surf Co. ·{' '}
            <span className={`dot${connected ? ' dot-ok' : ''}`} aria-hidden="true" />
            <span>{connected ? 'Connected' : 'Saltbreak unreachable'}</span>
          </span>
        </span>
        <span className="panel-header-spacer" />
        <span className="overflow-wrap">
          <button
            type="button"
            className="btn-link"
            aria-label="More options"
            data-semid="nav-overflow"
            onClick={() => setOverflowOpen((open) => !open)}
          >
            ⋯
          </button>
          {overflowOpen && (
            <span className="overflow-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                data-testid="panel-settings"
                data-semid="panel-settings"
                onClick={() => {
                  setOverflowOpen(false)
                  onNav({ view: 'settings' })
                }}
              >
                Settings
              </button>
              <button
                type="button"
                role="menuitem"
                data-semid="nav-show-website"
                onClick={() => {
                  setOverflowOpen(false)
                  window.ghost.target.show().catch(() => undefined)
                }}
              >
                Show Saltbreak
              </button>
            </span>
          )}
        </span>
      </header>
      <nav className="panel-tabs" aria-label="Muse sections">
        <button
          type="button"
          className={`panel-tab${activeTab === 'today' ? ' selected' : ''}`}
          data-semid="nav-today"
          onClick={() => onNav({ view: 'home' })}
        >
          Today
        </button>
        <button
          type="button"
          className={`panel-tab${activeTab === 'playbook' ? ' selected' : ''}`}
          data-testid="panel-library"
          data-semid="nav-playbook"
          onClick={() => onNav({ view: 'library', libraryTab: 'skills' })}
        >
          Playbook
        </button>
        <button
          type="button"
          className={`panel-tab${activeTab === 'activity' ? ' selected' : ''}`}
          data-semid="nav-activity"
          onClick={() => onNav({ view: 'library', libraryTab: 'runs' })}
        >
          Activity
        </button>
      </nav>
      {bridgeError !== null && (
        <p className="alert-error" role="alert">
          Could not reach Muse: {bridgeError}
        </p>
      )}
      <div className="panel-body">
        {nav.view !== 'home' && (
          <div className="view-head">
            <button
              type="button"
              className="btn-link"
              data-testid="panel-back"
              data-semid="panel-back"
              onClick={goBack}
            >
              ‹ {titleFor(backTarget)}
            </button>
            <h1 className="view-title">{titleFor(nav)}</h1>
          </div>
        )}
        <ErrorBoundary>
        {nav.view === 'home' && <HomeView onNav={onNav} recorder={recorder} progress={progress} />}
        {nav.view === 'teach' && (
          <TeachView
            onNav={onNav}
            initialGoal={nav.goal ?? ''}
            initialExample={nav.example ?? ''}
            updateSkillId={nav.updateSkillId}
          />
        )}
        {nav.view === 'recording' && <RecordingView push={recorder} />}
        {nav.view === 'review' &&
          (nav.recordingId ? (
            <ReviewView onNav={onNav} recordingId={nav.recordingId} />
          ) : nav.scriptedId ? (
            <ReviewView onNav={onNav} scriptedId={nav.scriptedId} scriptName={nav.scriptName} />
          ) : (
            <HomeView onNav={onNav} recorder={recorder} progress={progress} />
          ))}
        {nav.view === 'runSetup' && (
          <RunSetupView onNav={onNav} skillId={nav.skillId} demonstrated={nav.demonstrated} />
        )}
        {nav.view === 'running' && <RunningView onNav={onNav} progress={progress} />}
        {nav.view === 'result' &&
          (nav.runId ? (
            <ResultView onNav={onNav} runId={nav.runId} />
          ) : (
            <HomeView onNav={onNav} recorder={recorder} progress={progress} />
          ))}
        {nav.view === 'batch' &&
          (nav.batchId ? (
            <BatchView onNav={onNav} batchId={nav.batchId} />
          ) : (
            <HomeView onNav={onNav} recorder={recorder} progress={progress} />
          ))}
        {nav.view === 'library' && (
          <LibraryView
            tab={nav.libraryTab ?? 'skills'}
            focusId={nav.focusId}
            focusSkillId={nav.focusSkillId}
            onNav={onNav}
          />
        )}
        {nav.view === 'workItem' && nav.opportunityId && (
          <WorkItemView onNav={onNav} opportunityId={nav.opportunityId} />
        )}
        {nav.view === 'settings' && <SettingsView />}
        </ErrorBoundary>
      </div>
    </main>
  )
}

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <PanelApp />
    </StrictMode>
  )
}
