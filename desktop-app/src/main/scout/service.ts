/**
 * On-demand site scanner. Crawls the current (or named) site's pages in a
 * dedicated hidden window, persists the page graph, and mines suggestions
 * from it. Sequential, same-origin, and bounded (pages, per-page time, and
 * total time); the window is destroyed on done, cancel, and error.
 */
import { BrowserWindow } from 'electron'
import type {
  PageSummary,
  ScoutProgress,
  ScoutStatus,
  SiteMap
} from '../../shared/schemas'
import { TARGET, type SiteProfile } from '../../shared/target'
import { broadcastLibraryChanged } from '../ipc/broadcast'
import { EVENTS } from '../ipc/channels'
import { startPageLoadWait } from '../runner/wait'
import { loadState, saveState } from '../store'
import { appendMinedSuggestions } from '../suggest'
import { mineSiteMap } from '../suggest/sitemap'
import { getTargetInfo } from '../target'
import { applyTargetGuards } from '../windows/guards'
import { baseWebPreferences } from '../windows/shared'
import {
  isScoutNavigationAllowed,
  normalizePageExtract,
  pageExtractSnippet,
  planNextPaths,
  SCOUT_MAX_PAGES,
  SCOUT_PAGE_TIMEOUT_MS,
  SCOUT_TOTAL_TIMEOUT_MS
} from './extract'

/** Minimal window surface the scanner needs; BrowserWindow satisfies it. */
export interface ScoutWindowLike {
  loadURL(url: string): Promise<void>
  destroy(): void
  isDestroyed(): boolean
  webContents: {
    executeJavaScript(code: string): Promise<unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: 'did-finish-load' | 'did-fail-load', listener: (...args: any[]) => void): void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeListener(event: 'did-finish-load' | 'did-fail-load', listener: (...args: any[]) => void): void
  }
}

type WindowFactory = (siteUrl: string) => ScoutWindowLike

function defaultWindowFactory(siteUrl: string): ScoutWindowLike {
  const window = new BrowserWindow({
    title: 'Ghost Operator Scout',
    width: 1024,
    height: 768,
    // Hidden forever: no ready-to-show handler, and nothing ever calls show().
    show: false,
    webPreferences: {
      ...baseWebPreferences(),
      additionalArguments: ['--ghost-role=scout']
    }
  })
  // Origin lock plus popup/permission denial, same as the target window.
  // The scout window is never registered, so the capture preload it inherits
  // (remote pages always match the target-role URL fallback) is denied every
  // guarded channel — including recorder:events — and scan traffic can never
  // leak into a recording.
  applyTargetGuards(window, () => siteUrl)
  return window as unknown as ScoutWindowLike
}

let windowFactory: WindowFactory = defaultWindowFactory

/** Test hook: substitute the hidden-window factory. */
export function __setScoutWindowFactoryForTests(factory: WindowFactory | null): void {
  windowFactory = factory ?? defaultWindowFactory
}

export interface ScanOptions {
  maxPages?: number
  pageTimeoutMs?: number
  totalTimeoutMs?: number
  now?: () => string
}

interface ResolvedScanOptions {
  maxPages: number
  pageTimeoutMs: number
  totalTimeoutMs: number
  now: () => string
}

interface ActiveScan {
  siteId: string
  siteUrl: string
  cancelled: boolean
  progress: ScoutProgress
}

export type ScanOutcome =
  | { status: 'done'; sitemap: SiteMap | null }
  | { status: 'cancelled'; sitemap: SiteMap | null }
  | { status: 'failed'; sitemap: SiteMap | null; error: string }

let active: ActiveScan | null = null

/** Persisted map for a site, if a scan has stored one. */
export function getSiteMap(siteId: string): SiteMap | null {
  return loadState().siteMaps?.find((map) => map.siteId === siteId) ?? null
}

/** Replace the stored map for its site id (one entry per site). */
export function upsertSiteMap(sitemap: SiteMap): SiteMap {
  const state = loadState()
  const maps = state.siteMaps ?? []
  const next = maps.some((map) => map.siteId === sitemap.siteId)
    ? maps.map((map) => (map.siteId === sitemap.siteId ? sitemap : map))
    : [...maps, sitemap]
  saveState({ ...state, siteMaps: next })
  return sitemap
}

/**
 * Resolve the scan target: the current site when no id is given. A named id
 * matches the current site or the Saltbreak profile; anything else is unknown
 * (only the current site profile is persisted).
 */
function resolveSite(siteId?: string): SiteProfile {
  const current = getTargetInfo()
  if (siteId === undefined || siteId === current.id) return current
  if (siteId === TARGET.id) {
    const url = (
      process.env.TARGET_URL ??
      process.env.SALTBREAK_URL ??
      TARGET.defaultUrl
    ).replace(/\/$/, '')
    return { id: TARGET.id, name: TARGET.name, url }
  }
  throw new Error(`Unknown site "${siteId}".`)
}

function broadcast(progress: ScoutProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(EVENTS.scoutProgress, progress)
  }
}

function updateProgress(
  scan: ActiveScan,
  update: Pick<ScoutProgress, 'pagesDone' | 'pagesTotal' | 'currentPath'>
): void {
  scan.progress = { siteId: scan.siteId, status: 'running', ...update }
  broadcast(scan.progress)
}

/** Race `task` against a timeout; runs `cleanup` (load-wait detach) on expiry. */
function withTimeout<T>(
  ms: number,
  message: string,
  task: (onTimeout: (cleanup: () => void) => void) => Promise<T>
): Promise<T> {
  let cleanup = (): void => undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      cleanup()
      reject(new Error(message))
    }, ms)
    const maybeUnref = timer as unknown as { unref?: () => void }
    if (typeof maybeUnref.unref === 'function') maybeUnref.unref()
  })
  const pending = task((fn) => {
    cleanup = fn
  })
  const clear = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }
  pending.then(clear, clear)
  return Promise.race([pending, timeout])
}

/** Navigate to `url` and extract the page, all within the per-page budget. */
async function loadAndExtract(
  window: ScoutWindowLike,
  url: string,
  snippet: string,
  pageTimeoutMs: number
): Promise<unknown> {
  return withTimeout(pageTimeoutMs, `Timed out scanning ${url}.`, async (onTimeout) => {
    // Attach before navigating so the load event cannot slip past us.
    const load = startPageLoadWait(window.webContents, { timeoutMs: pageTimeoutMs })
    onTimeout(() => load.cancel())
    try {
      await window.loadURL(url)
    } catch (error) {
      load.cancel()
      throw new Error(`Navigation to ${url} failed: ${(error as Error).message}`)
    }
    await load.promise
    return window.webContents.executeJavaScript(snippet)
  })
}

async function runScan(
  scan: ActiveScan,
  window: ScoutWindowLike,
  opts: ResolvedScanOptions
): Promise<ScanOutcome> {
  const pages: PageSummary[] = []
  const seen = new Set<string>()
  const queue: string[] = ['/']
  const deadline = Date.now() + opts.totalTimeoutMs
  const snippet = pageExtractSnippet()
  let outcome: ScanOutcome
  try {
    while (queue.length > 0 && pages.length < opts.maxPages) {
      if (scan.cancelled) break
      // Overall budget spent: stop crawling and keep the partial map.
      if (Date.now() >= deadline) break
      const path = queue.shift() as string
      if (seen.has(path)) continue
      seen.add(path)
      const url = `${scan.siteUrl}${path}`
      if (!isScoutNavigationAllowed(url, scan.siteUrl)) continue
      updateProgress(scan, {
        pagesDone: pages.length,
        pagesTotal: Math.min(opts.maxPages, seen.size + queue.length),
        currentPath: path
      })
      try {
        const raw = await loadAndExtract(window, url, snippet, opts.pageTimeoutMs)
        if (scan.cancelled) break
        const page = normalizePageExtract(raw, path)
        pages.push(page)
        const budget = opts.maxPages - seen.size - queue.length
        for (const next of planNextPaths({
          links: page.links,
          siteUrl: scan.siteUrl,
          currentPath: path,
          seen: [...seen, ...queue],
          limit: Math.max(0, budget)
        })) {
          queue.push(next)
        }
      } catch {
        // A failed page (timeout, load error, extract error) is skipped;
        // the scan continues with the rest of the queue.
      }
    }
    const sitemap: SiteMap | null =
      pages.length > 0 ? { siteId: scan.siteId, scannedAt: opts.now(), pages } : null
    if (sitemap) upsertSiteMap(sitemap)
    if (scan.cancelled) {
      outcome = { status: 'cancelled', sitemap }
    } else {
      outcome = { status: 'done', sitemap }
      if (sitemap) {
        appendMinedSuggestions(mineSiteMap(sitemap, { now: opts.now }))
      }
    }
    if (sitemap) broadcastLibraryChanged()
  } catch (error) {
    outcome = { status: 'failed', sitemap: null, error: (error as Error).message }
  } finally {
    try {
      if (!window.isDestroyed()) window.destroy()
    } catch {
      // Already gone; nothing to clean up.
    }
    if (active === scan) active = null
  }
  broadcast({
    siteId: scan.siteId,
    status: outcome.status,
    pagesDone: pages.length,
    pagesTotal: pages.length,
    currentPath: '',
    ...(outcome.status === 'failed' ? { error: outcome.error } : {})
  })
  return outcome
}

/**
 * Start a scan of the current (or named) site. Throws when a scan is already
 * running or the site id is unknown. The crawl runs detached; completion,
 * cancellation, and failure arrive via the scout-progress push event and the
 * returned `done` promise. Test and IPC layers use `status` for the reply.
 */
export function startScan(
  siteId?: string,
  opts: ScanOptions = {}
): { status: ScoutStatus; done: Promise<ScanOutcome> } {
  if (active) throw new Error('A site scan is already running.')
  const site = resolveSite(siteId)
  const resolved: ResolvedScanOptions = {
    maxPages: opts.maxPages ?? SCOUT_MAX_PAGES,
    pageTimeoutMs: opts.pageTimeoutMs ?? SCOUT_PAGE_TIMEOUT_MS,
    totalTimeoutMs: opts.totalTimeoutMs ?? SCOUT_TOTAL_TIMEOUT_MS,
    now: opts.now ?? (() => new Date().toISOString())
  }
  const scan: ActiveScan = {
    siteId: site.id,
    siteUrl: site.url,
    cancelled: false,
    progress: { siteId: site.id, status: 'running', pagesDone: 0, pagesTotal: 1, currentPath: '/' }
  }
  active = scan
  let window: ScoutWindowLike
  try {
    window = windowFactory(site.url)
  } catch (error) {
    active = null
    throw error
  }
  broadcast(scan.progress)
  const done = runScan(scan, window, resolved)
  return { status: getScoutStatus(), done }
}

/** Request cancellation of the running scan, if any. The loop stops between pages. */
export function cancelScan(): ScoutStatus {
  if (active) active.cancelled = true
  return getScoutStatus()
}

export function getScoutStatus(): ScoutStatus {
  if (active) {
    return {
      running: true,
      siteId: active.siteId,
      progress: { ...active.progress },
      sitemap: getSiteMap(active.siteId)
    }
  }
  const siteId = getTargetInfo().id
  return { running: false, siteId, progress: null, sitemap: getSiteMap(siteId) }
}
