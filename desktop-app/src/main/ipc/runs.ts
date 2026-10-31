import { ipcMain } from 'electron'
import { ProviderId, RunIdPayload, StartRunRequest } from '../../shared/schemas'
import { explainCurrentStep, getRunner } from '../runner/service'
import { getRun, listRuns } from '../store'
import { focusSidecar, getWindow, openStudioForRun } from '../windows/registry'
import { CHANNELS, EVENTS } from './channels'

const ExplainPayload = RunIdPayload.extend({ providerId: ProviderId })

export function registerRunHandlers(): void {
  const runner = (): ReturnType<typeof getRunner> => getRunner()

  ipcMain.handle(CHANNELS.runsStart, (_event, payload: unknown) => {
    const request = StartRunRequest.parse(payload)
    const progress = runner().startRun(request)
    focusSidecar()
    return progress
  })

  ipcMain.handle(CHANNELS.runsState, () => runner().getProgress())

  ipcMain.handle(CHANNELS.runsPause, (_event, payload: unknown) => {
    return runner().pauseRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsResume, (_event, payload: unknown) => {
    return runner().resumeRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsStop, (_event, payload: unknown) => {
    return runner().stopRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsAdvance, (_event, payload: unknown) => {
    return runner().advanceRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsApprove, (_event, payload: unknown) => {
    return runner().approveRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsRetry, (_event, payload: unknown) => {
    return runner().retryRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsExplain, (_event, payload: unknown) => {
    const { runId, providerId } = ExplainPayload.parse(payload)
    return explainCurrentStep(runId, providerId)
  })

  ipcMain.handle(CHANNELS.runsShowInStudio, (_event, payload: unknown) => {
    openStudioForRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsList, () => listRuns())

  ipcMain.handle(CHANNELS.runsGet, (_event, payload: unknown) => {
    return getRun(RunIdPayload.parse(payload).runId)
  })

  ipcMain.handle(CHANNELS.runsShowTarget, (_event, payload: unknown) => {
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
