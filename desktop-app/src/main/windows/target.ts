import { BrowserWindow } from 'electron'
import { inPageNavigateToEmit, pathnameOfHttpUrl } from '../../shared/capture/navigate'
import { getRecorder } from '../recorder/service'
import { getTargetInfo, setTargetUrl } from '../target'
import { applyTargetGuards, isHttpsUpgrade, isTargetNavigationAllowed } from './guards'
import { baseWebPreferences, offlinePageFilePath } from './shared'

/**
 * Redirect destination cleaned for storage: the https origin plus the
 * destination path (the server-authoritative upgrade target). Falls back
 * to the raw URL when unparseable; setTargetUrl re-validates.
 */
function httpsUpgradeTarget(redirectUrl: string): string {
  try {
    const next = new URL(redirectUrl)
    return `${next.origin}${next.pathname}${next.search}`
  } catch {
    return redirectUrl
  }
}

/**
 * The web application under operation. Loads the configured target URL; when
 * the target server is unreachable, shows a local page explaining how to
 * start it instead of a Chromium error.
 */
export function createTargetWindow(placement?: {
  x: number
  y: number
  width: number
  height: number
}): BrowserWindow {
  const { name, url } = getTargetInfo()
  const window = new BrowserWindow({
    title: name,
    width: placement?.width ?? 1280,
    height: placement?.height ?? 860,
    useContentSize: true,
    x: placement?.x,
    y: placement?.y,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      ...baseWebPreferences(),
      additionalArguments: ['--ghost-role=target']
    },
    show: false
  })
  window.once('ready-to-show', () => window.show())
  applyTargetGuards(window, () => getTargetInfo().url)

  // The offline page is a static file with no IPC (the target window is
  // untrusted), so the live site name/URL travel as query parameters.
  const loadOfflinePage = (extra?: { reason: string; to: string }): void => {
    const { name, url } = getTargetInfo()
    window
      .loadFile(offlinePageFilePath(), { query: { name, url, ...extra } })
      .catch(() => undefined)
  }

  // Main-frame redirects the origin lock blocks. This listener runs after
  // the guard's (registered above), so a same-host http→https upgrade is
  // already canceled when detected here — the stored site is re-pointed at
  // https, which navigates fresh, instead of showing the offline page.
  // Every other blocked redirect is remembered so the offline page can say
  // where the site pointed instead of claiming nothing is listening.
  let upgradeInFlight = false
  let blockedRedirectHost: string | null = null
  window.webContents.on('will-redirect', (details) => {
    if (!details.isMainFrame) return
    const current = getTargetInfo().url
    if (isHttpsUpgrade(details.url, current)) {
      upgradeInFlight = true
      void setTargetUrl(httpsUpgradeTarget(details.url)).catch(() => {
        upgradeInFlight = false
        loadOfflinePage()
      })
      return
    }
    if (!isTargetNavigationAllowed(details.url, current)) {
      try {
        blockedRedirectHost = new URL(details.url).host
      } catch {
        blockedRedirectHost = details.url
      }
    }
  })

  window.webContents.on('did-fail-load', (_event, code, _description, validatedUrl) => {
    if (code === -3) return // Aborted by a newer navigation; ignore.
    if (!validatedUrl.startsWith(getTargetInfo().url)) return
    loadOfflinePage()
  })

  // Same-document (SPA) route changes never reload the page, so the preload
  // capture layer cannot see them — and an isolated preload cannot patch the
  // page's own history object. Observe them authoritatively here instead.
  // Full page loads are still reported by the preload on DOMContentLoaded.
  // The tracker syncs to every committed full navigation (did-navigate fires
  // at commit, before load and hydration), so a hydration-level replaceState
  // to the current path always reads as "no movement" at any Teach timing.
  let lastInPagePath: string | null = null
  window.webContents.on('did-navigate', (_event, url) => {
    const current = pathnameOfHttpUrl(url)
    if (current) lastInPagePath = current
  })
  window.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    const emit = inPageNavigateToEmit(lastInPagePath, url, isMainFrame)
    if (!emit) return
    lastInPagePath = emit
    void getRecorder()
      .appendEvents([{ type: 'navigate', value: emit, atMs: Date.now() }])
      .catch(() => undefined)
  })

  window.loadURL(url).catch(() => {
    // An in-flight https upgrade supersedes this failure: its own fresh
    // navigation is already on the way (with did-fail-load as its backstop).
    if (upgradeInFlight) return
    loadOfflinePage(
      blockedRedirectHost ? { reason: 'blocked-redirect', to: blockedRedirectHost } : undefined
    )
  })
  return window
}
