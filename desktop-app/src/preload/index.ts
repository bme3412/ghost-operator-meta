import { contextBridge, ipcRenderer } from 'electron'
import type {
  CompileResult,
  ProviderId,
  PublishRequest,
  RecorderStatePush,
  Recording,
  RecordingEventInput,
  RecordingSummary,
  RunProgress,
  RunRecord,
  SaveDraftRequest,
  Skill,
  SkillSummary,
  StartRunRequest,
  StudioShowPayload,
  UpdateDraftRequest
} from '../shared/schemas'
import type { TargetInfo } from '../shared/target'

function on(channel: string, listener: () => void): () => void {
  const wrapped = (): void => listener()
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

function onPayload<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ghost:ping'),
  echo: (message: string): Promise<{ message: string }> =>
    ipcRenderer.invoke('ghost:echo', { message }),
  target: {
    getInfo: (): Promise<TargetInfo> => ipcRenderer.invoke('target:get-info')
  },
  /** Guidance highlight from the runner. Null clears the highlight. */
  onHighlight: (listener: (semanticId: string | null) => void): (() => void) =>
    onPayload<string | null>('ghost:highlight', listener),
  recorder: {
    getState: (): Promise<RecorderStatePush> => ipcRenderer.invoke('recorder:get-state'),
    start: (goal: string, caseId: string | null): Promise<RecorderStatePush> =>
      ipcRenderer.invoke('recorder:start', { goal, caseId }),
    pause: (): Promise<RecorderStatePush> => ipcRenderer.invoke('recorder:pause'),
    resume: (): Promise<RecorderStatePush> => ipcRenderer.invoke('recorder:resume'),
    setContext: (caseId: string | null): Promise<void> =>
      ipcRenderer.invoke('recorder:context', { caseId }),
    appendEvents: (events: RecordingEventInput[]): Promise<number> =>
      ipcRenderer.invoke('recorder:events', events),
    addNote: (text: string): Promise<RecorderStatePush> =>
      ipcRenderer.invoke('recorder:note', { text }),
    finish: (): Promise<Recording> => ipcRenderer.invoke('recorder:finish'),
    cancel: (): Promise<RecorderStatePush> => ipcRenderer.invoke('recorder:cancel'),
    onState: (listener: (push: RecorderStatePush) => void): (() => void) =>
      onPayload<RecorderStatePush>('ghost:recording-state', listener)
  },
  toolbar: {
    setHeight: (height: number): Promise<void> =>
      ipcRenderer.invoke('toolbar:set-height', { height })
  },
  recordings: {
    list: (): Promise<RecordingSummary[]> => ipcRenderer.invoke('recordings:list'),
    get: (id: string): Promise<Recording | null> => ipcRenderer.invoke('recordings:get', { id }),
    getScreenshot: (ref: string): Promise<string | null> =>
      ipcRenderer.invoke('recordings:screenshot', { ref })
  },
  skills: {
    list: (): Promise<SkillSummary[]> => ipcRenderer.invoke('skills:list'),
    get: (id: string): Promise<Skill | null> => ipcRenderer.invoke('skills:get', { id }),
    compile: (recordingId: string, providerId: ProviderId): Promise<CompileResult> =>
      ipcRenderer.invoke('skills:compile', { recordingId, providerId }),
    saveDraft: (request: SaveDraftRequest): Promise<Skill> =>
      ipcRenderer.invoke('skills:save-draft', request),
    updateDraft: (request: UpdateDraftRequest): Promise<Skill> =>
      ipcRenderer.invoke('skills:update-draft', request),
    publish: (request: PublishRequest): Promise<Skill> =>
      ipcRenderer.invoke('skills:publish', request)
  },
  studio: {
    onShow: (listener: (payload: StudioShowPayload) => void): (() => void) =>
      onPayload<StudioShowPayload>('ghost:studio-show', listener)
  },
  library: {
    onChanged: (listener: () => void): (() => void) => on('ghost:library-changed', listener)
  },
  runs: {
    start: (request: StartRunRequest): Promise<RunProgress> =>
      ipcRenderer.invoke('runs:start', request),
    getState: (): Promise<RunProgress | null> => ipcRenderer.invoke('runs:state'),
    pause: (runId: string): Promise<RunProgress> => ipcRenderer.invoke('runs:pause', { runId }),
    resume: (runId: string): Promise<RunProgress> =>
      ipcRenderer.invoke('runs:resume', { runId }),
    stop: (runId: string): Promise<RunProgress> => ipcRenderer.invoke('runs:stop', { runId }),
    advance: (runId: string): Promise<RunProgress> =>
      ipcRenderer.invoke('runs:advance', { runId }),
    approve: (runId: string): Promise<RunProgress> =>
      ipcRenderer.invoke('runs:approve', { runId }),
    retry: (runId: string): Promise<RunProgress> => ipcRenderer.invoke('runs:retry', { runId }),
    explain: (
      runId: string,
      providerId: ProviderId
    ): Promise<{ explanation: string; providerId: ProviderId }> =>
      ipcRenderer.invoke('runs:explain', { runId, providerId }),
    showTarget: (runId: string): Promise<void> =>
      ipcRenderer.invoke('runs:show-target', { runId }),
    showInStudio: (runId: string): Promise<void> =>
      ipcRenderer.invoke('runs:show-in-studio', { runId }),
    list: (): Promise<RunRecord[]> => ipcRenderer.invoke('runs:list'),
    get: (runId: string): Promise<RunRecord | null> => ipcRenderer.invoke('runs:get', { runId }),
    onProgress: (listener: (progress: RunProgress | null) => void): (() => void) =>
      onPayload<RunProgress | null>('ghost:run-progress', listener)
  }
}

export type GhostApi = typeof api

contextBridge.exposeInMainWorld('ghost', api)

/**
 * Capture mode for the target window (a remote web app, not our renderer).
 * Observes committed DOM interactions while a recording is active and
 * forwards them to the main-process recorder. Never calls preventDefault.
 */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function selectorFor(element: Element): string | undefined {
  const semid = element.getAttribute('data-semid')
  if (semid) return `[data-semid="${semid}"]`
  return undefined
}

function recordIdentityFor(element: Element): string | undefined {
  const holder = element.closest('[data-ticket-id]')
  return holder?.getAttribute('data-ticket-id') ?? undefined
}

function installTargetCapture(): void {
  let active = false
  const refresh = (): void => {
    ipcRenderer
      .invoke('recorder:get-state')
      .then((push: RecorderStatePush) => {
        active = push.status === 'recording'
      })
      .catch(() => undefined)
  }
  refresh()
  ipcRenderer.on('ghost:recording-state', (_event, push: RecorderStatePush) => {
    active = push.status === 'recording'
  })

  const send = (events: RecordingEventInput[]): void => {
    if (!active) return
    ipcRenderer.invoke('recorder:events', events).catch(() => undefined)
  }

  const recordNavigate = (): void => {
    send([{ type: 'navigate', value: window.location.pathname, atMs: Date.now() }])
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', recordNavigate, { once: true })
  } else {
    recordNavigate()
  }

  document.addEventListener(
    'click',
    (event) => {
      if (!active) return
      const target = event.target
      if (!(target instanceof Element)) return
      const hit = target.closest('[data-semid],button,a,input,select,textarea,summary')
      if (!(hit instanceof Element)) return
      const rect = hit.getBoundingClientRect()
      const semid = hit.getAttribute('data-semid') ?? undefined
      send([
        {
          type: 'click',
          semanticId: semid,
          selector: selectorFor(hit),
          targetRole: hit.getAttribute('role') ?? hit.tagName.toLowerCase(),
          targetLabel:
            hit.getAttribute('aria-label') ?? truncate(hit.textContent?.trim() ?? '', 120) ?? undefined,
          surroundingText: truncate(
            hit.parentElement?.textContent?.trim().replace(/\s+/g, ' ') ?? '',
            200
          ),
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          recordIdentity: recordIdentityFor(hit),
          atMs: Date.now()
        }
      ])
    },
    true
  )

  document.addEventListener(
    'change',
    (event) => {
      if (!active) return
      const target = event.target
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
        return
      }
      if (target instanceof HTMLInputElement && target.type === 'password') return
      const rect = target.getBoundingClientRect()
      send([
        {
          type: target.tagName === 'SELECT' ? 'select' : 'input_commit',
          semanticId: target.getAttribute('data-semid') ?? undefined,
          selector: selectorFor(target),
          targetRole: target.tagName.toLowerCase(),
          targetLabel: target.getAttribute('aria-label') ?? target.name ?? undefined,
          value: truncate(target.value, 500),
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          recordIdentity: recordIdentityFor(target),
          atMs: Date.now()
        }
      ])
    },
    true
  )

  document.addEventListener(
    'submit',
    (event) => {
      if (!active) return
      const target = event.target
      if (!(target instanceof HTMLFormElement)) return
      send([
        {
          type: 'submit',
          semanticId: target.getAttribute('data-semid') ?? undefined,
          selector: selectorFor(target),
          recordIdentity: recordIdentityFor(target),
          atMs: Date.now()
        }
      ])
    },
    true
  )

  // Runner-driven highlight. Payload is a CSS selector; null clears it.
  const style = document.createElement('style')
  style.textContent = '.ghost-highlight{outline:3px solid #0071e3 !important;outline-offset:3px;}'
  document.head.appendChild(style)
  ipcRenderer.on('ghost:highlight', (_event, selector: string | null) => {
    for (const el of document.querySelectorAll('.ghost-highlight')) {
      el.classList.remove('ghost-highlight')
    }
    if (!selector) return
    try {
      const hit = document.querySelector(selector)
      if (hit) {
        hit.classList.add('ghost-highlight')
        hit.scrollIntoView({ block: 'nearest' })
      }
    } catch {
      // Invalid selector; ignore.
    }
  })
}

try {
  if (process.argv.includes('--ghost-role=target')) {
    installTargetCapture()
  }
} catch {
  // process.argv is unavailable in some contexts; capture stays disabled.
}
