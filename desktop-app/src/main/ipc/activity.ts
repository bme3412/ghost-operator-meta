import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ActivityActRequest, ActivityDismissRequest } from '../../shared/schemas'
import { actOnOpportunity, dismissOpportunity, getActivityFeed } from '../activity/service'
import { sendToRoles } from './broadcast'
import { CHANNELS, EVENTS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

/** Now-feed handlers: deterministic feed, feedback persistence, change push. */
export function registerActivityHandlers(): void {
  ipcMain.handle(CHANNELS.activityGetFeed, async (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.activityGetFeed, APP_ROLES)
    return getActivityFeed()
  })
  ipcMain.handle(CHANNELS.activityDismiss, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.activityDismiss, APP_ROLES)
    const { signature } = ActivityDismissRequest.parse(payload)
    dismissOpportunity(signature)
    sendToRoles(['panel'], EVENTS.activityChanged)
  })
  ipcMain.handle(CHANNELS.activityAct, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.activityAct, APP_ROLES)
    const { signature } = ActivityActRequest.parse(payload)
    actOnOpportunity(signature)
    sendToRoles(['panel'], EVENTS.activityChanged)
  })
}
