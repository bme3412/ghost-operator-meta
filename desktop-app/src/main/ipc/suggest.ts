import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { SuggestIdRequest, SuggestListRequest } from '../../shared/schemas'
import {
  acceptSuggestion,
  dismissSuggestion,
  listSuggestions,
  listSuggestionsPolished
} from '../suggest'
import { navigatePanel } from '../windows/registry'
import { broadcastLibraryChanged } from './broadcast'
import { CHANNELS } from './channels'
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
    navigatePanel({ view: 'teach', goal: prefill.goal })
    return prefill
  })
}
