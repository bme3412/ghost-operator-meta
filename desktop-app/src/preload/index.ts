import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActivityFeed,
  BatchRecord,
  CompileResult,
  PageIdeasResult,
  PanelNavigateParams,
  ProviderId,
  PublishRequest,
  RecorderStatePush,
  Recording,
  RecordingEventInput,
  RecordingSummary,
  RunProgress,
  RunRecord,
  SaveDraftRequest,
  ScoutProgress,
  ScoutStatus,
  Skill,
  SkillSummary,
  StartBatchRequest,
  StartRunRequest,
  Suggestion,
  SuggestAcceptPrefill,
  SuggestPageRequest,
  SuggestPolishResult,
  TargetPagePush,
  UpdateDraftRequest
} from '../shared/schemas'
import type { TargetInfo, TargetStatus } from '../shared/target'
import { nextNavigateToEmit } from '../shared/capture/navigate'
import {
  buildAccessibleDescriptor,
  buildSelectorCandidates,
  escapeCssIdentifier,
  selectBestSelector,
  type SelectorElementSnapshot
} from '../shared/capture/selectors'

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
  target: {
    getInfo: (): Promise<TargetInfo> => ipcRenderer.invoke('target:get-info'),
    setUrl: (url: string): Promise<TargetInfo> => ipcRenderer.invoke('target:set-url', { url }),
    getStatus: (): Promise<TargetStatus> => ipcRenderer.invoke('target:get-status'),
    show: (): Promise<void> => ipcRenderer.invoke('target:show'),
    openCase: (ticketId: string): Promise<void> =>
      ipcRenderer.invoke('target:open-case', { ticketId }),
    onPageChanged: (listener: (page: TargetPagePush) => void): (() => void) =>
      onPayload<TargetPagePush>('ghost:target-page', listener)
  },
  panel: {
    setLayout: (layout: 'docked' | 'expanded'): Promise<void> =>
      ipcRenderer.invoke('panel:set-layout', { layout }),
    onNavigate: (listener: (params: PanelNavigateParams) => void): (() => void) =>
      onPayload<PanelNavigateParams>('ghost:panel-navigate', listener)
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
    requestMic: (): Promise<boolean> => ipcRenderer.invoke('recorder:mic-access'),
    transcribe: (
      audio: Uint8Array,
      mimeType: string
    ): Promise<{ text: string; source: 'live' | 'canned' }> =>
      ipcRenderer.invoke('recorder:transcribe', { audio, mimeType }),
    finish: (): Promise<Recording> => ipcRenderer.invoke('recorder:finish'),
    cancel: (): Promise<RecorderStatePush> => ipcRenderer.invoke('recorder:cancel'),
    onState: (listener: (push: RecorderStatePush) => void): (() => void) =>
      onPayload<RecorderStatePush>('ghost:recording-state', listener)
  },
  suggest: {
    list: (siteId?: string): Promise<Suggestion[]> =>
      ipcRenderer.invoke('suggest:list', siteId === undefined ? {} : { siteId }),
    listPolished: (siteId?: string): Promise<SuggestPolishResult> =>
      ipcRenderer.invoke(
        'suggest:list',
        siteId === undefined ? { polish: true } : { siteId, polish: true }
      ),
    dismiss: (id: string): Promise<Suggestion> =>
      ipcRenderer.invoke('suggest:dismiss', { id }),
    accept: (id: string): Promise<SuggestAcceptPrefill> =>
      ipcRenderer.invoke('suggest:accept', { id }),
    forPage: (options?: SuggestPageRequest): Promise<PageIdeasResult> =>
      ipcRenderer.invoke('suggest:page', { ...options })
  },
  scout: {
    start: (siteId?: string): Promise<ScoutStatus> =>
      ipcRenderer.invoke('scout:start', siteId === undefined ? {} : { siteId }),
    cancel: (): Promise<ScoutStatus> => ipcRenderer.invoke('scout:cancel'),
    getStatus: (): Promise<ScoutStatus> => ipcRenderer.invoke('scout:status'),
    onProgress: (listener: (progress: ScoutProgress) => void): (() => void) =>
      onPayload<ScoutProgress>('ghost:scout-progress', listener)
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
    script: (scriptedId: string): Promise<CompileResult> =>
      ipcRenderer.invoke('skills:script', { scriptedId }),
    saveDraft: (request: SaveDraftRequest): Promise<Skill> =>
      ipcRenderer.invoke('skills:save-draft', request),
    updateDraft: (request: UpdateDraftRequest): Promise<Skill> =>
      ipcRenderer.invoke('skills:update-draft', request),
    publish: (request: PublishRequest): Promise<Skill> =>
      ipcRenderer.invoke('skills:publish', request)
  },
  providers: {
    getDefault: (): Promise<ProviderId> => ipcRenderer.invoke('providers:default')
  },
  library: {
    onChanged: (listener: () => void): (() => void) => on('ghost:library-changed', listener)
  },
  activity: {
    getFeed: (): Promise<ActivityFeed> => ipcRenderer.invoke('activity:get-feed'),
    dismiss: (signature: string): Promise<void> =>
      ipcRenderer.invoke('activity:dismiss', { signature }),
    act: (signature: string): Promise<void> => ipcRenderer.invoke('activity:act', { signature }),
    onChanged: (listener: () => void): (() => void) => on('ghost:activity-changed', listener)
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
    list: (): Promise<RunRecord[]> => ipcRenderer.invoke('runs:list'),
    get: (runId: string): Promise<RunRecord | null> => ipcRenderer.invoke('runs:get', { runId }),
    onProgress: (listener: (progress: RunProgress | null) => void): (() => void) =>
      onPayload<RunProgress | null>('ghost:run-progress', listener)
  },
  batches: {
    start: (request: StartBatchRequest): Promise<BatchRecord> =>
      ipcRenderer.invoke('batches:start', request),
    openCases: (): Promise<string[]> => ipcRenderer.invoke('batches:open-cases'),
    list: (): Promise<BatchRecord[]> => ipcRenderer.invoke('batches:list'),
    get: (batchId: string): Promise<BatchRecord | null> =>
      ipcRenderer.invoke('batches:get', { batchId }),
    cancel: (batchId: string): Promise<BatchRecord | null> =>
      ipcRenderer.invoke('batches:cancel', { batchId }),
    awayUrl: (batchId: string): Promise<string | null> =>
      ipcRenderer.invoke('batches:away-url', { batchId })
  }
}

/**
 * Minimal capture-only surface for the target window (untrusted remote
 * content). Navigate/click/change/submit recording runs inside this preload
 * below; the page itself can only read recorder state and subscribe to the
 * state and highlight pushes. Everything else is app-window-only.
 */
const targetApi = {
  recorder: {
    getState: (): Promise<RecorderStatePush> => ipcRenderer.invoke('recorder:get-state'),
    onState: (listener: (push: RecorderStatePush) => void): (() => void) =>
      onPayload<RecorderStatePush>('ghost:recording-state', listener)
  },
  onHighlight: (listener: (semanticId: string | null) => void): (() => void) =>
    onPayload<string | null>('ghost:highlight', listener)
}

type PreloadRole = 'target' | 'panel' | 'untrusted'

function processArgs(): readonly string[] {
  try {
    return typeof process !== 'undefined' ? process.argv : []
  } catch {
    return []
  }
}

/**
 * Bridge selection is flag-driven: the main process passes --ghost-role=*
 * via additionalArguments, which is visible to the sandboxed preload. No URL
 * fallback: anything without a recognized flag (scout window, dropped files,
 * unknown contexts) gets the capture-only bridge without capture listeners —
 * never the full panel API.
 */
function preloadRole(): PreloadRole {
  const argv = processArgs()
  if (argv.includes('--ghost-role=target')) return 'target'
  if (argv.includes('--ghost-role=panel')) return 'panel'
  return 'untrusted'
}

export type GhostApi = typeof api
export type GhostTargetApi = typeof targetApi

const role = preloadRole()
if (role === 'target') {
  contextBridge.exposeInMainWorld('ghost', targetApi)
  installTargetCapture()
} else if (role === 'panel') {
  contextBridge.exposeInMainWorld('ghost', api)
} else {
  contextBridge.exposeInMainWorld('ghost', targetApi)
}

/**
 * Capture mode for the target window (a remote web app, not our renderer).
 * Observes committed DOM interactions while a recording is active and
 * forwards them to the main-process recorder. Never calls preventDefault.
 */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Maximum ancestor levels in the last-resort CSS path. */
const CSS_PATH_MAX_DEPTH = 4

/**
 * Capped-depth CSS path for an element (tag + nth-of-type segments joined
 * with child combinators). Anchored at the nearest id in reach, otherwise
 * relative — a last-resort replay candidate. DOM reads only.
 */
function cssPathFor(element: Element): string | undefined {
  const segments: string[] = []
  let current: Element | null = element
  for (let depth = 0; depth < CSS_PATH_MAX_DEPTH && current; depth += 1) {
    const id = current.getAttribute('id')
    if (id && id.trim()) {
      segments.unshift(`#${escapeCssIdentifier(id)}`)
      return segments.join(' > ')
    }
    const tag = current.tagName.toLowerCase()
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) break
    let index = 1
    let sibling = current.previousElementSibling
    while (sibling) {
      if (sibling.tagName === current.tagName) index += 1
      sibling = sibling.previousElementSibling
    }
    segments.unshift(`${tag}:nth-of-type(${index})`)
    if (tag === 'html') break
    current = current.parentElement
  }
  return segments.length > 0 ? segments.join(' > ') : undefined
}

function snapshotFor(element: Element): SelectorElementSnapshot {
  return {
    semid: element.getAttribute('data-semid'),
    id: element.getAttribute('id'),
    testId: element.getAttribute('data-testid'),
    testAttr: element.getAttribute('data-test'),
    name: element.getAttribute('name'),
    href: element.tagName === 'A' ? element.getAttribute('href') : null,
    cssPath: cssPathFor(element)
  }
}

/**
 * Ordered replay chain plus the legacy single selector (best entry) and the
 * accessible fallback descriptor. Computed once per captured element.
 */
function chainFor(element: Element): {
  selector: string | undefined
  selectorCandidates: string[] | undefined
  accessibleRole: string | undefined
  accessibleLabel: string | undefined
} {
  const chain = buildSelectorCandidates(snapshotFor(element))
  const accessible = buildAccessibleDescriptor({
    role: element.getAttribute('role'),
    label: element.getAttribute('aria-label')
  })
  return {
    selector: selectBestSelector(chain),
    selectorCandidates: chain.length > 0 ? chain : undefined,
    accessibleRole: accessible?.role,
    accessibleLabel: accessible?.label
  }
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

  let lastNavigatePath: string | null = null
  const emitNavigate = (): void => {
    const path = nextNavigateToEmit(lastNavigatePath, window.location.pathname)
    if (!path) return
    lastNavigatePath = path
    send([{ type: 'navigate', value: path, atMs: Date.now() }])
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', emitNavigate, { once: true })
  } else {
    emitNavigate()
  }

  // Full page loads only. Same-document (SPA) route changes are observed
  // from the main process (did-navigate-in-page): this isolated context
  // cannot patch the page's own history object.

  document.addEventListener(
    'click',
    (event) => {
      if (!active) return
      // Only real user gestures enter a recording: page scripts must not be
      // able to synthesize demonstrations (or pollute one with an assisted
      // run's own synthetic input/change events).
      if (!event.isTrusted) return
      const target = event.target
      if (!(target instanceof Element)) return
      const hit = target.closest('[data-semid],button,a,input,select,textarea,summary')
      if (!(hit instanceof Element)) return
      const rect = hit.getBoundingClientRect()
      const semid = hit.getAttribute('data-semid') ?? undefined
      const chain = chainFor(hit)
      send([
        {
          type: 'click',
          semanticId: semid,
          selector: chain.selector,
          selectorCandidates: chain.selectorCandidates,
          accessibleRole: chain.accessibleRole,
          accessibleLabel: chain.accessibleLabel,
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
      // Only real user gestures enter a recording: page scripts must not be
      // able to synthesize demonstrations (or pollute one with an assisted
      // run's own synthetic input/change events).
      if (!event.isTrusted) return
      const target = event.target
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
        return
      }
      if (target instanceof HTMLInputElement && target.type === 'password') return
      const rect = target.getBoundingClientRect()
      const chain = chainFor(target)
      send([
        {
          type: target.tagName === 'SELECT' ? 'select' : 'input_commit',
          semanticId: target.getAttribute('data-semid') ?? undefined,
          selector: chain.selector,
          selectorCandidates: chain.selectorCandidates,
          accessibleRole: chain.accessibleRole,
          accessibleLabel: chain.accessibleLabel,
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
      // Only real user gestures enter a recording: page scripts must not be
      // able to synthesize demonstrations (or pollute one with an assisted
      // run's own synthetic input/change events).
      if (!event.isTrusted) return
      const target = event.target
      if (!(target instanceof HTMLFormElement)) return
      const chain = chainFor(target)
      send([
        {
          type: 'submit',
          semanticId: target.getAttribute('data-semid') ?? undefined,
          selector: chain.selector,
          selectorCandidates: chain.selectorCandidates,
          accessibleRole: chain.accessibleRole,
          accessibleLabel: chain.accessibleLabel,
          recordIdentity: recordIdentityFor(target),
          atMs: Date.now()
        }
      ])
    },
    true
  )

  // Runner-driven highlight. Payload is a CSS selector; null clears it.
  // The preload runs before the parser, so document.head is usually still
  // null here — attach on DOMContentLoaded rather than throwing (a throw
  // would abort the rest of this script's initialization).
  const style = document.createElement('style')
  style.textContent = '.ghost-highlight{outline:3px solid #0071e3 !important;outline-offset:3px;}'
  const attachStyle = (): void => {
    document.head?.appendChild(style)
  }
  if (document.head) attachStyle()
  else document.addEventListener('DOMContentLoaded', attachStyle, { once: true })
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

