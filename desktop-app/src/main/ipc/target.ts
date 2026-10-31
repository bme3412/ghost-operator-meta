import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { getTargetInfo, setTargetUrl } from '../target'
import { CHANNELS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

const SetUrlPayload = z.object({ url: z.string().min(1).max(2000) })

export function registerTargetHandlers(): void {
  ipcMain.handle(CHANNELS.targetGetInfo, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.targetGetInfo, APP_ROLES)
    return getTargetInfo()
  })
  ipcMain.handle(CHANNELS.targetSetUrl, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.targetSetUrl, APP_ROLES)
    const { url } = SetUrlPayload.parse(payload)
    return setTargetUrl(url)
  })
}
