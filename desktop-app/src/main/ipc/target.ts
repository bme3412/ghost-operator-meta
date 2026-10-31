import { ipcMain } from 'electron'
import { getTargetInfo } from '../target'
import { CHANNELS } from './channels'

export function registerTargetHandlers(): void {
  ipcMain.handle(CHANNELS.targetGetInfo, () => getTargetInfo())
}
