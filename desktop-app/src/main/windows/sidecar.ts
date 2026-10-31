import { BrowserWindow, screen } from 'electron'
import { applyAppWindowGuards } from './guards'
import { baseWebPreferences, loadPage } from './shared'

/** Guidance panel docked beside the target window when space allows. */
export function createSidecarWindow(target: BrowserWindow): BrowserWindow {
  const width = 360
  const height = 800
  const window = new BrowserWindow({
    title: 'Ghost Operator Guide',
    width,
    height,
    useContentSize: true,
    minWidth: 300,
    webPreferences: baseWebPreferences(),
    show: false
  })

  const place = (): void => {
    try {
      const bounds = target.getBounds()
      const display = screen.getDisplayMatching(bounds)
      const area = display.workArea
      const x = bounds.x + bounds.width + 8
      if (x + width <= area.x + area.width) {
        window.setBounds({ x, y: bounds.y, width, height: Math.min(height, area.height) })
        return
      }
    } catch {
      // Fall back to the default cascade position.
    }
  }
  place()

  window.once('ready-to-show', () => window.show())
  applyAppWindowGuards(window)
  loadPage(window, 'sidecar')
  return window
}
