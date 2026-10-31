import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '../../src/main/ipc/channels'
import { ALL_ROLES, APP_ROLES, TARGET_ONLY, assertSenderRole } from '../../src/main/ipc/sender'
import { isTargetNavigationAllowed } from '../../src/main/windows/guards'
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

  it('allows only the offline page over file://', () => {
    expect(
      isTargetNavigationAllowed('file:///opt/app/out/renderer/target-offline.html', TARGET_URL)
    ).toBe(true)
    expect(isTargetNavigationAllowed('file:///etc/passwd', TARGET_URL)).toBe(false)
    expect(isTargetNavigationAllowed('file:///opt/app/out/renderer/studio.html', TARGET_URL)).toBe(
      false
    )
  })

  it('denies everything when the target URL is unparseable', () => {
    expect(isTargetNavigationAllowed('http://localhost:3000/', '::::')).toBe(false)
  })
})

describe('sender role mapping', () => {
  it('maps each registered window to its role', () => {
    const target = fakeSender()
    const toolbar = fakeSender()
    const sidecar = fakeSender()
    const studio = fakeSender()
    register('target', target)
    register('toolbar', toolbar)
    register('sidecar', sidecar)
    register('studio', studio)
    expect(roleForWebContents(target)).toBe('target')
    expect(roleForWebContents(toolbar)).toBe('toolbar')
    expect(roleForWebContents(sidecar)).toBe('sidecar')
    expect(roleForWebContents(studio)).toBe('studio')
  })

  it('returns undefined for unknown senders such as popups', () => {
    register('target', fakeSender())
    expect(roleForWebContents(fakeSender())).toBeUndefined()
  })

  it('returns undefined for destroyed windows', () => {
    const sender = fakeSender()
    register('studio', sender, true)
    expect(roleForWebContents(sender)).toBeUndefined()
    register('studio', fakeSender())
  })
})

describe('sender role enforcement', () => {
  it('accepts privileged app channels from app windows', () => {
    const toolbar = fakeSender()
    register('toolbar', toolbar)
    expect(assertSenderRole(fakeEvent(toolbar), CHANNELS.recorderStart, APP_ROLES)).toBe('toolbar')
    expect(assertSenderRole(fakeEvent(toolbar), CHANNELS.skillsPublish, APP_ROLES)).toBe('toolbar')
    expect(assertSenderRole(fakeEvent(toolbar), CHANNELS.runsStart, APP_ROLES)).toBe('toolbar')
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
    const toolbar = fakeSender()
    register('target', target)
    register('toolbar', toolbar)
    expect(assertSenderRole(fakeEvent(target), CHANNELS.recorderEvents, TARGET_ONLY)).toBe(
      'target'
    )
    expect(() =>
      assertSenderRole(fakeEvent(toolbar), CHANNELS.recorderEvents, TARGET_ONLY)
    ).toThrow(/Forbidden/)
  })

  it('accepts recorder state reads from every registered window', () => {
    const target = fakeSender()
    const studio = fakeSender()
    register('target', target)
    register('studio', studio)
    expect(assertSenderRole(fakeEvent(target), CHANNELS.recorderGetState, ALL_ROLES)).toBe(
      'target'
    )
    expect(assertSenderRole(fakeEvent(studio), CHANNELS.recorderGetState, ALL_ROLES)).toBe(
      'studio'
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
