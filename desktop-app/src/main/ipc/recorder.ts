import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { RecordingEventInput, StartRecordingRequest } from '../../shared/schemas'
import { getRecorder } from '../recorder/service'
import { navigatePanel } from '../windows/registry'
import { broadcastLibraryChanged } from './broadcast'
import { CHANNELS } from './channels'
import { ALL_ROLES, APP_ROLES, TARGET_ONLY, assertSenderRole } from './sender'

const ContextPayload = z.object({ caseId: z.string().min(1).nullable() })
const NotePayload = z.object({ text: z.string().max(2000) })

export function registerRecorderHandlers(): void {
  const recorder = (): ReturnType<typeof getRecorder> => getRecorder()

  ipcMain.handle(CHANNELS.recorderGetState, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.recorderGetState, ALL_ROLES)
    return recorder().getPush()
  })

  ipcMain.handle(CHANNELS.recorderStart, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.recorderStart, APP_ROLES)
    const request = StartRecordingRequest.parse(payload)
    return recorder().start(request.goal, request.caseId)
  })

  ipcMain.handle(CHANNELS.recorderPause, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.recorderPause, APP_ROLES)
    return recorder().pause()
  })

  ipcMain.handle(CHANNELS.recorderResume, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.recorderResume, APP_ROLES)
    return recorder().resume()
  })

  ipcMain.handle(CHANNELS.recorderContext, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.recorderContext, APP_ROLES)
    const { caseId } = ContextPayload.parse(payload)
    recorder().setContext(caseId)
  })

  ipcMain.handle(CHANNELS.recorderEvents, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.recorderEvents, TARGET_ONLY)
    const inputs = z.array(RecordingEventInput).parse(payload)
    return recorder().appendEvents(inputs)
  })

  ipcMain.handle(CHANNELS.recorderNote, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.recorderNote, APP_ROLES)
    const { text } = NotePayload.parse(payload)
    return recorder().addNote(text)
  })

  ipcMain.handle(CHANNELS.recorderFinish, async (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.recorderFinish, APP_ROLES)
    const recording = await recorder().finish()
    broadcastLibraryChanged()
    navigatePanel({ view: 'review', recordingId: recording.id })
    return recording
  })

  ipcMain.handle(CHANNELS.recorderCancel, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.recorderCancel, APP_ROLES)
    return recorder().cancel()
  })
}
