import { z } from 'zod'
import { RecordingEvent, RecordingEventType } from './recording'

/** Renderer-submitted event; the main process assigns `sequence`. */
export const RecordingEventInput = RecordingEvent.omit({ sequence: true })
export type RecordingEventInput = z.infer<typeof RecordingEventInput>

export const RecorderStatus = z.enum(['idle', 'recording', 'paused'])
export type RecorderStatus = z.infer<typeof RecorderStatus>

/**
 * Small summary of the most recently captured event, for live toolbar
 * feedback. Labels are short human-readable strings (e.g. "Clicked Resolve").
 */
export const RecorderLastEvent = z.object({
  type: RecordingEventType,
  label: z.string().min(1).max(120),
  atMs: z.number().int().nonnegative()
})
export type RecorderLastEvent = z.infer<typeof RecorderLastEvent>

/** Pushed to all windows whenever recorder state changes. */
export const RecorderStatePush = z.object({
  status: RecorderStatus,
  recordingId: z.string().nullable(),
  goal: z.string(),
  caseId: z.string().nullable(),
  startedAt: z.string().nullable(),
  eventCount: z.number().int().nonnegative(),
  /** Milliseconds of active recording (excludes paused time). Frozen while paused. */
  elapsedMs: z.number().int().nonnegative(),
  /**
   * Optional so older readers (which strip unknown keys) and older pushes
   * (which omit it) keep working. No store migration: pushes are ephemeral.
   */
  lastEvent: RecorderLastEvent.optional()
})
export type RecorderStatePush = z.infer<typeof RecorderStatePush>

export const StartRecordingRequest = z.object({
  goal: z.string().min(1).max(200),
  caseId: z.string().min(1).nullable().default(null)
})
export type StartRecordingRequest = z.infer<typeof StartRecordingRequest>
