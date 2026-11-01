import { registerActivityHandlers } from './activity'
import { registerBatchHandlers } from './batches'
import { registerProviderHandlers } from './providers'
import { registerRecorderHandlers } from './recorder'
import { registerRunHandlers } from './runs'
import { registerScoutHandlers } from './scout'
import { registerPanelHandlers } from './panel'
import { registerLibraryHandlers } from './library'
import { registerSuggestHandlers } from './suggest'
import { registerTargetHandlers } from './target'

export function registerIpcHandlers(): void {
  // Every channel validates its sender role (see sender.ts).
  registerTargetHandlers()
  registerProviderHandlers()
  registerRecorderHandlers()
  registerRunHandlers()
  registerBatchHandlers()
  registerActivityHandlers()
  registerScoutHandlers()
  registerLibraryHandlers()
  registerSuggestHandlers()
  registerPanelHandlers()
}
