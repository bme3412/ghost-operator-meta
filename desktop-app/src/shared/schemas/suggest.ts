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

/** A recording-mined proposal shown on Home and in the Library map. */
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

/** suggest:accept result: prefill for the panel Teach view. */
export interface SuggestAcceptPrefill {
  goal: string
  siteId: string
}

/** One automatable-task idea for the currently open page. Not persisted. */
export const PageIdea = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
  exampleInput: z.string().min(1).optional(),
  cites: z.array(z.string()).default([]),
  confidence: z.enum(['high', 'medium', 'low'])
})
export type PageIdea = z.infer<typeof PageIdea>

/** suggest:page result: ideas for the live page plus their provenance. */
export interface PageIdeasResult {
  page: { url: string; path: string; title: string }
  ideas: PageIdea[]
  source: 'ai' | 'heuristic'
  warning: string | null
}

/**
 * suggest:page request. refresh bypasses the per-URL memory cache; fast
 * returns the heuristic list immediately, skipping the model call, so the
 * panel can paint instantly and replace it when the AI ideas arrive.
 */
export const SuggestPageRequest = z.object({
  refresh: z.boolean().optional(),
  fast: z.boolean().optional()
})
export type SuggestPageRequest = z.infer<typeof SuggestPageRequest>

/** Payload of the ghost:target-page push event. */
export interface TargetPagePush {
  url: string
  title: string
}
