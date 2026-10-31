import { app, BrowserWindow, screen } from 'electron'
import { loadLocalEnv } from './env'
import { registerIpcHandlers } from './ipc'
import { registerWindow } from './windows/registry'
import { createPanelWindow, PANEL_DOCKED_WIDTH } from './windows/panel'
import { createTargetWindow } from './windows/target'

/** Local .env.local first so providers/target see it; real env always wins. */
loadLocalEnv()

/** Two windows: the target site on the left, the Ghost panel docked right. */
function createAllWindows(): void {
  const area = screen.getPrimaryDisplay().workArea
  const margin = 24
  const gap = 8

  const targetWidth = Math.max(
    960,
    Math.round(area.width - PANEL_DOCKED_WIDTH - margin * 2 - gap)
  )
  const targetHeight = Math.min(900, area.height - margin * 2)
  const target = createTargetWindow({
    x: area.x + margin,
    y: area.y + margin,
    width: targetWidth,
    height: targetHeight
  })
  registerWindow('target', target)
  registerWindow('panel', createPanelWindow(target))
}

void app.whenReady().then(() => {
  registerIpcHandlers()
  createAllWindows()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAllWindows()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
