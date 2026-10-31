import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ProviderId, RunIdPayload, StartRunRequest } from '../../shared/schemas'
import { explainCurrentStep, getRunner } from '../runner/service'
import { getRun, listRuns } from '../store'
import { focusSidecar, getWindow, openStudioForRun } from '../windows/registry'
import { CHANNELS, EVENTS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

const ExplainPayload = RunIdPayload.extend({ providerId: ProviderId })

export function registerRunHandlers(): void {
  const runner = (): ReturnType<typeof getRunner> => getRunner()

  ipcMain.handle(CHANNELS.runsStart, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsStart, APP_ROLES)
    const request = StartRunRequest.parse(payload)
    const progress = runner().startRun(request)
    focusSidecar()
    return progress
  })

  ipcMain.handle(CHANNELS.runsState, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.runsState, APP_ROLES)
    return runner().getProgress()
  })

  ipcMain.handle(CHANNELS.runsPause, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsPause, APP_ROLES)
    return runner().pauseRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsResume, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsResume, APP_ROLES)
    return runner().resumeRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsStop, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsStop, APP_ROLES)
    return runner().stopRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsAdvance, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsAdvance, APP_ROLES)
    return runner().advanceRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsApprove, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsApprove, APP_ROLES)
    return runner().approveRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsRetry, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsRetry, APP_ROLES)
    return runner().retryRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsExplain, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsExplain, APP_ROLES)
    const { runId, providerId } = ExplainPayload.parse(payload)
    return explainCurrentStep(runId, providerId)
  })

  ipcMain.handle(CHANNELS.runsShowInStudio, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsShowInStudio, APP_ROLES)
    openStudioForRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsList, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.runsList, APP_ROLES)
    return listRuns()
  })

  ipcMain.handle(CHANNELS.runsGet, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsGet, APP_ROLES)
    return getRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsShowTarget, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.runsShowTarget, APP_ROLES)
    const { runId } = RunIdPayload.parse(payload)
    const progress = runner().getProgress()
    if (!progress || progress.runId !== runId || !progress.current) {
      throw new Error(`No current step for run ${runId}.`)
    }
    getWindow('target')?.webContents.send(
      EVENTS.highlight,
      progress.current.bindings['selector']?.value ?? null
    )
  })
}
