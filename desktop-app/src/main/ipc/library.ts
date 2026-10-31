import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import {
  CompileRequest,
  PublishRequest,
  SaveDraftRequest,
  ScriptRequest,
  UpdateDraftRequest,
  type CompileResult
} from '../../shared/schemas'
import { compileRecording } from '../compiler'
import { scriptedProposal } from '../providers/fixture'
import { screenshotPathForRef } from '../recorder/service'
import { getSkill, listSkills, publishSkill, saveDraft, updateDraft } from '../skills'
import { loadState } from '../store'
import { broadcastLibraryChanged } from './broadcast'
import { CHANNELS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

const IdPayload = z.object({ id: z.string().min(1) })
const ScreenshotPayload = z.object({ ref: z.string().min(1) })
const SAFE_SCREENSHOT = /^screenshots\/[A-Za-z0-9._-]+\.png$/

export function registerLibraryHandlers(): void {
  ipcMain.handle(CHANNELS.recordingsList, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.recordingsList, APP_ROLES)
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

  ipcMain.handle(CHANNELS.recordingsGet, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.recordingsGet, APP_ROLES)
    const { id } = IdPayload.parse(payload)
    return loadState().recordings.find((r) => r.id === id) ?? null
  })

  ipcMain.handle(CHANNELS.recordingsScreenshot, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.recordingsScreenshot, APP_ROLES)
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

  ipcMain.handle(CHANNELS.skillsList, (event: IpcMainInvokeEvent) => {
    assertSenderRole(event, CHANNELS.skillsList, APP_ROLES)
    return listSkills()
  })

  ipcMain.handle(CHANNELS.skillsGet, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.skillsGet, APP_ROLES)
    const { id } = IdPayload.parse(payload)
    return getSkill(id)
  })

  ipcMain.handle(CHANNELS.skillsCompile, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.skillsCompile, APP_ROLES)
    const request = CompileRequest.parse(payload)
    return compileRecording(request)
  })

  ipcMain.handle(CHANNELS.skillsScript, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.skillsScript, APP_ROLES)
    const { scriptedId } = ScriptRequest.parse(payload)
    const proposal = scriptedProposal(scriptedId)
    const result: CompileResult = proposal
      ? { ok: true, proposal, providerId: 'fixture' }
      : { ok: false, errors: [`No scripted proposal for "${scriptedId}".`] }
    return result
  })

  ipcMain.handle(CHANNELS.skillsSaveDraft, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.skillsSaveDraft, APP_ROLES)
    const request = SaveDraftRequest.parse(payload)
    const skill = saveDraft(request)
    broadcastLibraryChanged()
    return skill
  })

  ipcMain.handle(CHANNELS.skillsUpdateDraft, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.skillsUpdateDraft, APP_ROLES)
    const request = UpdateDraftRequest.parse(payload)
    const skill = updateDraft(request)
    broadcastLibraryChanged()
    return skill
  })

  ipcMain.handle(CHANNELS.skillsPublish, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.skillsPublish, APP_ROLES)
    const request = PublishRequest.parse(payload)
    const skill = publishSkill(request.skillId, request.version)
    broadcastLibraryChanged()
    return skill
  })
}
