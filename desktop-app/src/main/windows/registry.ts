import type { BrowserWindow, WebContents } from 'electron'
import type { PanelNavigateParams } from '../../shared/schemas'
import { EVENTS } from '../ipc/channels'

export type WindowRole = 'target' | 'panel'

const windows = new Map<WindowRole, BrowserWindow>()

export function registerWindow(role: WindowRole, window: BrowserWindow): void {
  windows.set(role, window)
  window.on('closed', () => {
    if (windows.get(role) === window) windows.delete(role)
  })
}

export function getWindow(role: WindowRole): BrowserWindow | undefined {
  const window = windows.get(role)
  if (window && !window.isDestroyed()) return window
  windows.delete(role)
  return undefined
}

/**
 * Map an IPC sender to its window role. Popups, destroyed windows, and any
 * other unregistered sender have no role and must be denied privileged IPC.
 */
export function roleForWebContents(sender: WebContents): WindowRole | undefined {
  for (const [role, window] of windows) {
    if (!window.isDestroyed() && window.webContents === sender) return role
  }
  return undefined
}

/**
 * Move the panel to a view. The single entry point for main-initiated
 * navigation (recording finished, run started, suggestion accepted).
 */
export function navigatePanel(params: PanelNavigateParams): void {
  const panel = getWindow('panel')
  if (!panel) return
  panel.show()
  panel.focus()
  panel.webContents.send(EVENTS.panelNavigate, params)
}

/** Bring the target window forward. */
export function showTarget(): void {
  const target = getWindow('target')
  if (!target) return
  target.show()
  target.focus()
}
