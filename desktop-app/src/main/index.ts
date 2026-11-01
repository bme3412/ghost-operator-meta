import { app, BrowserWindow, screen } from 'electron'
import { refreshActivity } from './activity/service'
import { startAwayServer, stopAwayServer } from './away'
import { loadLocalEnv } from './env'
import { registerIpcHandlers } from './ipc'
import { sendToRoles } from './ipc/broadcast'
import { EVENTS } from './ipc/channels'
import { getScoutStatus, getSiteMap, startScan } from './scout/service'
import { seedStarterSkills } from './skills'
import { getTargetStatus } from './target'
import { registerWindow } from './windows/registry'
import { createPanelWindow, PANEL_DOCKED_WIDTH } from './windows/panel'
import { createTargetWindow } from './windows/target'

/**
 * First-launch site scan: once the target answers and no sitemap exists yet,
 * scan it in the background so Task map and suggestions are populated without
 * a manual Rescan. Once per site per launch; manual rescans stay manual.
 */
async function scanSiteOnFirstLaunch(): Promise<void> {
  try {
    const status = await getTargetStatus()
    if (!status.reachable) return
    if (getSiteMap(status.id) !== null) return
    if (getScoutStatus().running) return
    startScan(status.id)
  } catch {
    // Scan is best-effort at launch; the user can always rescan manually.
  }
}

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
  // Seed before windows exist so Home's first skills fetch sees the starters.
  seedStarterSkills()
  createAllWindows()
  startAwayServer()
  void scanSiteOnFirstLaunch()
  // Now feed: ingest Saltbreak events in the background; the panel refetches
  // when new events land (it also refetches on its own interval on Home).
  const pollActivity = (): void => {
    void refreshActivity().then((added) => {
      if (added > 0) sendToRoles(['panel'], EVENTS.activityChanged)
    })
  }
  pollActivity()
  setInterval(pollActivity, 15_000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAllWindows()
    }
  })
})

app.on('will-quit', stopAwayServer)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
