import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { RecorderStatePush, RunProgress } from '../../../shared/schemas'
import '../styles.css'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { friendlyError } from '../lib/errors'
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
  home: 'Ghost Operator',
  teach: 'Teach a task',
  recording: 'Recording',
  review: 'Review what Ghost learned',
  runSetup: 'Run a skill',
  running: 'Running',
  result: 'Run result',
  library: 'Library',
  settings: 'Settings'
}

function PanelApp(): React.JSX.Element {
  const [nav, setNav] = useState<PanelNav>({ view: 'home' })
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
    if (
      !terminal &&
      (was === null || wasTerminal || wasId !== progress.runId) &&
      (view === 'home' || view === 'runSetup')
    ) {
      setNav({ view: 'running', runId: progress.runId })
    } else if (terminal && !wasTerminal && wasId === progress.runId && view === 'running') {
      setNav({ view: 'result', runId: progress.runId })
    }
  }, [progress])

  useEffect(() => {
    window.ghost.panel
      .setLayout(nav.view === 'library' ? 'expanded' : 'docked')
      .catch(() => undefined)
  }, [nav.view])

  const onNav = (next: PanelNav): void => setNav(next)

  return (
    <main className="panel-root">
      <header className="panel-header">
        {nav.view !== 'home' ? (
          <button
            type="button"
            className="btn-link"
            data-testid="panel-back"
            data-semid="panel-back"
            onClick={() => setNav({ view: 'home' })}
          >
            ‹ Home
          </button>
        ) : (
          <span className="panel-brand" data-testid="panel-title" data-semid="panel-title">
            {TITLES[nav.view]}
          </span>
        )}
        {nav.view !== 'home' && (
          <span className="panel-brand" data-testid="panel-title" data-semid="panel-title">
            {TITLES[nav.view]}
          </span>
        )}
        <span className="panel-header-spacer" />
        {nav.view !== 'library' && (
          <button
            type="button"
            className="btn-link"
            data-testid="panel-library"
            data-semid="panel-library"
            onClick={() => setNav({ view: 'library', libraryTab: 'skills' })}
          >
            Library
          </button>
        )}
        {nav.view !== 'settings' && (
          <button
            type="button"
            className="btn-link"
            data-testid="panel-settings"
            data-semid="panel-settings"
            onClick={() => setNav({ view: 'settings' })}
          >
            Settings
          </button>
        )}
      </header>
      {bridgeError !== null && (
        <p className="alert-error" role="alert">
          Could not reach Ghost: {bridgeError}
        </p>
      )}
      <div className="panel-body">
        <ErrorBoundary>
        {nav.view === 'home' && <HomeView onNav={onNav} recorder={recorder} progress={progress} />}
        {nav.view === 'teach' && <TeachView onNav={onNav} initialGoal={nav.goal ?? ''} />}
        {nav.view === 'recording' && <RecordingView push={recorder} />}
        {nav.view === 'review' &&
          (nav.recordingId ? (
            <ReviewView onNav={onNav} recordingId={nav.recordingId} />
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
        {nav.view === 'library' && (
          <LibraryView tab={nav.libraryTab ?? 'skills'} focusId={nav.focusId} />
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
