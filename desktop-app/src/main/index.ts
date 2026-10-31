import { app, BrowserWindow, screen } from 'electron'
import { registerIpcHandlers } from './ipc'
import { registerWindow } from './windows/registry'
import { createSidecarWindow } from './windows/sidecar'
import { createStudioWindow } from './windows/studio'
import { createTargetWindow } from './windows/target'
import { createToolbarWindow } from './windows/toolbar'

/** Initial layout: target left, toolbar top-center, studio centered, sidecar docked. */
function createAllWindows(): void {
  const area = screen.getPrimaryDisplay().workArea
  const margin = 24

  const target = createTargetWindow({ x: area.x + margin, y: area.y + margin })
  registerWindow('target', target)

  const toolbarWidth = 480
  registerWindow(
    'toolbar',
    createToolbarWindow({
      x: Math.round(area.x + Math.max(0, (area.width - toolbarWidth) / 2)),
      y: area.y + 16
    })
  )
  registerWindow('sidecar', createSidecarWindow(target))

  const studioWidth = Math.min(1100, area.width - margin * 2)
  const studioHeight = Math.min(800, area.height - margin * 2)
  registerWindow(
    'studio',
    createStudioWindow({
      x: Math.round(area.x + (area.width - studioWidth) / 2),
      y: Math.round(area.y + (area.height - studioHeight) / 2)
    })
  )
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
