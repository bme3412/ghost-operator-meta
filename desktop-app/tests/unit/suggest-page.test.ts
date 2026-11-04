import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { ipcMain } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '../../src/main/ipc/channels'
import { registerSuggestHandlers } from '../../src/main/ipc/suggest'
import { generatePageIdeas } from '../../src/main/providers/suggest'
import { normalizePageExtract, pageExtractSnippet } from '../../src/main/scout/extract'
import { resetStoreCache } from '../../src/main/store/index'
import { registerWindow } from '../../src/main/windows/registry'
import {
  clearPageIdeasCache,
  getPageIdeas,
  minePage
} from '../../src/main/suggest/page'
import type { PageSummary } from '../../src/shared/schemas'
import type { SiteProfile } from '../../src/shared/target'

const SITE: SiteProfile = { id: 'www-ebay-com', name: 'www.ebay.com', url: 'https://www.ebay.com' }

function ebayHome(): PageSummary {
  return {
    path: '/',
    title: 'Electronics, Cars, Fashion, Collectibles & More | eBay',
    headings: ['Explore Popular Categories'],
    links: [
      { text: 'Motors', href: '/b/Motors/6000/bn_1865334' },
      { text: 'Electronics', href: '/b/Electronics/293/bn_1865678' },
      { text: 'Collectibles', href: '/b/Collectibles/1/bn_1865383' },
      { text: 'Home & Garden', href: '/b/Home-Garden/11700/bn_1865400' },
      { text: 'Sign in', href: '/signin' },
      { text: 'Help & Contact', href: '/help/home' }
    ],
    forms: [
      {
        action: '/sch/i.html',
        fields: [
          { name: '_nkw', type: 'text', placeholder: 'Search for anything' },
          {
            name: '_sacat',
            type: 'select',
            label: 'Category',
            options: ['All Categories', 'Motors', 'Electronics']
          }
        ],
        submitLabel: 'Search'
      }
    ],
    buttons: [{ label: 'Search' }],
    repeats: { listItems: 24, cards: 8 }
  }
}

function ebayListing(): PageSummary {
  return {
    path: '/itm/387123456789',
    title: 'Vintage Film Camera | eBay',
    headings: ['Vintage Film Camera'],
    links: [
      { text: 'Back to search results', href: '/sch/i.html?_nkw=camera' },
      { text: "Seller's store", href: '/str/retroshop' }
    ],
    forms: [],
    buttons: [
      { label: 'Buy It Now' },
      { label: 'Add to cart' },
      { label: 'Add to Watchlist' },
      { label: 'Make offer' }
    ]
  }
}

function chatBody(content: string | null): unknown {
  return content === null ? { choices: [] } : { choices: [{ message: { content } }] }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}

function cleanEnv(patch: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...patch } as NodeJS.ProcessEnv
}

describe('minePage', () => {
  it('mines search and browse ideas from a store home page', () => {
    const ideas = minePage(ebayHome(), SITE)
    const search = ideas.find((idea) => idea.title.startsWith('Search '))
    expect(search).toMatchObject({
      title:
        'Search www.ebay.com for an item and collect the top results (title, price, link)',
      exampleInput: 'vintage film camera',
      confidence: 'high'
    })
    expect(search?.why).toContain('Search for anything')
    expect(search?.why).toContain('Motors')
    expect(search?.cites).toEqual(['Search box "Search for anything"'])

    const browse = ideas.filter((idea) => idea.title.startsWith('Browse '))
    expect(browse.map((idea) => idea.title)).toEqual([
      'Browse Motors and list new items',
      'Browse Electronics and list new items',
      'Browse Collectibles and list new items'
    ])
    expect(browse[0]?.cites).toEqual(['Motors'])
    // Header chrome never becomes a browse idea.
    expect(ideas.some((idea) => idea.title.includes('Sign in'))).toBe(false)
    expect(ideas.some((idea) => idea.title.includes('Help'))).toBe(false)
  })

  it('mines watchlist and price-check ideas from a listing page', () => {
    const ideas = minePage(ebayListing(), SITE)
    expect(ideas.map((idea) => idea.title)).toEqual([
      'Add this item to your watchlist',
      'Check price and shipping for an item',
      "Browse Seller's store and list new items"
    ])
    expect(ideas[0]?.cites).toEqual(['Add to Watchlist'])
    expect(ideas[0]?.why).toContain('Add to Watchlist')
    expect(ideas[1]?.cites).toEqual(['Buy It Now'])
    expect(ideas[0]?.confidence).toBe('high')
    expect(ideas[1]?.confidence).toBe('high')
  })

  it('mines a listing idea from repeated detail-like links', () => {
    const page: PageSummary = {
      path: '/sch/i.html',
      title: 'camera | eBay',
      headings: [],
      links: [
        { text: 'Camera A', href: '/itm/111' },
        { text: 'Camera B', href: '/itm/222' },
        { text: 'Camera C', href: '/itm/333' },
        { text: 'Camera D', href: '/itm/444' }
      ],
      forms: [],
      buttons: [],
      repeats: { listItems: 60, cards: 0 }
    }
    const ideas = minePage(page, SITE)
    const listing = ideas.find((idea) => idea.title === 'Open each listing and extract its details')
    expect(listing).toBeDefined()
    expect(listing?.why).toContain('4 links share "/itm"')
    expect(listing?.why).toContain('60 list items')
  })

  it('flags login surfaces as needing a human step instead of hiding them', () => {
    const page: PageSummary = {
      path: '/signin',
      title: 'Sign in',
      headings: [],
      links: [],
      forms: [
        {
          action: '/signin',
          fields: [{ name: 'userid', type: 'text', label: 'Email or username' }],
          submitLabel: 'Sign in'
        }
      ],
      buttons: [{ label: 'Sign in' }]
    }
    const ideas = minePage(page, SITE)
    expect(ideas.map((idea) => idea.title)).toEqual([
      'Complete "Sign in" with human help',
      'Fill and submit Sign in'
    ])
    expect(ideas[0]?.why).toContain('only a person has')
    expect(ideas[1]?.why).toContain('human step')
  })

  it('mints stable unique ids and caps the list at six', () => {
    const ideas = minePage(ebayHome(), SITE)
    expect(ideas.length).toBeLessThanOrEqual(6)
    const ids = ideas.map((idea) => idea.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(minePage(ebayHome(), SITE).map((idea) => idea.id)).toEqual(ids)
  })

  it('yields nothing inventive on a sparse page', () => {
    const page: PageSummary = {
      path: '/',
      title: '',
      headings: [],
      links: [],
      forms: [],
      buttons: []
    }
    expect(minePage(page, SITE)).toEqual([])
  })
})

describe('page extract signals', () => {
  it('ships a syntactically valid extraction snippet', () => {
    expect(() => new Function(pageExtractSnippet())).not.toThrow()
  })

  it('normalizes placeholders, select options, and repeat counts', () => {
    const page = normalizePageExtract(
      {
        title: 'Home',
        headings: [],
        links: [],
        forms: [
          {
            fields: [
              { name: 'q', type: 'text', placeholder: 'Search for anything' },
              { name: 'cat', type: 'select', options: ['All', 'Motors'] }
            ],
            submitLabel: 'Search'
          }
        ],
        buttons: [],
        repeats: { listItems: 24, cards: 8 }
      },
      '/'
    )
    expect(page.forms[0]?.fields).toEqual([
      { name: 'q', type: 'text', placeholder: 'Search for anything' },
      { name: 'cat', type: 'select', options: ['All', 'Motors'] }
    ])
    expect(page.repeats).toEqual({ listItems: 24, cards: 8 })
  })

  it('clamps hostile repeat counts instead of throwing', () => {
    const page = normalizePageExtract(
      { title: '', headings: [], links: [], forms: [], buttons: [], repeats: { listItems: 1e9, cards: -3 } },
      '/'
    )
    expect(page.repeats).toEqual({ listItems: 500, cards: 0 })
    expect(normalizePageExtract({ title: 'x' }, '/').repeats).toBeUndefined()
  })
})

describe('suggest:page handler', () => {
  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(mkdtempSync(join(tmpdir(), 'ghost-page-')), 'state.json')
    resetStoreCache()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
  })

  it('resolves an empty result instead of rejecting when the target is unreadable', async () => {
    const sender = {} as WebContents
    registerWindow(
      'panel',
      { webContents: sender, isDestroyed: () => false, on: vi.fn() } as unknown as Electron.BrowserWindow
    )
    registerSuggestHandlers()
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, (event: IpcMainInvokeEvent, payload?: unknown) => unknown]> } }).mock.calls
    const handler = new Map(calls).get(CHANNELS.suggestPage)
    expect(handler).toBeDefined()
    // No target window is registered, so the page read fails.
    const result = (await handler!({ sender } as unknown as IpcMainInvokeEvent, {})) as {
      ideas: unknown[]
      warning: string | null
    }
    expect(result.ideas).toEqual([])
    expect(result.warning).toContain('website loads')
  })
})

describe('generatePageIdeas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws on HTTP errors so the caller falls back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, 500))
    )
    await expect(
      generatePageIdeas(
        {
          siteName: SITE.name,
          url: SITE.url,
          path: '/',
          title: 'Home',
          headings: [],
          links: [],
          forms: [],
          buttons: [],
          listItems: 0,
          cards: 0,
          heuristics: []
        },
        cleanEnv({ MODEL_API_KEY: 'key' })
      )
    ).rejects.toThrow(/HTTP 500/)
  })

  it('throws on invalid JSON so the caller falls back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(chatBody('not json {')))
    )
    await expect(
      generatePageIdeas(
        {
          siteName: SITE.name,
          url: SITE.url,
          path: '/',
          title: 'Home',
          headings: [],
          links: [],
          forms: [],
          buttons: [],
          listItems: 0,
          cards: 0,
          heuristics: []
        },
        cleanEnv({ MODEL_API_KEY: 'key' })
      )
    ).rejects.toThrow(/not JSON/)
  })
})

describe('getPageIdeas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearPageIdeasCache()
  })

  it('returns heuristic ideas with a warning when no key is set', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    const result = await getPageIdeas(
      { url: SITE.url, path: '/', page: ebayHome(), site: SITE },
      { env: cleanEnv({}) }
    )
    expect(result.source).toBe('heuristic')
    expect(result.warning).toContain('Showing ideas spotted on this page')
    expect(result.ideas.length).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to heuristics with a warning on model failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(chatBody('nope {')))
    )
    const result = await getPageIdeas(
      { url: SITE.url, path: '/', page: ebayHome(), site: SITE },
      { env: cleanEnv({ MODEL_API_KEY: 'key' }) }
    )
    expect(result.source).toBe('heuristic')
    expect(result.warning).toContain('Showing ideas spotted on this page')
    expect(result.ideas).toEqual(minePage(ebayHome(), SITE))
  })

  it('constrains AI cites to visible elements and mints ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          chatBody(
            JSON.stringify({
              ideas: [
                {
                  title: 'Search for a camera',
                  why: 'Use the search box.',
                  exampleInput: 'film camera',
                  cites: ['Search for anything', 'Invented control'],
                  confidence: 'high'
                }
              ]
            })
          )
        )
      )
    )
    const result = await getPageIdeas(
      { url: SITE.url, path: '/', page: ebayHome(), site: SITE },
      { env: cleanEnv({ MODEL_API_KEY: 'key' }) }
    )
    expect(result.source).toBe('ai')
    expect(result.warning).toBeNull()
    expect(result.ideas).toHaveLength(1)
    expect(result.ideas[0]?.cites).toEqual(['Search for anything'])
    expect(result.ideas[0]?.id).toMatch(/^page-search-for-a-camera$/)
    expect(result.ideas[0]?.exampleInput).toBe('film camera')
  })

  it('caches per URL so repeat fetches skip the model', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        chatBody(JSON.stringify({ ideas: [{ title: 'Do a thing', why: 'Because.', cites: [], confidence: 'low' }] }))
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    const input = { url: SITE.url, path: '/', page: ebayHome(), site: SITE }
    const options = { env: cleanEnv({ MODEL_API_KEY: 'key' }) }
    const first = await getPageIdeas(input, options)
    const second = await getPageIdeas(input, options)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    await getPageIdeas(input, { ...options, refresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('resolves the fast path without calling the model', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    const result = await getPageIdeas(
      { url: SITE.url, path: '/', page: ebayHome(), site: SITE },
      { env: cleanEnv({ MODEL_API_KEY: 'key' }), fast: true }
    )
    expect(result.source).toBe('heuristic')
    expect(result.warning).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
