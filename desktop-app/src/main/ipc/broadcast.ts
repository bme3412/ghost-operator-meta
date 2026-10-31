import { getWindow, type WindowRole } from '../windows/registry'
import { EVENTS } from './channels'

/**
 * Send a push event to exactly the registered windows that need it — never
 * to every live webContents. Unregistered windows (the hidden scout crawler)
 * receive nothing, so scanned pages can't subscribe to run inputs or
 * recording state.
 */
export function sendToRoles(
  roles: readonly WindowRole[],
  channel: string,
  payload?: unknown
): void {
  for (const role of roles) {
    const window = getWindow(role)
    if (!window) continue
    if (payload === undefined) window.webContents.send(channel)
    else window.webContents.send(channel, payload)
  }
}

/** Notify the panel that recordings, skills, or runs changed. */
export function broadcastLibraryChanged(): void {
  sendToRoles(['panel'], EVENTS.libraryChanged)
}
