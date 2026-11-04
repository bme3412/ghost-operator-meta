import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { getTargetInfo, getTargetStatus, setTargetUrl } from '../target'
import { getWindow, showTarget } from '../windows/registry'
import { CHANNELS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

const SetUrlPayload = z.object({ url: z.string().min(1).max(2000) })

export function registerTargetHandlers(): void {
  ipcMain.handle(CHANNELS.targetGetInfo, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.targetGetInfo, APP_ROLES)
    return getTargetInfo()
  })
  ipcMain.handle(CHANNELS.targetSetUrl, async (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.targetSetUrl, APP_ROLES)
    const { url } = SetUrlPayload.parse(payload)
    return setTargetUrl(url)
  })
  ipcMain.handle(CHANNELS.targetGetStatus, async (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.targetGetStatus, APP_ROLES)
    return getTargetStatus()
  })
  ipcMain.handle(CHANNELS.targetShow, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.targetShow, APP_ROLES)
    showTarget()
  })
  ipcMain.handle(CHANNELS.targetOpenCase, async (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.targetOpenCase, APP_ROLES)
    const { ticketId } = z.object({ ticketId: z.string().min(1).max(64) }).parse(payload)
    const target = getWindow('target')
    if (!target) return
    const inbox = `${getTargetInfo().url.replace(/\/$/, '')}/staff/inbox`
    if (!target.webContents.getURL().startsWith(inbox)) {
      await target.loadURL(inbox).catch(() => undefined)
    }
    // Bring the specific request into view; this only shows context in
    // Saltbreak and never starts a run.
    await target.webContents
      .executeJavaScript(
        `(() => { const el = document.querySelector('[data-ticket-id=' + JSON.stringify(${JSON.stringify(ticketId)}) + ']'); if (el) el.scrollIntoView({ block: 'center' }); return Boolean(el); })()`
      )
      .catch(() => undefined)
    showTarget()
  })
}
