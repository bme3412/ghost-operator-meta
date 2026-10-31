import { z } from 'zod'
import { RecordingEvent } from './recording'

/** Renderer-submitted event; the main process assigns `sequence`. */
export const RecordingEventInput = RecordingEvent.omit({ sequence: true })
export type RecordingEventInput = z.infer<typeof RecordingEventInput>

export const RecorderStatus = z.enum(['idle', 'recording', 'paused'])
export type RecorderStatus = z.infer<typeof RecorderStatus>

/** Pushed to all windows whenever recorder state changes. */
export const RecorderStatePush = z.object({
  status: RecorderStatus,
  recordingId: z.string().nullable(),
  goal: z.string(),
  caseId: z.string().nullable(),
  startedAt: z.string().nullable(),
  eventCount: z.number().int().nonnegative(),
  /** Milliseconds of active recording (excludes paused time). Frozen while paused. */
  elapsedMs: z.number().int().nonnegative()
})
export type RecorderStatePush = z.infer<typeof RecorderStatePush>

export const StartRecordingRequest = z.object({
  goal: z.string().min(1).max(200),
  caseId: z.string().min(1).nullable().default(null)
})
export type StartRecordingRequest = z.infer<typeof StartRecordingRequest>
