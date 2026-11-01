import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { BrowserWindow, ipcMain } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS, EVENTS } from '../../src/main/ipc/channels'
import { registerSuggestHandlers } from '../../src/main/ipc/suggest'
import { resetStoreCache } from '../../src/main/store/index'
import {
  acceptSuggestion,
  appendMinedSuggestions,
  dismissSuggestion,
  listSuggestions
} from '../../src/main/suggest/index'
import { mineRecording } from '../../src/main/suggest/mine'
import { registerWindow, type WindowRole } from '../../src/main/windows/registry'
import {
  PersistedState,
  Suggestion,
  defaultState,
  type Recording,
  type Suggestion as SuggestionType
} from '../../src/shared/schemas'

const NOW = '2026-10-31T12:00:00.000Z'

function suggestion(partial: Partial<SuggestionType> = {}): SuggestionType {
  return {
    id: 'sug-1',
    siteId: 'saltbreak',
    title: 'Turn this click flow into a macro',
    why: '3 clicks (#0, #1, #2).',
    evidence: { pages: ['/inbox'], selectors: ['[data-semid="a"]'], sourceRecordingId: 'rec-1' },
    status: 'new',
    createdAt: NOW,
    ...partial
  }
}

function recording(): Recording {
  return {
    id: 'rec-1',
    goal: 'Resolve a support ticket',
    applicationScope: 'saltbreak',
    startedAt: NOW,
    events: [
      { sequence: 0, type: 'click', selector: '[data-semid="a"]', atMs: 0 },
      { sequence: 1, type: 'click', selector: '[data-semid="b"]', atMs: 1000 },
      { sequence: 2, type: 'click', selector: '[data-semid="c"]', atMs: 2000 }
    ],
    notes: []
  }
}

function fakeSender(): WebContents {
  return {} as WebContents
}

function fakeEvent(sender: WebContents): IpcMainInvokeEvent {
  return { sender } as unknown as IpcMainInvokeEvent
}

function register(role: WindowRole, sender: WebContents, send = vi.fn()): void {
  // roleForWebContents matches by identity, so the sender IS the webContents.
  const webContents = Object.assign(sender, { send })
  registerWindow(
    role,
    {
      webContents,
      isDestroyed: () => false,
      on: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    } as unknown as Electron.BrowserWindow
  )
}

type Handler = (event: IpcMainInvokeEvent, payload?: unknown) => unknown

function handlers(): Map<string, Handler> {
  const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Handler]> } }).mock.calls
  return new Map(calls)
}

describe('suggestion schema', () => {
  it('parses a valid suggestion', () => {
    expect(Suggestion.parse(suggestion())).toEqual(suggestion())
  })

  it('defaults the status to new', () => {
    const { status: _ignored, ...rest } = suggestion()
    expect(Suggestion.parse(rest).status).toBe('new')
  })

  it('rejects unknown statuses and empty titles', () => {
    expect(() => Suggestion.parse(suggestion({ status: 'archived' as never }))).toThrow()
    expect(() => Suggestion.parse(suggestion({ title: '' }))).toThrow()
    expect(() =>
      Suggestion.parse(suggestion({ evidence: { pages: [], selectors: [], sourceRecordingId: '' } }))
    ).toThrow()
  })

  it('keeps suggestions optional on the current store schema', () => {
    expect(PersistedState.shape.schemaVersion.value).toBe(6)
    expect(defaultState()).not.toHaveProperty('suggestions')
    expect(PersistedState.parse(defaultState())).not.toHaveProperty('suggestions')
    const withSuggestions = { ...defaultState(), suggestions: [suggestion()] }
    expect(PersistedState.parse(withSuggestions).suggestions).toEqual([suggestion()])
  })
})

describe('suggestion store', () => {
  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(mkdtempSync(join(tmpdir(), 'ghost-suggest-')), 'state.json')
    resetStoreCache()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
  })

  it('lists nothing when the state predates suggestions', () => {
    expect(listSuggestions()).toEqual([])
  })

  it('appends mined suggestions and dedupes stable ids on refinish', () => {
    const mined = mineRecording(recording(), { now: () => NOW })
    expect(mined).toHaveLength(1)
    expect(appendMinedSuggestions(mined)).toHaveLength(1)
    expect(appendMinedSuggestions(mineRecording(recording(), { now: () => NOW }))).toHaveLength(0)
    expect(listSuggestions()).toHaveLength(1)
  })

  it('filters the list by site', () => {
    appendMinedSuggestions([
      suggestion({ id: 'sug-a', siteId: 'saltbreak' }),
      suggestion({ id: 'sug-b', siteId: 'other' })
    ])
    expect(listSuggestions('saltbreak').map((s) => s.id)).toEqual(['sug-a'])
    expect(listSuggestions()).toHaveLength(2)
  })

  it('dismisses a suggestion by id', () => {
    appendMinedSuggestions([suggestion()])
    expect(dismissSuggestion('sug-1').status).toBe('dismissed')
    expect(listSuggestions()[0]!.status).toBe('dismissed')
  })

  it('accepts a suggestion and returns the Teach prefill', () => {
    appendMinedSuggestions([suggestion()])
    const { suggestion: next, prefill } = acceptSuggestion('sug-1')
    expect(next.status).toBe('accepted')
    expect(prefill).toEqual({ goal: 'Turn this click flow into a macro', siteId: 'saltbreak' })
  })

  it('rejects dismiss and accept for unknown ids', () => {
    expect(() => dismissSuggestion('missing')).toThrow(/Unknown suggestion/)
    expect(() => acceptSuggestion('missing')).toThrow(/Unknown suggestion/)
  })
})

describe('suggest IPC', () => {
  const panelSend = vi.fn()

  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(mkdtempSync(join(tmpdir(), 'ghost-suggest-ipc-')), 'state.json')
    resetStoreCache()
    vi.clearAllMocks()
    ;(
      BrowserWindow as unknown as { getAllWindows: () => Array<{ webContents: { send: unknown } }> }
    ).getAllWindows = () => []
    const panel = fakeSender()
    register('panel', panel, panelSend)
    register('target', fakeSender())
    registerSuggestHandlers()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
  })

  it('registers the suggest channels', () => {
    const map = handlers()
    expect(map.has(CHANNELS.suggestList)).toBe(true)
    expect(map.has(CHANNELS.suggestDismiss)).toBe(true)
    expect(map.has(CHANNELS.suggestAccept)).toBe(true)
  })

  it('lists suggestions with an optional site filter', async () => {
    appendMinedSuggestions([
      suggestion({ id: 'sug-a', siteId: 'saltbreak' }),
      suggestion({ id: 'sug-b', siteId: 'other' })
    ])
    const map = handlers()
    const list = map.get(CHANNELS.suggestList)!
    const panelSender = fakeSender()
    register('panel', panelSender)
    expect(await list(fakeEvent(panelSender), {})).toHaveLength(2)
    expect(await list(fakeEvent(panelSender), { siteId: 'saltbreak' })).toHaveLength(1)
  })

  it('dismisses through the channel and broadcasts the change', async () => {
    appendMinedSuggestions([suggestion()])
    const panelSender = fakeSender()
    register('panel', panelSender)
    const dismissed = (await handlers().get(CHANNELS.suggestDismiss)!(
      fakeEvent(panelSender),
      { id: 'sug-1' }
    )) as SuggestionType
    expect(dismissed.status).toBe('dismissed')
    expect(listSuggestions()[0]!.status).toBe('dismissed')
  })

  it('accepts through the channel, returns the prefill, and navigates the panel to teach', async () => {
    appendMinedSuggestions([suggestion()])
    const panelSender = fakeSender()
    register('panel', panelSender, panelSend)
    const prefill = (await handlers().get(CHANNELS.suggestAccept)!(
      fakeEvent(panelSender),
      { id: 'sug-1' }
    )) as { goal: string; siteId: string }
    expect(prefill).toEqual({ goal: 'Turn this click flow into a macro', siteId: 'saltbreak' })
    expect(panelSend).toHaveBeenCalledWith(EVENTS.panelNavigate, {
      view: 'teach',
      goal: 'Turn this click flow into a macro'
    })
  })

  it('rejects suggest channels from the target window', async () => {
    appendMinedSuggestions([suggestion()])
    const targetSender = fakeSender()
    register('target', targetSender)
    const event = fakeEvent(targetSender)
    const map = handlers()
    expect(() => map.get(CHANNELS.suggestList)!(event, {})).toThrow(/Forbidden/)
    expect(() => map.get(CHANNELS.suggestDismiss)!(event, { id: 'sug-1' })).toThrow(/Forbidden/)
    expect(() => map.get(CHANNELS.suggestAccept)!(event, { id: 'sug-1' })).toThrow(/Forbidden/)
  })
})
