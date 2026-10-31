import { ipcMain } from 'electron'
import { z } from 'zod'
import { RecordingEventInput, StartRecordingRequest } from '../../shared/schemas'
import { getRecorder } from '../recorder/service'
import { getWindow, openStudioForRecording } from '../windows/registry'
import { broadcastLibraryChanged } from './broadcast'
import { CHANNELS } from './channels'

const ContextPayload = z.object({ caseId: z.string().min(1).nullable() })
const NotePayload = z.object({ text: z.string() })
const HeightPayload = z.object({ height: z.number().int().min(64).max(400) })

export function registerRecorderHandlers(): void {
  const recorder = (): ReturnType<typeof getRecorder> => getRecorder()

  ipcMain.handle(CHANNELS.recorderGetState, () => recorder().getPush())

  ipcMain.handle(CHANNELS.recorderStart, (_event, payload: unknown) => {
    const request = StartRecordingRequest.parse(payload)
    return recorder().start(request.goal, request.caseId)
  })

  ipcMain.handle(CHANNELS.recorderPause, () => recorder().pause())

  ipcMain.handle(CHANNELS.recorderResume, () => recorder().resume())

  ipcMain.handle(CHANNELS.recorderContext, (_event, payload: unknown) => {
    const { caseId } = ContextPayload.parse(payload)
    recorder().setContext(caseId)
  })

  ipcMain.handle(CHANNELS.recorderEvents, (_event, payload: unknown) => {
    const inputs = z.array(RecordingEventInput).parse(payload)
    return recorder().appendEvents(inputs)
  })

  ipcMain.handle(CHANNELS.recorderNote, (_event, payload: unknown) => {
    const { text } = NotePayload.parse(payload)
    return recorder().addNote(text)
  })

  ipcMain.handle(CHANNELS.recorderFinish, async () => {
    const recording = await recorder().finish()
    broadcastLibraryChanged()
    openStudioForRecording(recording.id)
    return recording
  })

  ipcMain.handle(CHANNELS.recorderCancel, () => recorder().cancel())

  ipcMain.handle(CHANNELS.toolbarSetHeight, (_event, payload: unknown) => {
    const { height } = HeightPayload.parse(payload)
    getWindow('toolbar')?.setContentSize(480, height)
  })
}
