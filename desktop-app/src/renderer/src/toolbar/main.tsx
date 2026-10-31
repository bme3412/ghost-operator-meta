import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { RecorderLastEvent, RecorderStatePush } from '../../../shared/schemas'
import { Button } from '../components/Button'
import '../styles.css'

const HEIGHT_IDLE = 64
const HEIGHT_IDLE_FOOTER = 104
const HEIGHT_TEACH = 400
const HEIGHT_ACTIVE = 216
const HEIGHT_ACTIVE_NOTE = 380

const NUDGE_TYPES: ReadonlySet<string> = new Set(['input_commit', 'select'])

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function eventKey(event: RecorderLastEvent): string {
  return `${event.atMs}:${event.type}:${event.label}`
}

interface FeedEntry {
  key: string
  label: string
}

function ToolbarApp(): React.JSX.Element {
  const [push, setPush] = useState<RecorderStatePush | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [targetName, setTargetName] = useState('target')
  const [targetUrl, setTargetUrl] = useState('')
  const [teachOpen, setTeachOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const [caseInput, setCaseInput] = useState('')
  const [goalHint, setGoalHint] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [urlBusy, setUrlBusy] = useState(false)
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [hasRecordings, setHasRecordings] = useState<boolean | null>(null)
  const [nudgeDismissedKey, setNudgeDismissedKey] = useState<string | null>(null)
  const receivedAt = useRef(Date.now())
  const recordingIdRef = useRef<string | null>(null)
  const activeRef = useRef(false)
  const targetUrlRef = useRef('')

  useEffect(() => {
    window.ghost.target
      .getInfo()
      .then((info) => {
        setTargetName(info.name)
        setTargetUrl(info.url)
        setUrlInput(info.url)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    window.ghost.recorder
      .getState()
      .then((state) => {
        receivedAt.current = Date.now()
        setPush(state)
      })
      .catch((err: unknown) => setError(String(err)))
    return window.ghost.recorder.onState((next) => {
      receivedAt.current = Date.now()
      setPush(next)
      setError(null)
    })
  }, [])

  useEffect(() => {
    if (push?.status !== 'recording') return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [push?.status])

  // First-run empty state: learn whether any recording exists yet.
  useEffect(() => {
    let cancelled = false
    const refresh = (): void => {
      window.ghost.recordings
        .list()
        .then((list) => {
          if (!cancelled) setHasRecordings(list.length > 0)
        })
        .catch(() => {
          if (!cancelled) setHasRecordings(null)
        })
    }
    refresh()
    const off = window.ghost.library.onChanged(refresh)
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const status = push?.status ?? 'idle'
  const recording = status === 'recording'
  const paused = status === 'paused'
  const active = recording || paused
  const lastEvent = push?.lastEvent
  const eventCount = push?.eventCount ?? 0

  // New recording sessions reset the local feed, nudge, and finish summary.
  useEffect(() => {
    const id = push?.recordingId ?? null
    if (id !== recordingIdRef.current) {
      recordingIdRef.current = id
      setFeed([])
      setNudgeDismissedKey(null)
      setConfirmCancel(false)
      if (id !== null) setSummary(null)
    }
  }, [push?.recordingId])

  // Accumulate the live capture feed from lastEvent pushes (no extra IPC).
  useEffect(() => {
    if (!lastEvent) return
    const key = eventKey(lastEvent)
    const label = lastEvent.label
    setFeed((prev) =>
      prev.some((entry) => entry.key === key)
        ? prev
        : [...prev.slice(-2), { key, label }]
    )
  }, [lastEvent])

  // Resize the toolbar window only when its visible mode changes.
  const showFooter = !active && !teachOpen && (summary !== null || hasRecordings === false)
  const mode = teachOpen
    ? 'teach'
    : noteOpen && active
      ? 'note'
      : active
        ? 'active'
        : showFooter
          ? 'footer'
          : 'idle'
  useEffect(() => {
    const height =
      mode === 'teach'
        ? HEIGHT_TEACH
        : mode === 'note'
          ? HEIGHT_ACTIVE_NOTE
          : mode === 'active'
            ? HEIGHT_ACTIVE
            : mode === 'footer'
              ? HEIGHT_IDLE_FOOTER
              : HEIGHT_IDLE
    void window.ghost.toolbar.setHeight(height)
  }, [mode])

  const elapsed =
    push === null
      ? 0
      : recording
        ? push.elapsedMs + (now - receivedAt.current)
        : push.elapsedMs

  const run = (action: () => Promise<unknown>): void => {
    setError(null)
    action().catch((err: unknown) => setError(String(err)))
  }

  const openTeach = (): void => {
    setGoal('')
    setCaseInput('')
    setGoalHint(null)
    setUrlInput(targetUrl)
    setUrlError(null)
    setTeachOpen(true)
  }
  const closeTeach = (): void => {
    setTeachOpen(false)
    setGoalHint(null)
  }
  // Site switching is idle-only: the Teach form unmounts while recording.
  const applyUrl = (): void => {
    const trimmed = urlInput.trim()
    if (!trimmed) {
      setUrlError('Enter a target URL — e.g. https://example.com.')
      return
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setUrlError('URL must start with http:// or https://.')
      return
    }
    setUrlBusy(true)
    setUrlError(null)
    window.ghost.target
      .setUrl(trimmed)
      .then((info) => {
        setTargetName(info.name)
        setTargetUrl(info.url)
        setUrlInput(info.url)
      })
      .catch((err: unknown) => {
        setUrlError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setUrlBusy(false))
  }
  const startTeaching = (): void => {
    const trimmedGoal = goal.trim()
    if (!trimmedGoal) {
      setGoalHint('Describe the goal — e.g. Refund order SB-1002.')
      return
    }
    const trimmedCase = caseInput.trim()
    run(() =>
      window.ghost.recorder.start(trimmedGoal, trimmedCase === '' ? null : trimmedCase).then(() => {
        closeTeach()
      })
    )
  }

  const openNote = (): void => {
    setNoteText('')
    setNoteOpen(true)
  }
  const closeNote = (): void => {
    setNoteOpen(false)
  }
  const saveNote = (): void => {
    run(() =>
      window.ghost.recorder.addNote(noteText).then(() => {
        closeNote()
      })
    )
  }

  const finishRecording = (): void => {
    run(() =>
      window.ghost.recorder.finish().then((recording) => {
        const count = recording.events.length
        setSummary(`Captured ${count} action${count === 1 ? '' : 's'} — review in Studio`)
      })
    )
  }

  const cancelRecording = (): void => {
    setConfirmCancel(false)
    setSummary(null)
    run(() => window.ghost.recorder.cancel())
  }

  const lastKey = lastEvent ? eventKey(lastEvent) : null
  const showNudge =
    recording &&
    !noteOpen &&
    lastEvent !== undefined &&
    NUDGE_TYPES.has(lastEvent.type) &&
    lastKey !== nudgeDismissedKey

  // Suggestion accept in Studio pushes a Teach prefill here. Idle-only: a
  // prefill arriving mid-recording is ignored, never clobbers the session.
  activeRef.current = active
  targetUrlRef.current = targetUrl
  useEffect(() => {
    return window.ghost.toolbar.onTeachPrefill(({ goal: preset }) => {
      if (activeRef.current) return
      setGoal(preset)
      setCaseInput('')
      setGoalHint(null)
      setUrlInput(targetUrlRef.current)
      setUrlError(null)
      setTeachOpen(true)
    })
  }, [])

  return (
    <main className="toolbar-root">
      <div className="toolbar-bar">
        {active ? (
          <span className="rec-pill" data-testid="toolbar-recording" data-semid="recording-pill">
            <span className="rec-dot" /> {paused ? 'PAUSED' : 'REC'}
          </span>
        ) : (
          <span className="muted" data-testid="toolbar-idle">
            Ghost Operator
          </span>
        )}
        {active && (
          <span className="muted" data-testid="toolbar-scope" data-semid="recording-scope">
            Recording {targetName}
          </span>
        )}
        {active && (
          <span className="elapsed" data-testid="toolbar-elapsed">
            {formatElapsed(elapsed)}
          </span>
        )}
        {!active && !teachOpen && (
          <Button
            variant="primary"
            data-testid="toolbar-teach"
            data-semid="teach"
            onClick={openTeach}
          >
            Teach
          </Button>
        )}
        {recording && (
          <Button data-testid="toolbar-pause" data-semid="pause" onClick={() => run(() => window.ghost.recorder.pause())}>
            Pause
          </Button>
        )}
        {paused && (
          <Button
            variant="primary"
            data-testid="toolbar-resume"
            data-semid="resume"
            onClick={() => run(() => window.ghost.recorder.resume())}
          >
            Resume
          </Button>
        )}
        {recording && (
          <Button data-testid="toolbar-note" data-semid="add-note" onClick={openNote}>
            Add note
          </Button>
        )}
        {active && (
          <Button data-testid="toolbar-finish" data-semid="finish" onClick={finishRecording}>
            Finish
          </Button>
        )}
        {active && !confirmCancel && (
          <Button data-testid="toolbar-cancel" data-semid="cancel" onClick={() => setConfirmCancel(true)}>
            Cancel
          </Button>
        )}
        {active && confirmCancel && (
          <span className="confirm-inline" role="alert">
            Discard?
            <Button data-testid="toolbar-cancel-yes" onClick={cancelRecording}>
              Yes
            </Button>
            <Button data-testid="toolbar-cancel-no" onClick={() => setConfirmCancel(false)}>
              No
            </Button>
          </span>
        )}
      </div>
      {teachOpen && !active && (
        <form
          className="teach-form"
          data-testid="teach-form"
          onSubmit={(event) => {
            event.preventDefault()
            startTeaching()
          }}
        >
          <div className="teach-field">
            <label htmlFor="teach-goal">What should Ghost learn?</label>
            <input
              id="teach-goal"
              className="teach-input"
              data-testid="teach-goal"
              type="text"
              autoFocus
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value)
                if (goalHint !== null) setGoalHint(null)
              }}
              placeholder="e.g. Refund order SB-1002"
            />
            {goalHint !== null && (
              <p className="teach-hint" role="alert" data-testid="teach-goal-hint">
                {goalHint}
              </p>
            )}
          </div>
          <div className="teach-field">
            <label htmlFor="teach-case">Case or context (optional)</label>
            <input
              id="teach-case"
              className="teach-input"
              data-testid="teach-case"
              type="text"
              value={caseInput}
              onChange={(event) => setCaseInput(event.target.value)}
              placeholder="e.g. SB-1002"
            />
          </div>
          <div className="teach-field">
            <label htmlFor="teach-url">Target site URL</label>
            <div className="teach-url-row">
              <input
                id="teach-url"
                className="teach-input"
                data-testid="teach-url"
                type="text"
                value={urlInput}
                onChange={(event) => {
                  setUrlInput(event.target.value)
                  if (urlError !== null) setUrlError(null)
                }}
                placeholder="https://example.com"
                spellCheck={false}
              />
              <Button
                data-testid="teach-url-apply"
                type="button"
                disabled={urlBusy}
                onClick={applyUrl}
              >
                Apply
              </Button>
            </div>
            {urlError !== null && (
              <p className="teach-hint" role="alert" data-testid="teach-url-error">
                {urlError}
              </p>
            )}
          </div>
          <p className="teach-target" data-testid="teach-target">
            Demonstrating on: {targetName}
          </p>
          <div className="teach-actions">
            <Button variant="primary" data-testid="teach-start" data-semid="teach-start" type="submit">
              Start demonstrating
            </Button>
            <Button data-testid="teach-cancel" type="button" onClick={closeTeach}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {active && (
        <div className="toolbar-sub">
          <p className="toolbar-hint" data-testid="toolbar-hint">
            Demonstrate the task, then Finish
          </p>
          <span className="toolbar-count" data-testid="toolbar-count">
            {eventCount} action{eventCount === 1 ? '' : 's'} captured
          </span>
          {feed.length > 0 && (
            <ul className="toolbar-feed" data-testid="toolbar-feed" aria-label="Recent captures">
              {feed.map((entry) => (
                <li key={entry.key} data-testid="toolbar-feed-item">
                  {entry.label}
                </li>
              ))}
            </ul>
          )}
          {showNudge && (
            <div className="note-nudge" data-testid="note-nudge" role="status">
              <span>Value may vary per case — Add note?</span>
              <Button data-testid="note-nudge-add" onClick={openNote}>
                Add note
              </Button>
              <Button
                data-testid="note-nudge-dismiss"
                onClick={() => setNudgeDismissedKey(lastKey)}
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}
      {!active && !teachOpen && summary !== null && (
        <p className="toolbar-summary" data-testid="toolbar-summary" role="status">
          {summary}
        </p>
      )}
      {!active && !teachOpen && summary === null && hasRecordings === false && (
        <p className="toolbar-empty" data-testid="toolbar-empty-hint">
          Demonstrate a task on the target site, review it in Studio, then reuse it as a skill.
        </p>
      )}
      {noteOpen && (
        <div className="note-editor" data-testid="note-editor">
          <label htmlFor="note-text">Explain a decision or variable</label>
          <textarea
            id="note-text"
            data-testid="note-text"
            rows={3}
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="e.g. Quantity comes from the case request, not the order."
          />
          <div className="note-actions">
            <Button variant="primary" data-testid="note-save" onClick={saveNote}>
              Save note
            </Button>
            <Button data-testid="note-cancel" onClick={closeNote}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error !== null && (
        <p className="toolbar-error" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <ToolbarApp />
    </StrictMode>
  )
}
