import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { resolveProviderId } from '../providers'
import { CHANNELS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

export function registerProviderHandlers(): void {
  ipcMain.handle(CHANNELS.providersDefault, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.providersDefault, APP_ROLES)
    return resolveProviderId()
  })
}
