import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { BrowserWindow, ipcMain } from 'electron'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '../../src/main/ipc/channels'
import { registerSuggestHandlers } from '../../src/main/ipc/suggest'
import {
  assembleSuggestInput,
  buildSuggestUserMessage,
  generateSuggestedWorkflows,
  META_SUGGEST_PROMPT,
  SUGGEST_POLISH_MAX_PAGES,
  SUGGEST_POLISH_MAX_RESULTS,
  SUGGEST_POLISH_MAX_SUGGESTIONS,
  SuggestedWorkflows,
  type SuggestPolishInput
} from '../../src/main/providers/suggest'
import { resetStoreCache } from '../../src/main/store/index'
import {
  appendMinedSuggestions,
  listSuggestions,
  listSuggestionsPolished,
  suggestionIdFor
} from '../../src/main/suggest/index'
import { registerWindow, type WindowRole } from '../../src/main/windows/registry'
import type {
  PageSummary,
  SiteMap,
  Suggestion as SuggestionType
} from '../../src/shared/schemas'

const HERE = dirname(fileURLToPath(import.meta.url))
const NOW = '2026-10-31T12:00:00.000Z'

/** Isolated env carrying exactly the given keys (no ambient leakage). */
function cleanEnv(patch: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...patch } as NodeJS.ProcessEnv
}

function suggestion(partial: Partial<SuggestionType> = {}): SuggestionType {
  return {
    id: 'sug-1',
    siteId: 'example-com',
    title: 'Turn this click flow into a macro',
    why: '3 clicks (#0, #1, #2).',
    evidence: { pages: ['/queue'], selectors: ['[data-semid="a"]'], sourceRecordingId: 'rec-1' },
    status: 'new',
    createdAt: NOW,
    ...partial
  }
}

function page(partial: Partial<PageSummary> = {}): PageSummary {
  return {
    path: '/queue',
    title: 'Work queue',
    headings: ['Open items'],
    links: [{ text: 'Record', href: '/records/R-7' }],
    forms: [{ action: '/search', fields: [{ name: 'q', type: 'text' }], submitLabel: 'Search' }],
    buttons: [{ label: 'Refresh', semid: 'refresh' }],
    ...partial
  }
}

function siteMap(pages: PageSummary[]): SiteMap {
  return { siteId: 'example-com', scannedAt: NOW, pages }
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

describe('suggest prompt generality guard', () => {
  it('exports a prompt with no site-specific tokens', () => {
    expect(META_SUGGEST_PROMPT.toLowerCase()).not.toContain('saltbreak')
    expect(META_SUGGEST_PROMPT).not.toContain('T-101')
    expect(META_SUGGEST_PROMPT).not.toContain('ticketId')
    expect(META_SUGGEST_PROMPT.toLowerCase()).not.toContain('ticket')
  })

  it('keeps the suggest prompt module free of site-specific tokens', () => {
    const source = readFileSync(join(HERE, '../../src/main/providers/suggest.ts'), 'utf8')
    expect(source.toLowerCase()).not.toContain('saltbreak')
    expect(source.toLowerCase()).not.toContain('ticket')
    for (const token of ['T-101', 'ticketId']) {
      expect(source).not.toContain(token)
    }
  })

  it('keeps the merge/rank/grounding/confidence rules', () => {
    for (const anchor of [
      'workflows',
      'evidencePages',
      'merge',
      'automatable',
      'actionable',
      'confidence',
      'low',
      'never invent'
    ]) {
      expect(META_SUGGEST_PROMPT).toContain(anchor)
    }
  })
})

describe('suggest input assembly', () => {
  it('caps heuristic suggestions at ten, keeping the first', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      suggestion({ id: `sug-${i}`, title: `Suggestion ${i}` })
    )
    const input = assembleSuggestInput('example-com', rows, null)
    expect(SUGGEST_POLISH_MAX_SUGGESTIONS).toBe(10)
    expect(input.suggestions).toHaveLength(10)
    expect(input.suggestions[0]!.title).toBe('Suggestion 0')
    expect(input.suggestions[9]!.title).toBe('Suggestion 9')
  })

  it('caps pages and per-page fields', () => {
    const pages = Array.from({ length: 14 }, (_, i) =>
      page({
        path: `/p-${i}`,
        headings: Array.from({ length: 10 }, (_, h) => `H${h}`),
        links: Array.from({ length: 12 }, (_, l) => ({ text: `L${l}`, href: `/x-${l}` })),
        forms: Array.from({ length: 6 }, (_, f) => ({
          action: `/f-${f}`,
          fields: Array.from({ length: 10 }, (_, g) => ({ name: `f${g}`, type: 'text' })),
          submitLabel: 'Go'
        }))
      })
    )
    const input = assembleSuggestInput('example-com', [], siteMap(pages))
    expect(SUGGEST_POLISH_MAX_PAGES).toBe(12)
    expect(input.pages).toHaveLength(12)
    expect(input.pages[0]!.headings).toHaveLength(8)
    expect(input.pages[0]!.links).toHaveLength(10)
    expect(input.pages[0]!.forms).toHaveLength(4)
    expect(input.pages[0]!.forms[0]!.fields).toHaveLength(8)
  })

  it('truncates long titles and reasons, and tolerates a missing sitemap', () => {
    const input = assembleSuggestInput(
      'example-com',
      [suggestion({ title: 't'.repeat(200), why: 'w'.repeat(600) })],
      null
    )
    expect(input.siteId).toBe('example-com')
    expect(input.pages).toEqual([])
    expect(input.suggestions[0]!.title).toBe(`${'t'.repeat(160)}…`)
    expect(input.suggestions[0]!.why).toBe(`${'w'.repeat(500)}…`)
  })

  it('renders the site id, suggestions, and page summaries into the user message', () => {
    const input: SuggestPolishInput = {
      siteId: 'example-com',
      suggestions: [{ title: 'Do the thing', why: 'Because reasons.', evidencePages: ['/queue'] }],
      pages: [
        { path: '/queue', title: 'Queue', headings: [], links: [], forms: [], buttons: 1 }
      ]
    }
    const message = buildSuggestUserMessage(input)
    expect(message).toContain('example-com')
    expect(message).toContain('Do the thing')
    expect(message).toContain('/queue')
  })
})

describe('SuggestedWorkflows schema', () => {
  it('accepts a valid list and defaults missing evidence pages', () => {
    const parsed = SuggestedWorkflows.parse([
      { title: 'Review the queue end to end', why: 'Three records link here.', confidence: 'high' },
      { title: 'Automate search', why: 'Thin evidence.', evidencePages: ['/search'], confidence: 'low' }
    ])
    expect(parsed).toHaveLength(2)
    expect(parsed[0]!.evidencePages).toEqual([])
    expect(parsed[1]!.confidence).toBe('low')
  })

  it('rejects empty titles, bad confidence, and non-list shapes', () => {
    expect(() =>
      SuggestedWorkflows.parse([{ title: '', why: 'x', confidence: 'high' }])
    ).toThrow()
    expect(() =>
      SuggestedWorkflows.parse([{ title: 'T', why: 'x', confidence: 'maybe' }])
    ).toThrow()
    expect(() =>
      SuggestedWorkflows.parse([{ title: 'T', why: 'x', evidencePages: 'nope', confidence: 'low' }])
    ).toThrow()
    expect(() => SuggestedWorkflows.parse({ title: 'T' })).toThrow()
  })
})

describe('suggest transport', () => {
  const input: SuggestPolishInput = {
    siteId: 'example-com',
    suggestions: [{ title: 'Do the thing', why: 'Because.', evidencePages: [] }],
    pages: []
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws without a model key', async () => {
    await expect(generateSuggestedWorkflows(input, cleanEnv({}))).rejects.toThrow(/MODEL_API_KEY/)
  })

  it('posts the prompt and returns the validated workflows', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        chatBody(
          JSON.stringify({
            workflows: [{ title: 'Walk the queue', why: 'Repeated flow.', confidence: 'high' }]
          })
        )
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    const workflows = await generateSuggestedWorkflows(input, cleanEnv({ MODEL_API_KEY: 'sk-test' }))
    expect(workflows).toEqual([
      { title: 'Walk the queue', why: 'Repeated flow.', evidencePages: [], confidence: 'high' }
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe('https://api.meta.ai/v1/chat/completions')
    const body = JSON.parse(init.body) as {
      model: string
      temperature: number
      messages: Array<{ role: string; content: string }>
    }
    expect(body.model).toBe('muse-spark-1.3')
    expect(body.temperature).toBe(0)
    expect(body.messages[0]).toEqual({ role: 'system', content: META_SUGGEST_PROMPT })
    expect(body.messages[1]!.content).toContain('example-com')
  })

  it('honors base-url and model overrides', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(chatBody(JSON.stringify({ workflows: [] }))))
    vi.stubGlobal('fetch', fetchMock)
    await generateSuggestedWorkflows(
      input,
      cleanEnv({ MODEL_API_KEY: 'sk-test', META_BASE_URL: 'https://proxy.local/v2/', SPARK_MODEL: 'custom' })
    )
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe('https://proxy.local/v2/chat/completions')
    expect((JSON.parse(init.body) as { model: string }).model).toBe('custom')
  })

  it('throws on HTTP errors, empty content, and non-JSON content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)))
    await expect(
      generateSuggestedWorkflows(input, cleanEnv({ MODEL_API_KEY: 'sk-test' }))
    ).rejects.toThrow(/HTTP 500/)

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(chatBody(null))))
    await expect(
      generateSuggestedWorkflows(input, cleanEnv({ MODEL_API_KEY: 'sk-test' }))
    ).rejects.toThrow(/no message content/)

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(chatBody('not json'))))
    await expect(
      generateSuggestedWorkflows(input, cleanEnv({ MODEL_API_KEY: 'sk-test' }))
    ).rejects.toThrow(/not JSON/)
  })

  it('caps the kept results at ten', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      title: `Workflow ${i}`,
      why: 'x',
      confidence: 'low' as const
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(chatBody(JSON.stringify({ workflows: many })))))
    const workflows = await generateSuggestedWorkflows(input, cleanEnv({ MODEL_API_KEY: 'sk-test' }))
    expect(SUGGEST_POLISH_MAX_RESULTS).toBe(10)
    expect(workflows).toHaveLength(10)
  })
})

describe('polish fallback', () => {
  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(mkdtempSync(join(tmpdir(), 'ghost-polish-')), 'state.json')
    resetStoreCache()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
    vi.unstubAllGlobals()
  })

  it('returns heuristics unchanged with a warning when no key is set', async () => {
    appendMinedSuggestions([suggestion()])
    for (const env of [cleanEnv({}), cleanEnv({ MODEL_API_KEY: '   ' })]) {
      const result = await listSuggestionsPolished('example-com', { env })
      expect(result.warning).toMatch(/MODEL_API_KEY/)
      expect(result.suggestions).toEqual([suggestion()])
    }
    expect(listSuggestions()).toEqual([suggestion()])
  })

  it('falls back on transport failure', async () => {
    appendMinedSuggestions([suggestion()])
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('boom')
    }))
    const result = await listSuggestionsPolished('example-com', {
      env: cleanEnv({ MODEL_API_KEY: 'sk-test' })
    })
    expect(result.warning).toMatch(/AI polish failed/)
    expect(result.suggestions).toEqual([suggestion()])
    expect(listSuggestions()).toEqual([suggestion()])
  })

  it('falls back on invalid JSON and on schema-invalid content', async () => {
    appendMinedSuggestions([suggestion()])
    const env = cleanEnv({ MODEL_API_KEY: 'sk-test' })

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(chatBody('nope {'))))
    const badJson = await listSuggestionsPolished('example-com', { env })
    expect(badJson.warning).toMatch(/AI polish failed/)
    expect(badJson.suggestions).toEqual([suggestion()])

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(chatBody(JSON.stringify({ workflows: [{ title: '', why: 'x' }] })))
      )
    )
    const badSchema = await listSuggestionsPolished('example-com', { env })
    expect(badSchema.warning).toMatch(/AI polish failed/)
    expect(badSchema.suggestions).toEqual([suggestion()])
    expect(listSuggestions()).toEqual([suggestion()])
  })

  it('maps polished workflows to stable, actionable suggestions on success', async () => {
    appendMinedSuggestions([suggestion()])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          chatBody(
            JSON.stringify({
              workflows: [
                {
                  title: 'Walk the queue end to end',
                  why: 'Three clicks repeat per record.',
                  evidencePages: ['/queue', '/invented-nowhere'],
                  confidence: 'medium'
                }
              ]
            })
          )
        )
      )
    )
    const env = cleanEnv({ MODEL_API_KEY: 'sk-test' })
    const result = await listSuggestionsPolished('example-com', { env, now: () => NOW })
    expect(result.warning).toBeNull()
    expect(result.suggestions).toHaveLength(1)
    const [polished] = result.suggestions
    // Invented pages are constrained to the pages the model was shown.
    expect(polished!.evidence.pages).toEqual(['/queue'])
    expect(polished!.why).toContain('AI polish confidence: medium')
    expect(polished!.status).toBe('new')
    expect(polished!.id).toBe(
      suggestionIdFor('example-com', 'Walk the queue end to end', polished!.evidence)
    )
    // Persisted, so Teach/Dismiss keep working; re-polish dedupes by stable id.
    expect(listSuggestions().map((row) => row.id)).toContain(polished!.id)
    const again = await listSuggestionsPolished('example-com', { env, now: () => NOW })
    expect(again.warning).toBeNull()
    expect(again.suggestions.map((row) => row.id)).toEqual([polished!.id])
    expect(listSuggestions()).toHaveLength(2)
  })
})

describe('suggest:list polish IPC', () => {
  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(mkdtempSync(join(tmpdir(), 'ghost-polish-ipc-')), 'state.json')
    resetStoreCache()
    vi.clearAllMocks()
    ;(
      BrowserWindow as unknown as { getAllWindows: () => Array<{ webContents: { send: unknown } }> }
    ).getAllWindows = () => []
    register('studio', fakeSender())
    register('target', fakeSender())
    registerSuggestHandlers()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
    vi.unstubAllGlobals()
  })

  it('keeps the plain array contract without polish', async () => {
    appendMinedSuggestions([suggestion()])
    const studioSender = fakeSender()
    register('studio', studioSender)
    const rows = (await handlers().get(CHANNELS.suggestList)!(
      fakeEvent(studioSender),
      {}
    )) as SuggestionType[]
    expect(rows).toHaveLength(1)
  })

  it('resolves heuristics plus a warning on the polish path without ever rejecting', async () => {
    appendMinedSuggestions([suggestion()])
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    const studioSender = fakeSender()
    register('studio', studioSender)
    // No ambient key in unit tests; even with one, a dead transport still
    // resolves to heuristics plus a warning rather than rejecting.
    const result = (await handlers().get(CHANNELS.suggestList)!(
      fakeEvent(studioSender),
      { siteId: 'example-com', polish: true }
    )) as { suggestions: SuggestionType[]; warning: string | null }
    expect(result.suggestions).toEqual([suggestion()])
    expect(result.warning).toBeTruthy()
  })

  it('rejects the polish path from the target window', async () => {
    appendMinedSuggestions([suggestion()])
    const targetSender = fakeSender()
    register('target', targetSender)
    expect(() =>
      handlers().get(CHANNELS.suggestList)!(fakeEvent(targetSender), { polish: true })
    ).toThrow(/Forbidden/)
  })
})
