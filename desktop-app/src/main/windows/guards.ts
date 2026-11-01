import type { BrowserWindow } from 'electron'
import { offlinePageFilePath } from './shared'

/** Local page shown in the target window when the target server is unreachable. */
export const OFFLINE_PAGE = 'target-offline.html'

/**
 * True when the target window may navigate to `rawUrl`: the configured
 * target origin, the app's own offline page, or the initial blank document.
 * Pure; unit-tested. The file branch matches the offline page by exact path,
 * not by filename suffix, so a dropped lookalike is denied.
 */
export function isTargetNavigationAllowed(
  rawUrl: string,
  targetUrl: string,
  offlinePath: string = offlinePageFilePath()
): boolean {
  if (rawUrl === 'about:blank') return true
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (parsed.protocol === 'file:') {
    try {
      return decodeURIComponent(parsed.pathname) === offlinePath
    } catch {
      return false
    }
  }
  let targetOrigin: string
  try {
    targetOrigin = new URL(targetUrl).origin
  } catch {
    return false
  }
  return parsed.origin === targetOrigin
}

/**
 * True when `rawUrl` is a same-host http→https upgrade of `targetUrl`:
 * the target is http:, the destination is https:, the host matches, and
 * the ports match (implicit scheme defaults count as equal). Pure;
 * unit-tested. Lets stored or env-provided http:// URLs survive a
 * server-side https redirect without loosening the origin lock.
 */
export function isHttpsUpgrade(rawUrl: string, targetUrl: string): boolean {
  try {
    const target = new URL(targetUrl)
    if (target.protocol !== 'http:') return false
    const next = new URL(rawUrl)
    if (next.protocol !== 'https:') return false
    if (next.hostname.toLowerCase() !== target.hostname.toLowerCase()) return false
    return effectivePort(next) === effectivePort(target)
  } catch {
    return false
  }
}

/** Explicit port, or 'default' when implicit or the scheme's default. */
function effectivePort(url: URL): string {
  if (url.port === '') return 'default'
  const schemeDefault = url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : ''
  return url.port === schemeDefault ? 'default' : url.port
}

/**
 * Subframe rule for target and scout windows: same-origin frames may
 * navigate within the target origin; anything else (including file: pages)
 * is denied. Pure; unit-tested.
 */
export function isSubframeNavigationAllowed(rawUrl: string, targetUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === 'file:') return false
    return parsed.origin === new URL(targetUrl).origin
  } catch {
    return false
  }
}

/**
 * WebContents ids allowed to use the microphone (the panel, for spoken
 * notes). Windows can share one session, so the session-wide handler checks
 * the requesting contents rather than trusting whichever window installed it.
 */
const micAllowed = new Set<number>()

/**
 * True when a permission request may be granted: audio-only capture from the
 * panel. Everything else, including camera and any request from the target
 * site, is denied. Pure; unit-tested.
 */
export function isPermissionAllowed(
  contentsId: number,
  permission: string,
  mediaTypes: readonly string[] | undefined,
  allowedIds: ReadonlySet<number> = micAllowed
): boolean {
  if (permission !== 'media' || !allowedIds.has(contentsId)) return false
  const types = mediaTypes ?? []
  return types.length > 0 && types.every((type) => type === 'audio')
}

/** Deny popups and permissions (bar panel audio). Shared by every window. */
function denyPopupsAndPermissions(window: BrowserWindow): void {
  const contents = window.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = (details as { mediaTypes?: string[] } | undefined)?.mediaTypes
    callback(isPermissionAllowed(webContents.id, permission, mediaTypes))
  })
}

/**
 * True when the panel window may navigate to `rawUrl`: exactly the page it
 * was loaded from, or the initial blank document. Pure; unit-tested.
 */
export function isPanelNavigationAllowed(rawUrl: string, panelUrl: string): boolean {
  if (rawUrl === 'about:blank') return true
  return rawUrl === panelUrl
}

/**
 * Lock the target window to the live target origin; deny popups and
 * permissions. The origin is resolved per navigation via `getTargetUrl` so
 * switching sites re-scopes the allowlist without reinstalling the guards.
 */
export function applyTargetGuards(window: BrowserWindow, getTargetUrl: () => string): void {
  const guard = (details: { isMainFrame?: boolean; url: string; preventDefault: () => void }): void => {
    const allowed = details.isMainFrame
      ? isTargetNavigationAllowed(details.url, getTargetUrl())
      : isSubframeNavigationAllowed(details.url, getTargetUrl())
    if (!allowed) details.preventDefault()
  }
  window.webContents.on('will-navigate', guard)
  window.webContents.on('will-redirect', guard)
  denyPopupsAndPermissions(window)
}

/**
 * Lock the panel to its own page in every frame; deny popups and
 * permissions. The expected URL is the window's currently loaded page:
 * programmatic loads emit no will-navigate, so any navigation event the
 * guard sees is renderer-initiated (a dropped file, a scripted location
 * change) and must go nowhere else.
 */
export function applyPanelGuards(window: BrowserWindow): void {
  const guard = (details: { url: string; preventDefault: () => void }): void => {
    if (!isPanelNavigationAllowed(details.url, window.webContents.getURL())) {
      details.preventDefault()
    }
  }
  window.webContents.on('will-navigate', guard)
  window.webContents.on('will-redirect', guard)
  if (typeof window.webContents.id === 'number') micAllowed.add(window.webContents.id)
  denyPopupsAndPermissions(window)
}
