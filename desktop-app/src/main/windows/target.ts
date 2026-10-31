import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { inPageNavigateToEmit, pathnameOfHttpUrl } from '../../shared/capture/navigate'
import { getRecorder } from '../recorder/service'
import { getTargetInfo } from '../target'
import { applyTargetGuards } from './guards'
import { baseWebPreferences } from './shared'

/**
 * The web application under operation. Loads the configured target URL; when
 * the target server is unreachable, shows a local page explaining how to
 * start it instead of a Chromium error.
 */
export function createTargetWindow(position?: { x: number; y: number }): BrowserWindow {
  const { name, url } = getTargetInfo()
  const window = new BrowserWindow({
    title: name,
    width: 1280,
    height: 860,
    useContentSize: true,
    x: position?.x,
    y: position?.y,
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

  window.webContents.on('did-fail-load', (_event, code, _description, validatedUrl) => {
    if (code === -3) return // Aborted by a newer navigation; ignore.
    if (!validatedUrl.startsWith(getTargetInfo().url)) return
    window.loadFile(join(__dirname, '../renderer/target-offline.html')).catch(() => undefined)
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
    window.loadFile(join(__dirname, '../renderer/target-offline.html')).catch(() => undefined)
  })
  return window
}
