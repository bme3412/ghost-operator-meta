import type { BrowserWindow, WebContents } from 'electron'
import { EVENTS } from '../ipc/channels'

export type WindowRole = 'target' | 'toolbar' | 'sidecar' | 'studio'

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

/** Open the studio on a finished recording. Called when a recording finishes. */
export function openStudioForRecording(recordingId: string): void {
  const studio = getWindow('studio')
  if (!studio) return
  studio.show()
  studio.focus()
  studio.webContents.send(EVENTS.studioShow, { section: 'recordings', recordingId })
}

/** Open the studio on a finished run. */
export function openStudioForRun(runId: string): void {
  const studio = getWindow('studio')
  if (!studio) return
  studio.show()
  studio.focus()
  studio.webContents.send(EVENTS.studioShow, { section: 'runs', runId })
}

/** Return focus to the sidecar when the user starts reusing a skill. */
export function focusSidecar(): void {
  const sidecar = getWindow('sidecar')
  if (!sidecar) return
  sidecar.show()
  sidecar.focus()
}
