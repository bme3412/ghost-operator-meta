import { BrowserWindow } from 'electron'
import { EVENTS } from './channels'

/** Notify windows that recordings, skills, or runs changed. */
export function broadcastLibraryChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(EVENTS.libraryChanged)
  }
}
