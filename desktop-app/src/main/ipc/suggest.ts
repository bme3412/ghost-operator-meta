import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { SuggestIdRequest, SuggestListRequest } from '../../shared/schemas'
import {
  acceptSuggestion,
  dismissSuggestion,
  listSuggestions,
  listSuggestionsPolished
} from '../suggest'
import { getWindow } from '../windows/registry'
import { broadcastLibraryChanged } from './broadcast'
import { CHANNELS, EVENTS } from './channels'
import { APP_ROLES, assertSenderRole } from './sender'

export function registerSuggestHandlers(): void {
  ipcMain.handle(CHANNELS.suggestList, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.suggestList, APP_ROLES)
    const { siteId, polish } = SuggestListRequest.parse(payload ?? {})
    // The polish path never rejects: failures resolve to the heuristic
    // rows plus a warning. The plain path keeps its array contract.
    if (polish) return listSuggestionsPolished(siteId)
    return listSuggestions(siteId)
  })

  ipcMain.handle(CHANNELS.suggestDismiss, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.suggestDismiss, APP_ROLES)
    const { id } = SuggestIdRequest.parse(payload)
    const suggestion = dismissSuggestion(id)
    broadcastLibraryChanged()
    return suggestion
  })

  ipcMain.handle(CHANNELS.suggestAccept, (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.suggestAccept, APP_ROLES)
    const { id } = SuggestIdRequest.parse(payload)
    const { prefill } = acceptSuggestion(id)
    broadcastLibraryChanged()
    // Deliver the Teach prefill to the toolbar, mirroring the studioShow push.
    getWindow('toolbar')?.webContents.send(EVENTS.teachPrefill, { goal: prefill.goal })
    return prefill
  })
}
