import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '../../src/main/ipc/channels'
import { ALL_ROLES, APP_ROLES, TARGET_ONLY, assertSenderRole } from '../../src/main/ipc/sender'
import { PanelNavigateParams } from '../../src/shared/schemas'
import {
  applyPanelGuards,
  isHttpsUpgrade,
  isPanelNavigationAllowed,
  isSubframeNavigationAllowed,
  isTargetNavigationAllowed
} from '../../src/main/windows/guards'
import {
  registerWindow,
  roleForWebContents,
  type WindowRole
} from '../../src/main/windows/registry'

const TARGET_URL = 'http://localhost:3000'

function fakeSender(): WebContents {
  return {} as WebContents
}

function fakeWindow(sender: WebContents, destroyed = false): Electron.BrowserWindow {
  return {
    webContents: sender,
    isDestroyed: () => destroyed,
    on: vi.fn()
  } as unknown as Electron.BrowserWindow
}

function fakeEvent(sender: WebContents): IpcMainInvokeEvent {
  return { sender } as unknown as IpcMainInvokeEvent
}

function register(role: WindowRole, sender: WebContents, destroyed = false): void {
  registerWindow(role, fakeWindow(sender, destroyed))
}

describe('target navigation allowlist', () => {
  it('allows the target origin including paths and query strings', () => {
    expect(isTargetNavigationAllowed('http://localhost:3000/', TARGET_URL)).toBe(true)
    expect(isTargetNavigationAllowed('http://localhost:3000/inbox?tab=all', TARGET_URL)).toBe(
      true
    )
  })

  it('denies other origins, ports, and schemes', () => {
    expect(isTargetNavigationAllowed('http://localhost:3001/', TARGET_URL)).toBe(false)
    expect(isTargetNavigationAllowed('https://localhost:3000/', TARGET_URL)).toBe(false)
    expect(isTargetNavigationAllowed('http://evil.example.com/', TARGET_URL)).toBe(false)
    expect(isTargetNavigationAllowed('https://localhost:3000.evil.example.com/', TARGET_URL)).toBe(
      false
    )
  })

  it('denies non-navigable and unparseable URLs', () => {
    expect(isTargetNavigationAllowed('javascript:alert(1)', TARGET_URL)).toBe(false)
    expect(isTargetNavigationAllowed('data:text/html,<h1>x</h1>', TARGET_URL)).toBe(false)
    expect(isTargetNavigationAllowed('not a url', TARGET_URL)).toBe(false)
    expect(isTargetNavigationAllowed('', TARGET_URL)).toBe(false)
  })

  it('allows the initial blank document', () => {
    expect(isTargetNavigationAllowed('about:blank', TARGET_URL)).toBe(true)
  })

  it('allows only the app offline page over file://, by exact path', () => {
    const offlinePath = '/opt/app/out/renderer/target-offline.html'
    expect(
      isTargetNavigationAllowed(
        'file:///opt/app/out/renderer/target-offline.html',
        TARGET_URL,
        offlinePath
      )
    ).toBe(true)
    // Same filename, different directory: denied.
    expect(
      isTargetNavigationAllowed('file:///tmp/target-offline.html', TARGET_URL, offlinePath)
    ).toBe(false)
    expect(isTargetNavigationAllowed('file:///etc/passwd', TARGET_URL, offlinePath)).toBe(false)
    expect(
      isTargetNavigationAllowed('file:///opt/app/out/renderer/panel.html', TARGET_URL, offlinePath)
    ).toBe(false)
  })

  it('denies everything when the target URL is unparseable', () => {
    expect(isTargetNavigationAllowed('http://localhost:3000/', '::::')).toBe(false)
  })
})

describe('https upgrade rule', () => {
  it('accepts a same-host http-to-https redirect', () => {
    expect(isHttpsUpgrade('https://www.ebay.com/', 'http://www.ebay.com')).toBe(true)
    expect(isHttpsUpgrade('https://www.ebay.com/sch/i.html', 'http://www.ebay.com/x')).toBe(true)
  })

  it('rejects redirects that leave the host or downgrade the scheme', () => {
    expect(isHttpsUpgrade('https://other.com/', 'http://www.ebay.com')).toBe(false)
    expect(isHttpsUpgrade('http://www.ebay.com/', 'https://www.ebay.com')).toBe(false)
  })

  it('rejects upgrades when the target is already https', () => {
    expect(isHttpsUpgrade('https://www.ebay.com/other', 'https://www.ebay.com')).toBe(false)
  })

  it('requires matching ports, treating implicit defaults as equal', () => {
    expect(isHttpsUpgrade('https://h:8080/', 'http://h:8080/')).toBe(true)
    expect(isHttpsUpgrade('https://h:8443/', 'http://h:8080/')).toBe(false)
    expect(isHttpsUpgrade('https://h:8443/', 'http://h/')).toBe(false)
  })

  it('rejects unparseable URLs', () => {
    expect(isHttpsUpgrade('not a url', 'http://www.ebay.com')).toBe(false)
    expect(isHttpsUpgrade('https://www.ebay.com/', '::::')).toBe(false)
  })
})

describe('subframe navigation rule', () => {
  it('keeps subframes within the target origin', () => {
    expect(isSubframeNavigationAllowed('http://localhost:3000/embed', TARGET_URL)).toBe(true)
    expect(isSubframeNavigationAllowed('http://evil.example.com/', TARGET_URL)).toBe(false)
    expect(isSubframeNavigationAllowed('file:///opt/app/out/renderer/x.html', TARGET_URL)).toBe(
      false
    )
    expect(isSubframeNavigationAllowed('javascript:alert(1)', TARGET_URL)).toBe(false)
  })
})

describe('panel navigation lock', () => {
  const PANEL_URL = 'file:///opt/app/out/renderer/panel.html'

  it('allows only the loaded panel page and the blank document', () => {
    expect(isPanelNavigationAllowed(PANEL_URL, PANEL_URL)).toBe(true)
    expect(isPanelNavigationAllowed('about:blank', PANEL_URL)).toBe(true)
    expect(isPanelNavigationAllowed('file:///tmp/dropped.html', PANEL_URL)).toBe(false)
    expect(isPanelNavigationAllowed('file:///opt/app/out/renderer/target-offline.html', PANEL_URL)).toBe(
      false
    )
    expect(isPanelNavigationAllowed('https://evil.example.com/', PANEL_URL)).toBe(false)
  })

  it('blocks renderer-initiated navigation away from the panel page', () => {
    const handlers = new Map<string, (details: unknown) => void>()
    const window = {
      webContents: {
        getURL: () => PANEL_URL,
        on: (event: string, listener: (details: unknown) => void): void => {
          handlers.set(event, listener)
        },
        setWindowOpenHandler: (): void => undefined,
        session: { setPermissionRequestHandler: (): void => undefined }
      }
    } as unknown as Electron.BrowserWindow
    applyPanelGuards(window)

    const attempt = (event: string, url: string): boolean => {
      let prevented = false
      handlers.get(event)!({ url, preventDefault: () => (prevented = true) })
      return prevented
    }
    expect(attempt('will-navigate', PANEL_URL)).toBe(false)
    expect(attempt('will-navigate', 'file:///tmp/dropped.html')).toBe(true)
    expect(attempt('will-redirect', 'https://evil.example.com/')).toBe(true)
  })
})

describe('sender role mapping', () => {
  it('maps each registered window to its role', () => {
    const target = fakeSender()
    const panel = fakeSender()
    register('target', target)
    register('panel', panel)
    expect(roleForWebContents(target)).toBe('target')
    expect(roleForWebContents(panel)).toBe('panel')
  })

  it('returns undefined for unknown senders such as popups', () => {
    register('target', fakeSender())
    expect(roleForWebContents(fakeSender())).toBeUndefined()
  })

  it('returns undefined for destroyed windows', () => {
    const sender = fakeSender()
    register('panel', sender, true)
    expect(roleForWebContents(sender)).toBeUndefined()
    register('panel', fakeSender())
  })
})

describe('sender role enforcement', () => {
  it('accepts privileged app channels from app windows', () => {
    const panel = fakeSender()
    register('panel', panel)
    expect(assertSenderRole(fakeEvent(panel), CHANNELS.recorderStart, APP_ROLES)).toBe('panel')
    expect(assertSenderRole(fakeEvent(panel), CHANNELS.skillsPublish, APP_ROLES)).toBe('panel')
    expect(assertSenderRole(fakeEvent(panel), CHANNELS.runsStart, APP_ROLES)).toBe('panel')
  })

  it('rejects privileged app channels from the target window', () => {
    const target = fakeSender()
    register('target', target)
    expect(() =>
      assertSenderRole(fakeEvent(target), CHANNELS.recorderStart, APP_ROLES)
    ).toThrow(/Forbidden/)
    expect(() =>
      assertSenderRole(fakeEvent(target), CHANNELS.skillsPublish, APP_ROLES)
    ).toThrow(/Forbidden/)
  })

  it('accepts recorder events only from the target window', () => {
    const target = fakeSender()
    const panel = fakeSender()
    register('target', target)
    register('panel', panel)
    expect(assertSenderRole(fakeEvent(target), CHANNELS.recorderEvents, TARGET_ONLY)).toBe(
      'target'
    )
    expect(() =>
      assertSenderRole(fakeEvent(panel), CHANNELS.recorderEvents, TARGET_ONLY)
    ).toThrow(/Forbidden/)
  })

  it('accepts recorder state reads from every registered window', () => {
    const target = fakeSender()
    const panel = fakeSender()
    register('target', target)
    register('panel', panel)
    expect(assertSenderRole(fakeEvent(target), CHANNELS.recorderGetState, ALL_ROLES)).toBe(
      'target'
    )
    expect(assertSenderRole(fakeEvent(panel), CHANNELS.recorderGetState, ALL_ROLES)).toBe('panel')
  })

  it('validates panel navigation payloads', () => {
    expect(PanelNavigateParams.parse({ view: 'review', recordingId: 'rec-1' })).toEqual({
      view: 'review',
      recordingId: 'rec-1'
    })
    expect(PanelNavigateParams.parse({ view: 'teach', goal: 'Do it' })).toEqual({
      view: 'teach',
      goal: 'Do it'
    })
    expect(() => PanelNavigateParams.parse({ view: 'popup' })).toThrow()
    expect(() => PanelNavigateParams.parse({ view: 'library', libraryTab: 'admin' })).toThrow()
  })

  it('rejects panel and target channels from the target window', () => {
    const target = fakeSender()
    register('target', target)
    expect(() =>
      assertSenderRole(fakeEvent(target), CHANNELS.panelSetLayout, APP_ROLES)
    ).toThrow(/Forbidden/)
    expect(() =>
      assertSenderRole(fakeEvent(target), CHANNELS.targetGetStatus, APP_ROLES)
    ).toThrow(/Forbidden/)
    expect(() => assertSenderRole(fakeEvent(target), CHANNELS.targetShow, APP_ROLES)).toThrow(
      /Forbidden/
    )
  })

  it('rejects unknown senders on every guarded channel', () => {
    register('target', fakeSender())
    const popup = fakeEvent(fakeSender())
    expect(() => assertSenderRole(popup, CHANNELS.recorderGetState, ALL_ROLES)).toThrow(/Forbidden/)
    expect(() => assertSenderRole(popup, CHANNELS.recorderStart, APP_ROLES)).toThrow(/Forbidden/)
    expect(() => assertSenderRole(popup, CHANNELS.recorderEvents, TARGET_ONLY)).toThrow(/Forbidden/)
  })
})
