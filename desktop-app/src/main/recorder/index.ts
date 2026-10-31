import {
  RecorderStatePush,
  RecordingEventInput,
  type RecorderLastEvent,
  type RecorderStatus,
  type Recording,
  type RecordingEvent,
  type RecordingNote
} from '../../shared/schemas'
import { TARGET } from '../../shared/target'

export interface RecorderDeps {
  now: () => number
  /** Capture the target window and persist the PNG; resolves the stored ref or null. */
  captureScreenshot: (recordingId: string, sequence: number) => Promise<string | null>
  persistRecording: (recording: Recording) => void
  onStateChange: (push: RecorderStatePush) => void
}

interface Session {
  id: string
  goal: string
  caseId: string | null
  startedAtMs: number
  pausedMs: number
  pauseStartedAtMs: number | null
  status: Exclude<RecorderStatus, 'idle'>
  events: RecordingEvent[]
  notes: RecordingNote[]
  lastEvent: RecorderLastEvent | null
}

const SCREENSHOT_EVENTS = new Set(['navigate', 'submit', 'state_snapshot'])

const EVENT_VERBS: Record<string, string> = {
  navigate: 'Opened',
  click: 'Clicked',
  input_commit: 'Filled',
  select: 'Selected',
  upload: 'Uploaded',
  submit: 'Submitted',
  state_snapshot: 'Snapshot',
  gap: 'Paused',
  note: 'Note'
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/** One-line human summary of a captured event for the live toolbar feed. */
function summarizeEvent(input: { type: string; targetLabel?: string; semanticId?: string; value?: string; recordIdentity?: string }, atMs: number): RecorderLastEvent {
  const verb = EVENT_VERBS[input.type] ?? 'Captured'
  const name =
    input.type === 'navigate'
      ? (input.value ?? '')
      : (input.targetLabel ?? input.semanticId ?? input.value ?? input.recordIdentity ?? '')
  const label = name ? `${verb} ${truncate(name, 80)}` : verb === 'Note' ? 'Note added' : `${verb}`
  return {
    type: input.type as RecorderLastEvent['type'],
    label: truncate(label, 120),
    atMs
  }
}

/** Explicit recorder state machine. Idle → recording ⇄ paused → idle. */
export function createRecorder(deps: RecorderDeps): {
  getPush: () => RecorderStatePush
  start: (goal: string, caseId: string | null) => RecorderStatePush
  pause: () => RecorderStatePush
  resume: () => Promise<RecorderStatePush>
  setContext: (caseId: string | null) => void
  appendEvents: (inputs: RecordingEventInput[]) => Promise<number>
  addNote: (text: string) => RecorderStatePush
  finish: () => Promise<Recording>
  cancel: () => RecorderStatePush
} {
  let session: Session | null = null
  let counter = 0

  function elapsedMs(s: Session, nowMs: number): number {
    const paused =
      s.pausedMs + (s.pauseStartedAtMs !== null ? nowMs - s.pauseStartedAtMs : 0)
    return Math.max(0, nowMs - s.startedAtMs - paused)
  }

  function push(): RecorderStatePush {
    if (!session) {
      return {
        status: 'idle',
        recordingId: null,
        goal: '',
        caseId: null,
        startedAt: null,
        eventCount: 0,
        elapsedMs: 0
      }
    }
    return {
      status: session.status,
      recordingId: session.id,
      goal: session.goal,
      caseId: session.caseId,
      startedAt: new Date(session.startedAtMs).toISOString(),
      eventCount: session.events.length,
      elapsedMs: elapsedMs(session, deps.now()),
      ...(session.lastEvent ? { lastEvent: session.lastEvent } : {})
    }
  }

  function emit(): RecorderStatePush {
    const next = push()
    deps.onStateChange(next)
    return next
  }

  function nextSequence(): number {
    if (!session) throw new Error('No active recording.')
    return session.events.length
  }

  async function maybeScreenshot(
    s: Session,
    event: RecordingEvent
  ): Promise<RecordingEvent> {
    if (!SCREENSHOT_EVENTS.has(event.type)) return event
    const ref = await deps.captureScreenshot(s.id, event.sequence)
    return ref ? { ...event, screenshotRef: ref } : event
  }

  return {
    getPush: push,

    start(goal: string, caseId: string | null): RecorderStatePush {
      if (session) throw new Error('A recording is already active.')
      const startedAtMs = deps.now()
      counter += 1
      session = {
        id: `rec-${startedAtMs}-${counter}`,
        goal,
        caseId,
        startedAtMs,
        pausedMs: 0,
        pauseStartedAtMs: null,
        status: 'recording',
        events: [],
        notes: [],
        lastEvent: null
      }
      return emit()
    },

    pause(): RecorderStatePush {
      if (!session || session.status !== 'recording') {
        throw new Error('No active recording to pause.')
      }
      const nowMs = deps.now()
      session.pauseStartedAtMs = nowMs
      session.status = 'paused'
      session.events.push({ sequence: nextSequence(), type: 'gap', atMs: nowMs })
      return emit()
    },

    async resume(): Promise<RecorderStatePush> {
      if (!session || session.status !== 'paused') {
        throw new Error('No paused recording to resume.')
      }
      const nowMs = deps.now()
      if (session.pauseStartedAtMs !== null) {
        session.pausedMs += nowMs - session.pauseStartedAtMs
        session.pauseStartedAtMs = null
      }
      session.status = 'recording'
      const snapshot: RecordingEvent = {
        sequence: nextSequence(),
        type: 'state_snapshot',
        atMs: nowMs
      }
      session.events.push(await maybeScreenshot(session, snapshot))
      return emit()
    },

    setContext(caseId: string | null): void {
      if (session) session.caseId = caseId
    },

    async appendEvents(inputs: RecordingEventInput[]): Promise<number> {
      if (!session || session.status !== 'recording') return 0
      let appended = 0
      for (const input of inputs) {
        const parsed = RecordingEventInput.parse(input)
        const event: RecordingEvent = { ...parsed, sequence: nextSequence() }
        session.events.push(await maybeScreenshot(session, event))
        session.lastEvent = summarizeEvent(parsed, parsed.atMs)
        appended += 1
      }
      emit()
      return appended
    },

    addNote(text: string): RecorderStatePush {
      if (!session || session.status === 'paused') {
        throw new Error('No active recording to annotate.')
      }
      const trimmed = text.trim()
      if (!trimmed) throw new Error('Note text must not be empty.')
      const nowMs = deps.now()
      session.notes.push({ sequence: session.events.length, text: trimmed, atMs: nowMs })
      session.events.push({ sequence: nextSequence(), type: 'note', value: trimmed, atMs: nowMs })
      session.lastEvent = summarizeEvent({ type: 'note', value: trimmed }, nowMs)
      return emit()
    },

    async finish(): Promise<Recording> {
      if (!session) throw new Error('No active recording to finish.')
      const nowMs = deps.now()
      const closing: RecordingEvent = {
        sequence: nextSequence(),
        type: 'state_snapshot',
        atMs: nowMs
      }
      session.events.push(await maybeScreenshot(session, closing))
      const recording: Recording = {
        id: session.id,
        goal: session.goal,
        applicationScope: TARGET.id,
        startedAt: new Date(session.startedAtMs).toISOString(),
        endedAt: new Date(nowMs).toISOString(),
        events: session.events,
        notes: session.notes
      }
      deps.persistRecording(recording)
      session = null
      emit()
      return recording
    },

    cancel(): RecorderStatePush {
      if (!session) throw new Error('No active recording to cancel.')
      session = null
      return emit()
    }
  }
}

export type Recorder = ReturnType<typeof createRecorder>
