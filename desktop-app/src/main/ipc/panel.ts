import { ipcMain, screen, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { dockedPanelRect, expandedSplit } from '../windows/layout'
import { PANEL_DOCKED_WIDTH } from '../windows/panel'
import { getWindow } from '../windows/registry'
import { CHANNELS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

const LayoutPayload = z.object({ layout: z.enum(['docked', 'expanded']) })

/**
 * Panel layout switching: docked (420px) for the guided flow, expanded for
 * the Library. Expanded reflows both windows into the work area (target
 * left ~58%, panel right ~42%) so the Library sits beside the site instead
 * of covering it; docked re-docks the 420px panel beside the target. The
 * docked panel stays always on top so recording controls remain visible
 * during a demonstration; the expanded Library does not.
 */
export function registerPanelHandlers(): void {
  ipcMain.handle(CHANNELS.panelSetLayout, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.panelSetLayout, APP_ROLES)
    const { layout } = LayoutPayload.parse(payload)
    const panel = getWindow('panel')
    if (!panel) return
    try {
      const target = getWindow('target')
      const area = screen.getDisplayMatching(panel.getBounds()).workArea
      if (layout === 'expanded') {
        const split = expandedSplit(area)
        if (target) target.setBounds(split.target)
        panel.setBounds(split.panel)
      } else if (target) {
        const [, height] = panel.getContentSize()
        const rect = dockedPanelRect(target.getBounds(), area, PANEL_DOCKED_WIDTH, height)
        if (rect) panel.setBounds(rect)
        else panel.setContentSize(PANEL_DOCKED_WIDTH, height)
      } else {
        const [, height] = panel.getContentSize()
        panel.setContentSize(PANEL_DOCKED_WIDTH, height)
      }
    } catch {
      // Geometry is best-effort: fall back to leaving the windows as they are.
    }
    panel.setAlwaysOnTop(layout === 'docked')
  })
}
