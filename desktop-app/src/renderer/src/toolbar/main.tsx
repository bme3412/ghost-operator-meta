import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { RecorderStatePush } from '../../../shared/schemas'
import { Button } from '../components/Button'
import '../styles.css'

const DEFAULT_GOAL = 'Resolve a support ticket'

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function ToolbarApp(): React.JSX.Element {
  const [push, setPush] = useState<RecorderStatePush | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [targetName, setTargetName] = useState('target')
  const receivedAt = useRef(Date.now())

  useEffect(() => {
    window.ghost.target
      .getInfo()
      .then((info) => setTargetName(info.name))
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

  const status = push?.status ?? 'idle'
  const recording = status === 'recording'
  const paused = status === 'paused'
  const active = recording || paused
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

  const openNote = (): void => {
    setNoteText('')
    setNoteOpen(true)
    void window.ghost.toolbar.setHeight(220)
  }
  const closeNote = (): void => {
    setNoteOpen(false)
    void window.ghost.toolbar.setHeight(64)
  }
  const saveNote = (): void => {
    run(() =>
      window.ghost.recorder.addNote(noteText).then(() => {
        closeNote()
      })
    )
  }

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
        {!active && (
          <Button
            variant="primary"
            data-testid="toolbar-teach"
            data-semid="teach"
            onClick={() => run(() => window.ghost.recorder.start(DEFAULT_GOAL, null))}
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
          <Button data-testid="toolbar-finish" data-semid="finish" onClick={() => run(() => window.ghost.recorder.finish())}>
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
            <Button
              data-testid="toolbar-cancel-yes"
              onClick={() => {
                setConfirmCancel(false)
                run(() => window.ghost.recorder.cancel())
              }}
            >
              Yes
            </Button>
            <Button data-testid="toolbar-cancel-no" onClick={() => setConfirmCancel(false)}>
              No
            </Button>
          </span>
        )}
      </div>
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
