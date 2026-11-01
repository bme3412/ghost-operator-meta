import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { BatchIdPayload, StartBatchRequest } from '../../shared/schemas'
import { awayUrlFor } from '../away'
import { getBatchRunner } from '../runner/batchService'
import { findOpenCases } from '../runner/service'
import { getBatch, listBatches } from '../store'
import { navigatePanel } from '../windows/registry'
import { CHANNELS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

export function registerBatchHandlers(): void {
  ipcMain.handle(CHANNELS.batchesStart, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.batchesStart, APP_ROLES)
    const batch = getBatchRunner().start(StartBatchRequest.parse(payload))
    navigatePanel({ view: 'running' })
    return batch
  })

  ipcMain.handle(CHANNELS.batchesOpenCases, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.batchesOpenCases, APP_ROLES)
    return findOpenCases()
  })

  ipcMain.handle(CHANNELS.batchesList, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.batchesList, APP_ROLES)
    return listBatches()
  })

  ipcMain.handle(CHANNELS.batchesGet, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.batchesGet, APP_ROLES)
    return getBatch(BatchIdPayload.parse(payload).batchId)
  })

  ipcMain.handle(CHANNELS.batchesCancel, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.batchesCancel, APP_ROLES)
    return getBatchRunner().cancel(BatchIdPayload.parse(payload).batchId)
  })

  ipcMain.handle(CHANNELS.batchesAwayUrl, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.batchesAwayUrl, APP_ROLES)
    return awayUrlFor(BatchIdPayload.parse(payload).batchId)
  })
}
