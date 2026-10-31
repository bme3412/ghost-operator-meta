import { z } from 'zod'

export const SuggestionStatus = z.enum(['new', 'accepted', 'dismissed'])
export type SuggestionStatus = z.infer<typeof SuggestionStatus>

/** Concrete evidence behind a suggestion: pages touched, selectors hit, origin. */
export const SuggestionEvidence = z.object({
  pages: z.array(z.string()).default([]),
  selectors: z.array(z.string()).default([]),
  sourceRecordingId: z.string().min(1).nullable()
})
export type SuggestionEvidence = z.infer<typeof SuggestionEvidence>

/** A recording-mined proposal shown in the Studio Task map. */
export const Suggestion = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
  evidence: SuggestionEvidence,
  status: SuggestionStatus.default('new'),
  createdAt: z.string().min(1)
})
export type Suggestion = z.infer<typeof Suggestion>

/**
 * suggest:list accepts an optional site filter; empty payload lists
 * everything. With polish set, the handler rewrites the heuristic rows
 * through the Meta provider instead of returning them directly.
 */
export const SuggestListRequest = z.object({
  siteId: z.string().min(1).optional(),
  polish: z.boolean().optional()
})
export type SuggestListRequest = z.infer<typeof SuggestListRequest>

/**
 * suggest:list result when polish is requested: the polished rows on
 * success, or the heuristic rows unchanged plus a warning on any failure.
 */
export interface SuggestPolishResult {
  suggestions: Suggestion[]
  warning: string | null
}

export const SuggestIdRequest = z.object({
  id: z.string().min(1)
})
export type SuggestIdRequest = z.infer<typeof SuggestIdRequest>

/** suggest:accept result: prefill for the toolbar Teach form. */
export interface SuggestAcceptPrefill {
  goal: string
  siteId: string
}

/** Payload of the ghost:teach-prefill push event. */
export interface TeachPrefillPayload {
  goal: string
}
