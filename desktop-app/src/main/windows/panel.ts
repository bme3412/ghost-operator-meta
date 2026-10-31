import { BrowserWindow, dialog, screen } from 'electron'
import { getRecorder } from '../recorder/service'
import { applyPanelGuards } from './guards'
import { navigatePanel } from './registry'
import { baseWebPreferences, isDev, loadPage } from './shared'

/** Docked width for the guided flow; expanded width for the Library. */
export const PANEL_DOCKED_WIDTH = 420
export const PANEL_EXPANDED_WIDTH = 1060
export const PANEL_HEIGHT = 800

/**
 * The single Ghost control surface: Home, Teach, recording, review, run, and
 * library views in one window docked beside the target. Always on top while
 * docked so recording controls stay visible during a demonstration.
 */
export function createPanelWindow(target: BrowserWindow): BrowserWindow {
  const window = new BrowserWindow({
    title: 'Ghost Operator',
    width: PANEL_DOCKED_WIDTH,
    height: PANEL_HEIGHT,
    useContentSize: true,
    minWidth: 360,
    minHeight: 600,
    alwaysOnTop: true,
    webPreferences: {
      ...baseWebPreferences(),
      additionalArguments: ['--ghost-role=panel']
    },
    show: false
  })

  const place = (): void => {
    try {
      const bounds = target.getBounds()
      const display = screen.getDisplayMatching(bounds)
      const area = display.workArea
      const x = bounds.x + bounds.width + 8
      if (x + PANEL_DOCKED_WIDTH <= area.x + area.width) {
        window.setBounds({
          x,
          y: bounds.y,
          width: PANEL_DOCKED_WIDTH,
          height: Math.min(PANEL_HEIGHT, area.height)
        })
      }
    } catch {
      // Fall back to the default cascade position.
    }
  }
  place()

  window.once('ready-to-show', () => window.show())
  applyPanelGuards(window)
  // Prod-only Content Security Policy for the panel document. Applied as a
  // response header (not a meta tag) so dev HMR keeps working; the session
  // is shared, so the filter matches the panel page only — and matching
  // extra URLs would only harden them, never widen them.
  if (!isDev()) {
    window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      if (details.resourceType === 'mainFrame' && details.url.endsWith('/panel.html')) {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
            ]
          }
        })
      } else {
        callback({})
      }
    })
  }
  loadPage(window, 'panel')

  let forceClose = false
  window.on('close', (event) => {
    if (forceClose) return
    if (getRecorder().getPush().status === 'idle') return
    event.preventDefault()
    void dialog
      .showMessageBox(window, {
        type: 'warning',
        title: 'Recording in progress',
        message: 'A recording is in progress. Finish it or discard it?',
        buttons: ['Finish recording', 'Discard', 'Keep recording'],
        defaultId: 2,
        cancelId: 2
      })
      .then(({ response }) => {
        // Finish lands on the review view and keeps the panel open: it is
        // the only control surface, so closing it would strand the user.
        if (response === 0) {
          void getRecorder()
            .finish()
            .then((recording) => navigatePanel({ view: 'review', recordingId: recording.id }))
            .catch(() => undefined)
          return
        }
        if (response !== 1) return
        getRecorder().cancel()
        forceClose = true
        window.close()
      })
  })

  return window
}
