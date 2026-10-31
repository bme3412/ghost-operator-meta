import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compileRecording } from '../../src/main/compiler/index'
import { compileFixture } from '../../src/main/providers/fixture'
import { listSkills, saveDraft } from '../../src/main/skills/index'
import { resetStoreCache, saveState } from '../../src/main/store/index'
import { getTargetInfo, resolveTargetUrl, setTargetUrl } from '../../src/main/target'
import { applyTargetGuards } from '../../src/main/windows/guards'
import { validateRecipe } from '../../src/shared/policy/recipe'
import {
  defaultState,
  migrateState,
  type Recording,
  type SkillRecipe
} from '../../src/shared/schemas'
import {
  normalizeTargetUrl,
  siteProfileForUrl,
  slugifyHostname
} from '../../src/shared/target'

const SALTBREAK_URL = 'http://localhost:3000'

function recipe(): SkillRecipe {
  return {
    schemaVersion: 1,
    id: 'resolve-support-ticket',
    version: 1,
    goal: 'Resolve a support ticket',
    inputSchemaRef: 'ResolveSupportTicketInput',
    steps: [
      {
        id: 'click-resolve',
        kind: 'computer_task',
        applicationId: 'saltbreak',
        goal: 'Click resolve.',
        bindings: { action: 'click', selector: '[data-semid="resolve"]' },
        dataRefs: [],
        checks: []
      }
    ],
    allowedApplications: ['saltbreak'],
    allowedTools: []
  }
}

function recording(scope: string): Recording {
  return {
    id: `rec-${scope}`,
    goal: 'Do the thing',
    applicationScope: scope,
    startedAt: new Date(0).toISOString(),
    events: [
      {
        sequence: 0,
        type: 'click',
        semanticId: 'go',
        selector: '[data-semid="go"]',
        atMs: 0
      }
    ],
    notes: []
  }
}

describe('site profiles', () => {
  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(
      mkdtempSync(join(tmpdir(), 'ghost-target-')),
      'state.json'
    )
    resetStoreCache()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    delete process.env.TARGET_URL
    delete process.env.SALTBREAK_URL
    resetStoreCache()
  })

  it('derives the site id from the origin hostname', () => {
    expect(siteProfileForUrl('https://www.ebay.com/itm/1')).toEqual({
      id: 'www-ebay-com',
      name: 'www.ebay.com',
      url: 'https://www.ebay.com/itm/1'
    })
    expect(siteProfileForUrl('https://ebay.com')).toEqual({
      id: 'ebay-com',
      name: 'ebay.com',
      url: 'https://ebay.com'
    })
  })

  it('keeps the Saltbreak profile for the configured Saltbreak URL', () => {
    expect(siteProfileForUrl(`${SALTBREAK_URL}/`, SALTBREAK_URL)).toEqual({
      id: 'saltbreak',
      name: 'Saltbreak',
      url: SALTBREAK_URL
    })
  })

  it('slugifies hostnames', () => {
    expect(slugifyHostname('EBay.COM')).toBe('ebay-com')
    expect(slugifyHostname('localhost')).toBe('localhost')
  })

  it('rejects non-http(s) and non-absolute URLs', () => {
    for (const bad of ['ftp://files.example.com/x', 'javascript:alert(1)', 'not a url', '', '/relative/path']) {
      expect(() => normalizeTargetUrl(bad)).toThrow(/Invalid target URL/)
      expect(() => siteProfileForUrl(bad)).toThrow(/Invalid target URL/)
    }
  })

  it('defaults to the Saltbreak profile at the configured URL', () => {
    expect(getTargetInfo()).toEqual({ id: 'saltbreak', name: 'Saltbreak', url: SALTBREAK_URL })
    expect(resolveTargetUrl()).toBe(SALTBREAK_URL)
    process.env.TARGET_URL = 'http://localhost:4123'
    resetStoreCache()
    expect(getTargetInfo().url).toBe('http://localhost:4123')
  })

  it('persists the switched site and serves it as the live profile', () => {
    const profile = setTargetUrl('https://ebay.com/')
    expect(profile).toEqual({ id: 'ebay-com', name: 'ebay.com', url: 'https://ebay.com' })
    expect(getTargetInfo()).toEqual(profile)
    expect(resolveTargetUrl()).toBe('https://ebay.com')
    // The configured Saltbreak URL maps back to the Saltbreak profile.
    expect(setTargetUrl(SALTBREAK_URL).id).toBe('saltbreak')
    expect(getTargetInfo().id).toBe('saltbreak')
  })

  it('leaves the stored site untouched when the URL is invalid', () => {
    setTargetUrl('https://ebay.com')
    expect(() => setTargetUrl('ftp://files.example.com/x')).toThrow()
    expect(() => setTargetUrl('nope')).toThrow()
    expect(getTargetInfo().id).toBe('ebay-com')
  })
})

describe('live target guards', () => {
  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(
      mkdtempSync(join(tmpdir(), 'ghost-guards-')),
      'state.json'
    )
    resetStoreCache()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    delete process.env.TARGET_URL
    delete process.env.SALTBREAK_URL
    resetStoreCache()
  })

  it('re-scopes the allowlist when the site switches', () => {
    const handlers = new Map<string, (details: unknown) => void>()
    const window = {
      webContents: {
        on: (event: string, listener: (details: unknown) => void): void => {
          handlers.set(event, listener)
        },
        setWindowOpenHandler: (): void => undefined,
        session: { setPermissionRequestHandler: (): void => undefined }
      }
    } as unknown as Electron.BrowserWindow
    applyTargetGuards(window, () => getTargetInfo().url)
    const navigate = handlers.get('will-navigate')
    const redirect = handlers.get('will-redirect')
    expect(navigate).toBeDefined()
    expect(redirect).toBeDefined()

    const attempt = (handler: (details: unknown) => void, url: string): boolean => {
      let prevented = false
      handler({ isMainFrame: true, url, preventDefault: () => (prevented = true) })
      return prevented
    }

    expect(attempt(navigate!, `${SALTBREAK_URL}/inbox`)).toBe(false)
    setTargetUrl('https://ebay.com')
    expect(attempt(navigate!, `${SALTBREAK_URL}/inbox`)).toBe(true)
    expect(attempt(navigate!, 'https://ebay.com/itm/1')).toBe(false)
    expect(attempt(redirect!, 'http://evil.example.com/')).toBe(true)
    expect(attempt(navigate!, 'about:blank')).toBe(false)
  })
})

describe('per-site skills', () => {
  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(
      mkdtempSync(join(tmpdir(), 'ghost-sites-')),
      'state.json'
    )
    resetStoreCache()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    delete process.env.TARGET_URL
    delete process.env.SALTBREAK_URL
    resetStoreCache()
  })

  it('pins the creating site on drafts and validates against it', () => {
    setTargetUrl('https://ebay.com')
    const skill = saveDraft({
      name: 'Buy it now',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: []
    })
    expect(skill.versions[0]?.recipe.allowedApplications).toEqual(['ebay-com'])
    expect(validateRecipe(skill.versions[0]!.recipe, 'ebay-com')).toEqual([])
    expect(listSkills()[0]?.siteId).toBe('ebay-com')
  })

  it('keeps Saltbreak drafts on the saltbreak scope', () => {
    const skill = saveDraft({
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: []
    })
    expect(skill.versions[0]?.recipe.allowedApplications).toEqual(['saltbreak'])
    expect(listSkills()[0]?.siteId).toBe('saltbreak')
  })

  it('compiles non-Saltbreak recordings against their own scope', async () => {
    saveState({ ...defaultState(), recordings: [recording('ebay-com')] })
    const result = await compileRecording({ recordingId: 'rec-ebay-com', providerId: 'fixture' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.proposal.recipe.allowedApplications).toEqual(['ebay-com'])
      expect(
        result.proposal.recipe.steps.every((s) => s.applicationId === 'ebay-com')
      ).toBe(true)
    }
  })

  it('keeps the Saltbreak fixture output on saltbreak', () => {
    const proposal = compileFixture(recording('saltbreak'))
    expect(proposal.recipe.allowedApplications).toEqual(['saltbreak'])
    expect(proposal.recipe.steps[0]?.applicationId).toBe('saltbreak')
    expect(proposal.recipe.steps[0]?.goal).toBe('Click go.')
  })

  it('migrates states with and without a stored site', () => {
    const without = migrateState({ schemaVersion: 5, recordings: [], skills: [], runs: [] })
    expect(without.currentSite).toBeUndefined()
    const withSite = migrateState({
      schemaVersion: 5,
      recordings: [],
      skills: [],
      runs: [],
      currentSite: { id: 'ebay-com', name: 'ebay.com', url: 'https://ebay.com' }
    })
    expect(withSite.currentSite?.id).toBe('ebay-com')
  })
})
