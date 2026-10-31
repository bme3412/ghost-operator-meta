import { useEffect, useRef, useState } from 'react'
import type { RecorderLastEvent, RecorderStatePush } from '../../../../shared/schemas'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'

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

export function RecordingView({ push }: { push: RecorderStatePush | null }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [targetName, setTargetName] = useState('website')
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [nudgeDismissedKey, setNudgeDismissedKey] = useState<string | null>(null)
  const receivedAt = useRef(Date.now())
  const recordingIdRef = useRef<string | null>(null)

  useEffect(() => {
    window.ghost.target
      .getInfo()
      .then((info) => setTargetName(info.name))
      .catch(() => undefined)
  }, [])

  const status = push?.status ?? 'idle'
  const recording = status === 'recording'
  const paused = status === 'paused'
  const lastEvent = push?.lastEvent
  const eventCount = push?.eventCount ?? 0

  useEffect(() => {
    receivedAt.current = Date.now()
  }, [push])

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [recording])

  // New recording sessions reset the local feed and nudge.
  useEffect(() => {
    const id = push?.recordingId ?? null
    if (id !== recordingIdRef.current) {
      recordingIdRef.current = id
      setFeed([])
      setNudgeDismissedKey(null)
      setConfirmDiscard(false)
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
        : [...prev.slice(-4), { key, label }]
    )
  }, [lastEvent])

  const elapsed =
    push === null
      ? 0
      : recording
        ? push.elapsedMs + (now - receivedAt.current)
        : push.elapsedMs

  const run = (action: () => Promise<unknown>): void => {
    setError(null)
    action().catch((err: unknown) => setError(friendlyError(err)))
  }

  const lastKey = lastEvent ? eventKey(lastEvent) : null
  const showNudge =
    recording &&
    !noteOpen &&
    lastEvent !== undefined &&
    NUDGE_TYPES.has(lastEvent.type) &&
    lastKey !== nudgeDismissedKey

  if (!recording && !paused) {
    return <p className="muted">No recording in progress.</p>
  }

  return (
    <div>
      <section className="card" aria-label="Recording status">
        <p>
          <span className="rec-pill" data-testid="recording-pill" data-semid="recording-pill">
            <span className="rec-dot" /> {paused ? 'PAUSED' : 'REC'}
          </span>{' '}
          <span className="elapsed" data-testid="recording-elapsed">
            {formatElapsed(elapsed)}
          </span>
        </p>
        <p className="muted" data-testid="recording-scope" data-semid="recording-scope">
          Recording {targetName}
          {push?.goal ? ` — ${push.goal}` : ''}
        </p>
        <p className="toolbar-hint">Demonstrate the task in the website, then Finish.</p>
        <p className="toolbar-count" data-testid="recording-count">
          {eventCount} action{eventCount === 1 ? '' : 's'} captured
        </p>
        {feed.length > 0 && (
          <ul className="toolbar-feed" data-testid="recording-feed" aria-label="Recent captures">
            {feed.map((entry) => (
              <li key={entry.key} data-testid="recording-feed-item">
                {entry.label}
              </li>
            ))}
          </ul>
        )}
        {showNudge && (
          <div className="note-nudge" data-testid="note-nudge" role="status">
            <span>This value may vary per case — explain it?</span>
            <Button data-testid="note-nudge-add" onClick={() => setNoteOpen(true)}>
              Add note
            </Button>
            <Button data-testid="note-nudge-dismiss" onClick={() => setNudgeDismissedKey(lastKey)}>
              Dismiss
            </Button>
          </div>
        )}
      </section>

      {noteOpen ? (
        <section className="card" aria-label="Add note">
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
              <Button
                variant="primary"
                data-testid="note-save"
                onClick={() =>
                  run(() =>
                    window.ghost.recorder.addNote(noteText).then(() => {
                      setNoteOpen(false)
                      setNoteText('')
                    })
                  )
                }
              >
                Save note
              </Button>
              <Button
                data-testid="note-cancel"
                onClick={() => {
                  setNoteOpen(false)
                  setNoteText('')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="field">
          {recording && (
            <Button
              data-testid="recording-pause"
              data-semid="pause"
              onClick={() => run(() => window.ghost.recorder.pause())}
            >
              Pause
            </Button>
          )}
          {paused && (
            <Button
              variant="primary"
              data-testid="recording-resume"
              data-semid="resume"
              onClick={() => run(() => window.ghost.recorder.resume())}
            >
              Resume
            </Button>
          )}
          {recording && (
            <Button data-testid="recording-note" data-semid="add-note" onClick={() => setNoteOpen(true)}>
              Add note
            </Button>
          )}
          <Button
            variant="primary"
            data-testid="recording-finish"
            data-semid="finish"
            onClick={() => run(() => window.ghost.recorder.finish())}
          >
            Finish
          </Button>
          {!confirmDiscard ? (
            <Button
              data-testid="recording-discard"
              data-semid="cancel"
              onClick={() => setConfirmDiscard(true)}
            >
              Discard
            </Button>
          ) : (
            <span className="confirm-inline" role="alert">
              Discard?
              <Button
                data-testid="recording-discard-yes"
                onClick={() => {
                  setConfirmDiscard(false)
                  run(() => window.ghost.recorder.cancel())
                }}
              >
                Yes
              </Button>
              <Button data-testid="recording-discard-no" onClick={() => setConfirmDiscard(false)}>
                No
              </Button>
            </span>
          )}
        </div>
      )}
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
