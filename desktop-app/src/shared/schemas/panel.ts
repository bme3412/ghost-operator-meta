import { z } from 'zod'

/** List-row projection of a recording. Detail comes from recordings:get. */
export interface RecordingSummary {
  id: string
  goal: string
  applicationScope: string
  startedAt: string
  endedAt: string | null
  eventCount: number
  noteCount: number
}

export const PANEL_VIEWS = [
  'home',
  'teach',
  'recording',
  'review',
  'runSetup',
  'running',
  'result',
  'batch',
  'library',
  'settings'
] as const

export const LIBRARY_TABS = ['skills', 'runs', 'recordings', 'map'] as const

/**
 * Main → panel navigation push (ghost:panel-navigate). The panel also
 * navigates locally for in-window moves; this carries main-initiated moves
 * (recording finished, run started, suggestion accepted).
 */
export const PanelNavigateParams = z.object({
  view: z.enum(PANEL_VIEWS),
  recordingId: z.string().min(1).optional(),
  skillId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  goal: z.string().optional(),
  libraryTab: z.enum(LIBRARY_TABS).optional()
})
export type PanelNavigateParams = z.infer<typeof PanelNavigateParams>
