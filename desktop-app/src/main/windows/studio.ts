import { BrowserWindow } from 'electron'
import { applyAppWindowGuards } from './guards'
import { baseWebPreferences, loadPage } from './shared'

export function createStudioWindow(position?: { x: number; y: number }): BrowserWindow {
  const window = new BrowserWindow({
    title: 'Ghost Operator Studio',
    width: 1100,
    height: 800,
    useContentSize: true,
    x: position?.x,
    y: position?.y,
    minWidth: 880,
    minHeight: 600,
    webPreferences: baseWebPreferences(),
    show: false
  })
  window.once('ready-to-show', () => window.show())
  applyAppWindowGuards(window)
  loadPage(window, 'studio')
  return window
}
