import { ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import {
  CompileRequest,
  PublishRequest,
  SaveDraftRequest,
  UpdateDraftRequest
} from '../../shared/schemas'
import { compileRecording } from '../compiler'
import { screenshotPathForRef } from '../recorder/service'
import { getSkill, listSkills, publishSkill, saveDraft, updateDraft } from '../skills'
import { loadState } from '../store'
import { broadcastLibraryChanged } from './broadcast'
import { CHANNELS } from './channels'

const IdPayload = z.object({ id: z.string().min(1) })
const ScreenshotPayload = z.object({ ref: z.string().min(1) })
const SAFE_SCREENSHOT = /^screenshots\/[A-Za-z0-9._-]+\.png$/

export function registerStudioHandlers(): void {
  ipcMain.handle(CHANNELS.recordingsList, () => {
    return loadState().recordings.map((r) => ({
      id: r.id,
      goal: r.goal,
      applicationScope: r.applicationScope,
      startedAt: r.startedAt,
      endedAt: r.endedAt ?? null,
      eventCount: r.events.length,
      noteCount: r.notes.length
    }))
  })

  ipcMain.handle(CHANNELS.recordingsGet, (_event, payload: unknown) => {
    const { id } = IdPayload.parse(payload)
    return loadState().recordings.find((r) => r.id === id) ?? null
  })

  ipcMain.handle(CHANNELS.recordingsScreenshot, (_event, payload: unknown) => {
    const { ref } = ScreenshotPayload.parse(payload)
    if (!SAFE_SCREENSHOT.test(ref)) {
      throw new Error('Invalid screenshot reference.')
    }
    try {
      const png = readFileSync(screenshotPathForRef(ref))
      return `data:image/png;base64,${png.toString('base64')}`
    } catch {
      return null
    }
  })

  ipcMain.handle(CHANNELS.skillsList, () => listSkills())

  ipcMain.handle(CHANNELS.skillsGet, (_event, payload: unknown) => {
    const { id } = IdPayload.parse(payload)
    return getSkill(id)
  })

  ipcMain.handle(CHANNELS.skillsCompile, (_event, payload: unknown) => {
    const request = CompileRequest.parse(payload)
    return compileRecording(request)
  })

  ipcMain.handle(CHANNELS.skillsSaveDraft, (_event, payload: unknown) => {
    const request = SaveDraftRequest.parse(payload)
    const skill = saveDraft(request)
    broadcastLibraryChanged()
    return skill
  })

  ipcMain.handle(CHANNELS.skillsUpdateDraft, (_event, payload: unknown) => {
    const request = UpdateDraftRequest.parse(payload)
    const skill = updateDraft(request)
    broadcastLibraryChanged()
    return skill
  })

  ipcMain.handle(CHANNELS.skillsPublish, (_event, payload: unknown) => {
    const request = PublishRequest.parse(payload)
    const skill = publishSkill(request.skillId, request.version)
    broadcastLibraryChanged()
    return skill
  })
}
