import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { getTargetInfo, getTargetStatus, setTargetUrl } from '../target'
import { showTarget } from '../windows/registry'
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
}
