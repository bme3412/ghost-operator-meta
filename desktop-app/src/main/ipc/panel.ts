import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { getWindow } from '../windows/registry'
import { PANEL_DOCKED_WIDTH, PANEL_EXPANDED_WIDTH } from '../windows/panel'
import { CHANNELS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

const LayoutPayload = z.object({ layout: z.enum(['docked', 'expanded']) })

/**
 * Panel width switching: docked (420px) for the guided flow, expanded for
 * the Library. The docked panel stays always on top so recording controls
 * remain visible during a demonstration; the expanded Library does not.
 */
export function registerPanelHandlers(): void {
  ipcMain.handle(CHANNELS.panelSetLayout, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.panelSetLayout, APP_ROLES)
    const { layout } = LayoutPayload.parse(payload)
    const panel = getWindow('panel')
    if (!panel) return
    const [, height] = panel.getContentSize()
    panel.setContentSize(layout === 'expanded' ? PANEL_EXPANDED_WIDTH : PANEL_DOCKED_WIDTH, height)
    panel.setAlwaysOnTop(layout === 'docked')
  })
}
