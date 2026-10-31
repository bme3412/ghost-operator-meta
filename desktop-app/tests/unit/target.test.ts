import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileRecording } from '../../src/main/compiler/index'
import { compileFixture } from '../../src/main/providers/fixture'
import { listSkills, saveDraft } from '../../src/main/skills/index'
import { resetStoreCache, saveState } from '../../src/main/store/index'
import {
  getTargetInfo,
  isTargetReachable,
  resolveCanonicalTargetUrl,
  resolveTargetUrl,
  setTargetUrl
} from '../../src/main/target'
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

// setTargetUrl canonicalizes over the network; fail every unstubbed request
// so tests exercise the keep-the-typed-URL path deterministically offline.
beforeEach(() => {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('connect ECONNREFUSED')))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it('persists the switched site and serves it as the live profile', async () => {
    const profile = await setTargetUrl('https://ebay.com/')
    expect(profile).toEqual({ id: 'ebay-com', name: 'ebay.com', url: 'https://ebay.com' })
    expect(getTargetInfo()).toEqual(profile)
    expect(resolveTargetUrl()).toBe('https://ebay.com')
    // The configured Saltbreak URL maps back to the Saltbreak profile.
    expect((await setTargetUrl(SALTBREAK_URL)).id).toBe('saltbreak')
    expect(getTargetInfo().id).toBe('saltbreak')
  })

  it('leaves the stored site untouched when the URL is invalid', async () => {
    await setTargetUrl('https://ebay.com')
    await expect(setTargetUrl('ftp://files.example.com/x')).rejects.toThrow()
    await expect(setTargetUrl('nope')).rejects.toThrow()
    expect(getTargetInfo().id).toBe('ebay-com')
  })
})

describe('target reachability probe', () => {
  it('reads any HTTP response as reachable, even an error status', async () => {
    const notFound = (async () => ({})) as unknown as typeof fetch
    expect(await isTargetReachable('http://localhost:3000', 1000, notFound)).toBe(true)
  })

  it('reads network failures as unreachable', async () => {
    const refused = (async () => {
      throw new Error('connect ECONNREFUSED')
    }) as unknown as typeof fetch
    expect(await isTargetReachable('http://localhost:3000', 1000, refused)).toBe(false)
  })

  it('reads timeouts as unreachable', async () => {
    const hanging = ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as unknown as typeof fetch
    expect(await isTargetReachable('http://localhost:3000', 20, hanging)).toBe(false)
  })
})

describe('canonical target URLs', () => {
  const redirectTo = (finalUrl: string): typeof fetch =>
    (async () => ({ url: finalUrl })) as unknown as typeof fetch

  it('follows same-host http-to-https redirects, keeping the typed path', async () => {
    await expect(
      resolveCanonicalTargetUrl(
        'http://www.ebay.com/sch/i.html',
        1000,
        redirectTo('https://www.ebay.com/')
      )
    ).resolves.toBe('https://www.ebay.com/sch/i.html')
  })

  it('follows www consolidation within the same host', async () => {
    await expect(
      resolveCanonicalTargetUrl('http://ebay.com/', 1000, redirectTo('https://www.ebay.com/'))
    ).resolves.toBe('https://www.ebay.com')
  })

  it('keeps the typed URL when the redirect leaves the host', async () => {
    await expect(
      resolveCanonicalTargetUrl('http://example.com/', 1000, redirectTo('https://other.com/'))
    ).resolves.toBe('http://example.com/')
  })

  it('keeps the typed URL when the network fails', async () => {
    const refused = (async () => {
      throw new Error('connect ECONNREFUSED')
    }) as unknown as typeof fetch
    await expect(resolveCanonicalTargetUrl('http://localhost:3000', 1000, refused)).resolves.toBe(
      'http://localhost:3000'
    )
  })

  it('leaves non-redirecting URLs unchanged', async () => {
    await expect(
      resolveCanonicalTargetUrl(
        'http://localhost:3000',
        1000,
        redirectTo('http://localhost:3000/')
      )
    ).resolves.toBe('http://localhost:3000')
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

  it('re-scopes the allowlist when the site switches', async () => {
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

    const attempt = (
      handler: (details: unknown) => void,
      url: string,
      isMainFrame = true
    ): boolean => {
      let prevented = false
      handler({ isMainFrame, url, preventDefault: () => (prevented = true) })
      return prevented
    }

    expect(attempt(navigate!, `${SALTBREAK_URL}/inbox`)).toBe(false)
    await setTargetUrl('https://ebay.com')
    expect(attempt(navigate!, `${SALTBREAK_URL}/inbox`)).toBe(true)
    expect(attempt(navigate!, 'https://ebay.com/itm/1')).toBe(false)
    expect(attempt(redirect!, 'http://evil.example.com/')).toBe(true)
    expect(attempt(navigate!, 'about:blank')).toBe(false)
    expect(attempt(navigate!, 'https://ebay.com/embed', false)).toBe(false)
    expect(attempt(navigate!, 'http://evil.example.com/', false)).toBe(true)
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

  it('pins the creating site on drafts and validates against it', async () => {
    await setTargetUrl('https://ebay.com')
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
    expect(proposal.recipe.steps[0]?.goal).toBe('Click Go.')
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
