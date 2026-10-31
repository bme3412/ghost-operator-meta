import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { getTargetInfo } from '../target'
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

  window.webContents.on('did-fail-load', (_event, code, _description, validatedUrl) => {
    if (code === -3) return // Aborted by a newer navigation; ignore.
    if (!validatedUrl.startsWith(url)) return
    window.loadFile(join(__dirname, '../renderer/target-offline.html')).catch(() => undefined)
  })

  window.loadURL(url).catch(() => {
    window.loadFile(join(__dirname, '../renderer/target-offline.html')).catch(() => undefined)
  })
  return window
}
