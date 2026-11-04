export type PanelView =
  | 'home'
  | 'teach'
  | 'recording'
  | 'review'
  | 'runSetup'
  | 'running'
  | 'result'
  | 'batch'
  | 'library'
  | 'workItem'
  | 'settings'

export type LibraryTab = 'skills' | 'runs' | 'recordings' | 'map'

/**
 * In-panel navigation state. A superset of the main → panel push payload:
 * main navigates with view + ids, and in-window moves add demonstrated
 * input values (review → run setup) without another IPC round trip.
 */
export interface PanelNav {
  view: PanelView
  recordingId?: string
  skillId?: string
  runId?: string
  batchId?: string
  goal?: string
  /** Example input prefill for the Teach form (from a page idea). */
  example?: string
  /** Curated starter task id for the review view (instead of a recording). */
  scriptedId?: string
  /** Default skill name for the curated review flow. */
  scriptName?: string
  libraryTab?: LibraryTab
  /** Opportunity signature for the work-item detail view. */
  opportunityId?: string
  /** Filter Activity to this playbook (related activity). */
  focusSkillId?: string
  /** Revise this existing playbook instead of creating a new one. */
  updateSkillId?: string
  /** Focused record inside a library tab (skill, run, or recording id). */
  focusId?: string
  /** Demonstrated input values, keyed by input name. */
  demonstrated?: Record<string, string>
}

export type OnNav = (nav: PanelNav) => void

export const TERMINAL_RUN = new Set(['succeeded', 'failed', 'cancelled', 'escalated'])
