import { z } from 'zod'

export const RecordingEventType = z.enum([
  'navigate',
  'click',
  'input_commit',
  'select',
  'upload',
  'submit',
  'state_snapshot',
  'gap',
  'note'
])
export type RecordingEventType = z.infer<typeof RecordingEventType>

export const BoundingBox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
})
export type BoundingBox = z.infer<typeof BoundingBox>

/** One captured demonstration event. Final committed values, not keystrokes. */
export const RecordingEvent = z.object({
  sequence: z.number().int().nonnegative(),
  type: RecordingEventType,
  targetRole: z.string().optional(),
  targetLabel: z.string().optional(),
  semanticId: z.string().optional(),
  /** CSS selector for replay, when the target offers a stable hook. */
  selector: z.string().optional(),
  surroundingText: z.string().optional(),
  value: z.string().optional(),
  recordIdentity: z.string().optional(),
  boundingBox: BoundingBox.optional(),
  screenshotRef: z.string().optional(),
  atMs: z.number().int().nonnegative()
})
export type RecordingEvent = z.infer<typeof RecordingEvent>

export const RecordingNote = z.object({
  sequence: z.number().int().nonnegative(),
  text: z.string().min(1),
  atMs: z.number().int().nonnegative()
})
export type RecordingNote = z.infer<typeof RecordingNote>

export const Recording = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  applicationScope: z.string().min(1),
  startedAt: z.string().min(1),
  endedAt: z.string().optional(),
  events: z.array(RecordingEvent).default([]),
  notes: z.array(RecordingNote).default([])
})
export type Recording = z.infer<typeof Recording>
