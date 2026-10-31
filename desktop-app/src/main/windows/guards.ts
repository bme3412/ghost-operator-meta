import type { BrowserWindow } from 'electron'

/** Local page shown in the target window when the target server is unreachable. */
export const OFFLINE_PAGE = 'target-offline.html'

/**
 * True when the target window may navigate to `rawUrl`: the configured
 * target origin, the local offline page, or the initial blank document.
 * Pure; unit-tested.
 */
export function isTargetNavigationAllowed(rawUrl: string, targetUrl: string): boolean {
  if (rawUrl === 'about:blank') return true
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (parsed.protocol === 'file:') {
    return parsed.pathname.endsWith(`/${OFFLINE_PAGE}`)
  }
  let targetOrigin: string
  try {
    targetOrigin = new URL(targetUrl).origin
  } catch {
    return false
  }
  return parsed.origin === targetOrigin
}

/** Deny popups and permissions. Shared by every window. */
function denyPopupsAndPermissions(window: BrowserWindow): void {
  const contents = window.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}

/**
 * Lock the target window to the live target origin; deny popups and
 * permissions. The origin is resolved per navigation via `getTargetUrl` so
 * switching sites re-scopes the allowlist without reinstalling the guards.
 */
export function applyTargetGuards(window: BrowserWindow, getTargetUrl: () => string): void {
  window.webContents.on('will-navigate', (details) => {
    if (details.isMainFrame && !isTargetNavigationAllowed(details.url, getTargetUrl())) {
      details.preventDefault()
    }
  })
  window.webContents.on('will-redirect', (details) => {
    if (details.isMainFrame && !isTargetNavigationAllowed(details.url, getTargetUrl())) {
      details.preventDefault()
    }
  })
  denyPopupsAndPermissions(window)
}

/** Deny popups and permissions in first-party app windows. */
export function applyAppWindowGuards(window: BrowserWindow): void {
  denyPopupsAndPermissions(window)
}
