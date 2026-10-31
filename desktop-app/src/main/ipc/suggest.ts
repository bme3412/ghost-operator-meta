import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  SuggestIdRequest,
  SuggestListRequest,
  SuggestPageRequest,
  type PageIdeasResult
} from '../../shared/schemas'
import {
  acceptSuggestion,
  dismissSuggestion,
  getPageIdeas,
  listSuggestions,
  listSuggestionsPolished,
  readCurrentPage
} from '../suggest'
import { getTargetInfo } from '../target'
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

  ipcMain.handle(CHANNELS.suggestPage, async (event: IpcMainInvokeEvent, payload: unknown) => {
    assertSenderRole(event, CHANNELS.suggestPage, APP_ROLES)
    const { refresh, fast } = SuggestPageRequest.parse(payload ?? {})
    try {
      const site = getTargetInfo()
      const current = await readCurrentPage()
      return getPageIdeas({ ...current, site }, { refresh, fast })
    } catch {
      // The target routinely has no readable page (still loading, showing
      // the offline page): resolve an empty result instead of rejecting, so
      // the panel shows a calm empty state and refetches on the next page
      // push. The sender check above still rejects.
      const empty: PageIdeasResult = {
        page: { url: '', path: '', title: '' },
        ideas: [],
        source: 'heuristic',
        warning: 'Ideas will appear when the website loads.'
      }
      return empty
    }
  })
}
