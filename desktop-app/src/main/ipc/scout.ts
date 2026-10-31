import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ScoutStartRequest } from '../../shared/schemas'
import { cancelScan, getScoutStatus, startScan } from '../scout/service'
import { CHANNELS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

export function registerScoutHandlers(): void {
  ipcMain.handle(CHANNELS.scoutStart, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.scoutStart, APP_ROLES)
    const { siteId } = ScoutStartRequest.parse(payload ?? {})
    const { status, done } = startScan(siteId)
    // The crawl runs detached; progress and completion arrive via the
    // scout-progress push. Guard the floated promise against unhandled
    // rejections (runScan already converts failures into outcomes).
    done.catch(() => undefined)
    return status
  })

  ipcMain.handle(CHANNELS.scoutCancel, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.scoutCancel, APP_ROLES)
    return cancelScan()
  })

  ipcMain.handle(CHANNELS.scoutStatus, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.scoutStatus, APP_ROLES)
    return getScoutStatus()
  })
}
