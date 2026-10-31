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

/** Payload of the ghost:studio-show push event. */
export interface StudioShowPayload {
  section: string
  recordingId?: string
  runId?: string
}
