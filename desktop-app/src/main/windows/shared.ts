import { BrowserWindow } from 'electron'
import { join } from 'node:path'

export type RendererPage = 'toolbar' | 'sidecar' | 'studio' | 'target-offline'

export function isDev(): boolean {
  return process.env['ELECTRON_RENDERER_URL'] !== undefined
}

function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

export function baseWebPreferences(): Electron.WebPreferences {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    // Sandboxed renderers get no Node.js; they reach main only through the
    // contextBridge surface. The preload uses ipcRenderer/DOM only, so every
    // window — including the remote target — runs sandboxed.
    sandbox: true
  }
}

export function loadPage(window: BrowserWindow, page: RendererPage): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl !== undefined) {
    void window.loadURL(`${devUrl.replace(/\/$/, '')}/${page}.html`)
  } else {
    void window.loadFile(join(__dirname, `../renderer/${page}.html`))
  }
}
