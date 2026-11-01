import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { BrowserWindow, ipcMain } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '../../src/main/ipc/channels'
import { registerScoutHandlers } from '../../src/main/ipc/scout'
import {
  isScoutNavigationAllowed,
  normalizePageExtract,
  pageExtractSnippet,
  planNextPaths,
  SCOUT_MAX_PAGES,
  SCOUT_PAGE_TIMEOUT_MS,
  SCOUT_TOTAL_TIMEOUT_MS
} from '../../src/main/scout/extract'
import {
  cancelScan,
  getScoutStatus,
  getSiteMap,
  startScan,
  upsertSiteMap,
  __setScoutWindowFactoryForTests,
  type ScoutWindowLike
} from '../../src/main/scout/service'
import { resetStoreCache } from '../../src/main/store/index'
import { listSuggestions } from '../../src/main/suggest/index'
import { mineSiteMap } from '../../src/main/suggest/sitemap'
import { registerWindow, type WindowRole } from '../../src/main/windows/registry'
import { scoutHrefPath } from '../../src/shared/scout'
import {
  PersistedState,
  defaultState,
  type PageSummary,
  type SiteMap
} from '../../src/shared/schemas'

const NOW = '2026-10-31T12:00:00.000Z'
const SITE_URL = 'http://localhost:3000'

function isolateState(): void {
  process.env.GHOST_STATE_PATH = join(mkdtempSync(join(tmpdir(), 'ghost-scout-')), 'state.json')
  resetStoreCache()
}

function pageSummary(partial: Partial<PageSummary> = {}): PageSummary {
  return {
    path: '/',
    title: 'Home',
    headings: [],
    links: [],
    forms: [],
    buttons: [],
    ...partial
  }
}

function siteMap(partial: Partial<SiteMap> = {}): SiteMap {
  return {
    siteId: 'saltbreak',
    scannedAt: NOW,
    pages: [],
    ...partial
  }
}

describe('scout budgets', () => {
  it('caps pages, per-page time, and total time', () => {
    expect(SCOUT_MAX_PAGES).toBe(25)
    expect(SCOUT_PAGE_TIMEOUT_MS).toBe(10_000)
    expect(SCOUT_TOTAL_TIMEOUT_MS).toBe(90_000)
  })

  it('ships a self-contained extraction snippet', () => {
    const snippet = pageExtractSnippet()
    expect(snippet).toContain('querySelectorAll')
    expect(snippet).toContain('data-semid')
    // No template interpolation or backticks: safe to ship through executeJavaScript.
    expect(snippet).not.toContain('`')
    expect(snippet).not.toContain('${')
  })
})

describe('normalizePageExtract', () => {
  it('normalizes a full raw payload', () => {
    const page = normalizePageExtract(
      {
        title: 'Inbox',
        headings: ['Tickets', 'Open'],
        links: [{ text: 'T-101', href: '/staff/tickets/T-101' }],
        forms: [
          {
            action: '/staff/resolve',
            fields: [{ name: 'ticketId', type: 'text', label: 'Ticket' }],
            submitLabel: 'Resolve'
          }
        ],
        buttons: [{ label: 'Resolve', semid: 'ticket-resolve-T-101' }]
      },
      '/staff/inbox'
    )
    expect(page).toEqual({
      path: '/staff/inbox',
      title: 'Inbox',
      headings: ['Tickets', 'Open'],
      links: [{ text: 'T-101', href: '/staff/tickets/T-101' }],
      forms: [
        {
          action: '/staff/resolve',
          fields: [{ name: 'ticketId', type: 'text', label: 'Ticket' }],
          submitLabel: 'Resolve'
        }
      ],
      buttons: [{ label: 'Resolve', semid: 'ticket-resolve-T-101' }]
    })
  })

  it('degrades hostile page shapes to an empty page without throwing', () => {
    expect(normalizePageExtract(null, '/')).toEqual(pageSummary({ path: '/', title: '' }))
    expect(normalizePageExtract('nope', '/')).toEqual(pageSummary({ path: '/', title: '' }))
    expect(normalizePageExtract([], '/x')).toEqual(pageSummary({ path: '/x', title: '' }))
    const junk = normalizePageExtract(
      {
        title: 42,
        headings: ['ok', 7, null, 'x'.repeat(500)],
        links: [{ text: 'no href' }, { href: 9 }, null, { text: 'y'.repeat(500), href: '/a' }],
        forms: [{ fields: [{ type: 'text' }, null, { name: 'n', type: 5 }] }],
        buttons: [{}, { label: '', semid: 's' }]
      },
      '/j'
    )
    expect(junk.path).toBe('/j')
    expect(junk.title).toBe('')
    expect(junk.headings).toEqual(['ok', 'x'.repeat(200)])
    expect(junk.links).toEqual([{ text: 'y'.repeat(200), href: '/a' }])
    expect(junk.forms).toEqual([{ fields: [{ name: 'n', type: 'text' }], submitLabel: '' }])
    expect(junk.buttons).toEqual([{ label: '', semid: 's' }])
  })

  it('clamps oversized collections', () => {
    const page = normalizePageExtract(
      {
        headings: Array.from({ length: 500 }, (_, i) => `h${i}`),
        links: Array.from({ length: 600 }, (_, i) => ({ text: `l${i}`, href: `/p${i}` })),
        forms: Array.from({ length: 60 }, () => ({ fields: [], submitLabel: '' })),
        buttons: Array.from({ length: 300 }, (_, i) => ({ label: `b${i}` }))
      },
      '/'
    )
    expect(page.headings).toHaveLength(100)
    expect(page.links).toHaveLength(500)
    expect(page.forms).toHaveLength(50)
    expect(page.buttons).toHaveLength(200)
  })
})

describe('planNextPaths', () => {
  const seen = new Set<string>(['/'])

  it('keeps same-origin paths and resolves relatives against the current page', () => {
    expect(
      planNextPaths({
        links: [
          { href: '/staff/inbox' },
          { href: 'http://localhost:3000/staff/tickets/T-101?tab=all#row' },
          { href: 'T-102' }
        ],
        siteUrl: SITE_URL,
        currentPath: '/staff/tickets',
        seen,
        limit: 10
      })
    ).toEqual(['/staff/inbox', '/staff/tickets/T-101', '/staff/T-102'])
  })

  it('drops cross-origin, non-http, fragment, and unparseable hrefs', () => {
    expect(
      planNextPaths({
        links: [
          { href: 'http://evil.example.com/' },
          { href: 'http://localhost:3001/other-port' },
          { href: 'https://localhost:3000/other-scheme' },
          { href: 'mailto:a@b.c' },
          { href: 'javascript:alert(1)' },
          { href: 'tel:+123' },
          { href: '#fragment' },
          { href: '' },
          { href: 'http://[::1' }
        ],
        siteUrl: SITE_URL,
        currentPath: '/',
        seen: new Set(),
        limit: 10
      })
    ).toEqual([])
  })

  it('dedupes against seen and within the batch, and respects the limit', () => {
    expect(
      planNextPaths({
        links: [
          { href: '/seen' },
          { href: '/a' },
          { href: '/a?x=1' },
          { href: '/b' },
          { href: '/c' }
        ],
        siteUrl: SITE_URL,
        currentPath: '/',
        seen: ['/seen'],
        limit: 2
      })
    ).toEqual(['/a', '/b'])
  })

  it('plans nothing without budget or with an unparseable site URL', () => {
    const args = {
      links: [{ href: '/a' }],
      siteUrl: SITE_URL,
      currentPath: '/',
      seen: new Set<string>(),
      limit: 5
    }
    expect(planNextPaths({ ...args, limit: 0 })).toEqual([])
    expect(planNextPaths({ ...args, siteUrl: '::::' })).toEqual([])
  })
})

describe('scout origin lock', () => {
  it('allows the scan origin and the blank document only', () => {
    expect(isScoutNavigationAllowed(`${SITE_URL}/staff/inbox?a=b`, SITE_URL)).toBe(true)
    expect(isScoutNavigationAllowed('about:blank', SITE_URL)).toBe(true)
    expect(isScoutNavigationAllowed('http://evil.example.com/', SITE_URL)).toBe(false)
    expect(isScoutNavigationAllowed('http://localhost:3001/', SITE_URL)).toBe(false)
    expect(isScoutNavigationAllowed('javascript:alert(1)', SITE_URL)).toBe(false)
  })
})

describe('scoutHrefPath', () => {
  it('resolves absolute and relative hrefs to pathnames', () => {
    expect(scoutHrefPath('/a/b?x=1#f')).toBe('/a/b')
    expect(scoutHrefPath('http://localhost:3000/a')).toBe('/a')
    expect(scoutHrefPath('T-101', '/staff/tickets')).toBe('/staff/T-101')
  })

  it('rejects non-navigable hrefs', () => {
    expect(scoutHrefPath('#top')).toBeNull()
    expect(scoutHrefPath('')).toBeNull()
    expect(scoutHrefPath('mailto:a@b.c')).toBeNull()
    expect(scoutHrefPath('javascript:alert(1)')).toBeNull()
  })
})

describe('mineSiteMap', () => {
  it('mines automate-submission suggestions from pages with forms', () => {
    const mined = mineSiteMap(
      siteMap({
        pages: [
          pageSummary({
            path: '/staff/inbox',
            title: 'Inbox',
            forms: [
              {
                action: '/resolve',
                fields: [
                  { name: 'ticketId', type: 'text', label: 'Ticket' },
                  { name: 'note', type: 'text' }
                ],
                submitLabel: 'Resolve'
              }
            ],
            buttons: [{ label: 'Resolve', semid: 'ticket-resolve' }]
          })
        ]
      }),
      { now: () => NOW }
    )
    expect(mined).toHaveLength(1)
    expect(mined[0]).toMatchObject({
      siteId: 'saltbreak',
      title: 'Automate submission on /staff/inbox',
      status: 'new',
      createdAt: NOW
    })
    expect(mined[0]!.why).toContain('/staff/inbox')
    expect(mined[0]!.evidence.pages).toEqual(['/staff/inbox'])
    expect(mined[0]!.evidence.selectors).toEqual([
      '[name="ticketId"]',
      '[name="note"]',
      '[data-semid="ticket-resolve"]'
    ])
    expect(mined[0]!.evidence.sourceRecordingId).toBeNull()
  })

  it('mines review-flow suggestions from ticket-like list+detail patterns', () => {
    const mined = mineSiteMap(
      siteMap({
        pages: [
          pageSummary({
            path: '/staff/inbox',
            links: [
              { text: 'T-101', href: '/staff/tickets/T-101' },
              { text: 'T-102', href: '/staff/tickets/T-102' }
            ]
          }),
          pageSummary({ path: '/staff/tickets/T-101', title: 'T-101' })
        ]
      }),
      { now: () => NOW }
    )
    expect(mined).toHaveLength(1)
    expect(mined[0]!.title).toBe('Review the /staff/tickets list end to end')
    expect(mined[0]!.why).toContain('/staff/inbox')
    expect(mined[0]!.evidence.pages).toContain('/staff/inbox')
    expect(mined[0]!.evidence.pages).toContain('/staff/tickets/T-101')
    expect(mined[0]!.evidence.sourceRecordingId).toBeNull()
  })

  it('ignores sparse or non-record link groups', () => {
    const mined = mineSiteMap(
      siteMap({
        pages: [
          pageSummary({
            path: '/',
            title: 'Home',
            links: [
              { text: 'Inbox', href: '/staff/inbox' },
              { text: 'About', href: '/about' }
            ]
          })
        ]
      })
    )
    expect(mined).toEqual([])
    expect(mineSiteMap(siteMap())).toEqual([])
  })

  it('assigns stable ids across runs', () => {
    const map = siteMap({
      pages: [
        pageSummary({
          path: '/f',
          forms: [{ fields: [{ name: 'q', type: 'text' }], submitLabel: 'Go' }]
        })
      ]
    })
    const first = mineSiteMap(map, { now: () => NOW })
    const second = mineSiteMap(map, { now: () => '2030-01-01T00:00:00.000Z' })
    expect(first).toHaveLength(1)
    expect(second[0]!.id).toBe(first[0]!.id)
    expect(second[0]!.createdAt).not.toBe(first[0]!.createdAt)
  })
})

describe('site map store', () => {
  beforeEach(isolateState)

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
  })

  it('keeps siteMaps optional on the current store schema', () => {
    expect(PersistedState.shape.schemaVersion.value).toBe(6)
    expect(defaultState()).not.toHaveProperty('siteMaps')
    expect(PersistedState.parse(defaultState())).not.toHaveProperty('siteMaps')
    const map = siteMap()
    const parsed = PersistedState.parse({ ...defaultState(), siteMaps: [map] })
    expect(parsed.siteMaps).toEqual([map])
  })

  it('round-trips one map per site id', () => {
    expect(getSiteMap('saltbreak')).toBeNull()
    upsertSiteMap(siteMap({ pages: [pageSummary({ path: '/a' })] }))
    upsertSiteMap(siteMap({ siteId: 'other', pages: [pageSummary({ path: '/b' })] }))
    expect(getSiteMap('saltbreak')!.pages.map((p) => p.path)).toEqual(['/a'])
    // Re-scanning replaces the entry for that site instead of appending.
    upsertSiteMap(siteMap({ scannedAt: '2030-01-01T00:00:00.000Z' }))
    resetStoreCache()
    expect(getSiteMap('saltbreak')).toMatchObject({
      scannedAt: '2030-01-01T00:00:00.000Z',
      pages: []
    })
    expect(getSiteMap('other')!.pages.map((p) => p.path)).toEqual(['/b'])
  })
})

/** Fake hidden window serving canned extraction payloads per pathname. */
function servingWindow(payloads: Map<string, unknown>): ScoutWindowLike & { destroyed: boolean } {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  let current = '/'
  let destroyed = false
  const fire = (event: string, ...args: unknown[]): void => {
    for (const listener of listeners.get(event) ?? []) listener(...args)
  }
  return {
    get destroyed() {
      return destroyed
    },
    async loadURL(url: string): Promise<void> {
      current = new URL(url).pathname
      queueMicrotask(() => fire('did-finish-load'))
    },
    destroy(): void {
      destroyed = true
    },
    isDestroyed(): boolean {
      return destroyed
    },
    webContents: {
      async executeJavaScript(): Promise<unknown> {
        return (
          payloads.get(current) ?? {
            title: '',
            headings: [],
            links: [],
            forms: [],
            buttons: []
          }
        )
      },
      on(event, listener): void {
        const set = listeners.get(event) ?? new Set()
        set.add(listener as (...args: unknown[]) => void)
        listeners.set(event, set)
      },
      removeListener(event, listener): void {
        listeners.get(event)?.delete(listener as (...args: unknown[]) => void)
      }
    }
  }
}

function hangingWindow(): ScoutWindowLike & { destroyed: boolean } {
  let destroyed = false
  return {
    get destroyed() {
      return destroyed
    },
    loadURL: () => new Promise<void>(() => undefined),
    destroy(): void {
      destroyed = true
    },
    isDestroyed(): boolean {
      return destroyed
    },
    webContents: {
      executeJavaScript: () => new Promise<unknown>(() => undefined),
      on: () => undefined,
      removeListener: () => undefined
    }
  }
}

describe('scout service', () => {
  beforeEach(() => {
    isolateState()
    ;(
      BrowserWindow as unknown as { getAllWindows: () => Array<{ webContents: { send: unknown } }> }
    ).getAllWindows = () => []
  })

  afterEach(() => {
    __setScoutWindowFactoryForTests(null)
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
  })

  it('crawls same-origin pages, persists the map, and mines suggestions', async () => {
    const window = servingWindow(
      new Map<string, unknown>([
        [
          '/',
          {
            title: 'Home',
            headings: ['Welcome'],
            links: [
              { text: 'Inbox', href: '/staff/inbox' },
              { text: 'Evil', href: 'http://evil.example.com/' }
            ],
            forms: [],
            buttons: []
          }
        ],
        [
          '/staff/inbox',
          {
            title: 'Inbox',
            headings: [],
            links: [],
            forms: [
              {
                action: '/resolve',
                fields: [{ name: 'ticketId', type: 'text' }],
                submitLabel: 'Resolve'
              }
            ],
            buttons: []
          }
        ]
      ])
    )
    __setScoutWindowFactoryForTests(() => window)
    const { status, done } = startScan(undefined, {
      pageTimeoutMs: 1000,
      totalTimeoutMs: 5000,
      now: () => NOW
    })
    expect(status.running).toBe(true)
    const outcome = await done
    expect(outcome.status).toBe('done')
    expect(window.destroyed).toBe(true)
    const stored = getSiteMap('saltbreak')
    expect(stored).toMatchObject({ siteId: 'saltbreak', scannedAt: NOW })
    expect(stored!.pages.map((page) => page.path)).toEqual(['/', '/staff/inbox'])
    expect(stored!.pages[0]!.headings).toEqual(['Welcome'])
    // Completion mined the form page into a suggestion.
    expect(listSuggestions('saltbreak').map((s) => s.title)).toEqual([
      'Automate submission on /staff/inbox'
    ])
    expect(getScoutStatus()).toMatchObject({ running: false, siteId: 'saltbreak' })
    expect(getScoutStatus().sitemap!.pages).toHaveLength(2)
  })

  it('enforces the page cap across the crawl', async () => {
    const payloads = new Map<string, unknown>()
    payloads.set('/', {
      title: 'Home',
      headings: [],
      links: [{ text: 'a', href: '/a' }],
      forms: [],
      buttons: []
    })
    for (const path of ['/a', '/b', '/c']) {
      const next = path === '/a' ? '/b' : path === '/b' ? '/c' : '/d'
      payloads.set(path, {
        title: path,
        headings: [],
        links: [{ text: next, href: next }],
        forms: [],
        buttons: []
      })
    }
    const window = servingWindow(payloads)
    __setScoutWindowFactoryForTests(() => window)
    const { done } = startScan(undefined, {
      maxPages: 2,
      pageTimeoutMs: 1000,
      totalTimeoutMs: 5000,
      now: () => NOW
    })
    const outcome = await done
    expect(outcome.status).toBe('done')
    expect(getSiteMap('saltbreak')!.pages.map((page) => page.path)).toEqual(['/', '/a'])
  })

  it('skips timed-out pages and keeps the rest of the map', async () => {
    const window = servingWindow(
      new Map<string, unknown>([
        [
          '/',
          {
            title: 'Home',
            headings: [],
            links: [
              { text: 'slow', href: '/slow' },
              { text: 'fast', href: '/fast' }
            ],
            forms: [],
            buttons: []
          }
        ],
        ['/fast', { title: 'Fast', headings: [], links: [], forms: [], buttons: [] }]
      ])
    )
    // /slow never finishes loading; /fast serves immediately.
    const delegate = window.loadURL.bind(window)
    window.loadURL = async (url: string): Promise<void> => {
      if (new URL(url).pathname === '/slow') {
        await new Promise<void>(() => undefined)
        return
      }
      await delegate(url)
    }
    __setScoutWindowFactoryForTests(() => window)
    const { done } = startScan(undefined, {
      pageTimeoutMs: 30,
      totalTimeoutMs: 5000,
      now: () => NOW
    })
    const outcome = await done
    expect(outcome.status).toBe('done')
    expect(getSiteMap('saltbreak')!.pages.map((page) => page.path)).toEqual(['/', '/fast'])
  })

  it('rejects concurrent scans and destroys the window on cancel', async () => {
    const window = hangingWindow()
    __setScoutWindowFactoryForTests(() => window)
    const first = startScan(undefined, { pageTimeoutMs: 50, totalTimeoutMs: 500 })
    expect(() => startScan()).toThrow(/already running/)
    expect(getScoutStatus().running).toBe(true)
    cancelScan()
    const outcome = await first.done
    expect(outcome.status).toBe('cancelled')
    expect(window.destroyed).toBe(true)
    expect(getScoutStatus().running).toBe(false)
    // A cancelled scan releases the lock; cancelling while idle is a no-op.
    expect(cancelScan().running).toBe(false)
  })

  it('rejects unknown site ids without starting a scan', () => {
    expect(() => startScan('nope')).toThrow(/Unknown site/)
    expect(getScoutStatus().running).toBe(false)
  })
})

function fakeSender(): WebContents {
  return {} as WebContents
}

function fakeEvent(sender: WebContents): IpcMainInvokeEvent {
  return { sender } as unknown as IpcMainInvokeEvent
}

function register(role: WindowRole, sender: WebContents): void {
  registerWindow(
    role,
    { webContents: sender, isDestroyed: () => false, on: vi.fn() } as unknown as Electron.BrowserWindow
  )
}

type Handler = (event: IpcMainInvokeEvent, payload?: unknown) => unknown

function handlers(): Map<string, Handler> {
  const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Handler]> } }).mock.calls
  return new Map(calls)
}

describe('scout IPC', () => {
  beforeEach(() => {
    isolateState()
    vi.clearAllMocks()
    ;(
      BrowserWindow as unknown as { getAllWindows: () => Array<{ webContents: { send: unknown } }> }
    ).getAllWindows = () => []
    register('panel', fakeSender())
    register('target', fakeSender())
    registerScoutHandlers()
  })

  afterEach(() => {
    __setScoutWindowFactoryForTests(null)
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
  })

  it('registers the scout channels', () => {
    const map = handlers()
    expect(map.has(CHANNELS.scoutStart)).toBe(true)
    expect(map.has(CHANNELS.scoutCancel)).toBe(true)
    expect(map.has(CHANNELS.scoutStatus)).toBe(true)
  })

  it('reports status and cancels from app windows', async () => {
    const panelSender = fakeSender()
    register('panel', panelSender)
    const event = fakeEvent(panelSender)
    const map = handlers()
    expect(await map.get(CHANNELS.scoutStatus)!(event)).toMatchObject({ running: false })
    expect(await map.get(CHANNELS.scoutCancel)!(event)).toMatchObject({ running: false })
  })

  it('rejects scout channels from the target window', () => {
    const targetSender = fakeSender()
    register('target', targetSender)
    const event = fakeEvent(targetSender)
    const map = handlers()
    expect(() => map.get(CHANNELS.scoutStart)!(event, {})).toThrow(/Forbidden/)
    expect(() => map.get(CHANNELS.scoutCancel)!(event)).toThrow(/Forbidden/)
    expect(() => map.get(CHANNELS.scoutStatus)!(event)).toThrow(/Forbidden/)
  })
})
