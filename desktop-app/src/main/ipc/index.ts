import { ipcMain } from 'electron'
import { EchoRequest } from '../../shared/schemas'
import { CHANNELS } from './channels'
import { registerProviderHandlers } from './providers'
import { registerRecorderHandlers } from './recorder'
import { registerRunHandlers } from './runs'
import { registerScoutHandlers } from './scout'
import { registerStudioHandlers } from './studio'
import { registerSuggestHandlers } from './suggest'
import { registerTargetHandlers } from './target'

export function registerIpcHandlers(): void {
  // ping/echo are stateless diagnostics with no reads or writes; every other
  // channel validates its sender role (see sender.ts).
  ipcMain.handle(CHANNELS.ping, () => 'pong')
  ipcMain.handle(CHANNELS.echo, (_event, payload: unknown) => {
    const request = EchoRequest.parse(payload)
    return { message: request.message }
  })
  registerTargetHandlers()
  registerProviderHandlers()
  registerRecorderHandlers()
  registerRunHandlers()
  registerScoutHandlers()
  registerStudioHandlers()
  registerSuggestHandlers()
}
