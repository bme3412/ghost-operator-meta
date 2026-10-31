import { ipcMain } from 'electron'
import { EchoRequest } from '../../shared/schemas'
import { CHANNELS } from './channels'
import { registerRecorderHandlers } from './recorder'
import { registerRunHandlers } from './runs'
import { registerStudioHandlers } from './studio'
import { registerTargetHandlers } from './target'

export function registerIpcHandlers(): void {
  ipcMain.handle(CHANNELS.ping, () => 'pong')
  ipcMain.handle(CHANNELS.echo, (_event, payload: unknown) => {
    const request = EchoRequest.parse(payload)
    return { message: request.message }
  })
  registerTargetHandlers()
  registerRecorderHandlers()
  registerRunHandlers()
  registerStudioHandlers()
}
