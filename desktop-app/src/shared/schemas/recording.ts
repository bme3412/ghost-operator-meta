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

/**
 * One captured demonstration event. Final committed values, not keystrokes.
 * String caps mirror (with headroom) the preload's truncation: page-supplied
 * values stay bounded even if capture is bypassed.
 */
export const RecordingEvent = z.object({
  sequence: z.number().int().nonnegative(),
  type: RecordingEventType,
  targetRole: z.string().max(64).optional(),
  targetLabel: z.string().max(500).optional(),
  semanticId: z.string().max(200).optional(),
  /** CSS selector for replay, when the target offers a stable hook. */
  selector: z.string().max(2000).optional(),
  /**
   * Ordered replay chain, strongest first; `selector` equals the best entry
   * (`selectorCandidates[0]`) whenever present. Optional so older stored
   * recordings keep parsing.
   */
  selectorCandidates: z.array(z.string().max(2000)).max(6).optional(),
  /**
   * Accessible fallback descriptor (explicit role / aria-label). Not a CSS
   * selector; matched separately from the chain.
   */
  accessibleRole: z.string().max(64).optional(),
  accessibleLabel: z.string().max(500).optional(),
  surroundingText: z.string().max(200).optional(),
  value: z.string().max(500).optional(),
  recordIdentity: z.string().max(200).optional(),
  boundingBox: BoundingBox.optional(),
  screenshotRef: z.string().max(200).optional(),
  atMs: z.number().int().nonnegative()
})
export type RecordingEvent = z.infer<typeof RecordingEvent>

export const RecordingNote = z.object({
  sequence: z.number().int().nonnegative(),
  text: z.string().min(1).max(2000),
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
