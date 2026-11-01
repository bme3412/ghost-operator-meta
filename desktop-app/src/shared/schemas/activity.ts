import { z } from 'zod'

/** One event from Saltbreak's read-only /api/activity connector. */
export const SaltbreakEvent = z.object({
  id: z.number(),
  type: z.string(),
  entity: z.string(),
  entityId: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  ticket: z
    .object({
      subject: z.string(),
      body: z.string(),
      status: z.string(),
      resolution: z.string().nullable().default(null)
    })
    .optional()
})
export type SaltbreakEvent = z.infer<typeof SaltbreakEvent>

export const ActivityResponse = z.object({ events: z.array(SaltbreakEvent) })
export type ActivityResponse = z.infer<typeof ActivityResponse>

/** Normalized timeline entry shown under "Recent activity". */
export const ActivityItem = z.object({
  id: z.string().min(1),
  source: z.enum(['saltbreak', 'ghost']),
  kind: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().optional(),
  entityId: z.string().optional(),
  at: z.string().min(1)
})
export type ActivityItem = z.infer<typeof ActivityItem>

export const OpportunityState = z.enum(['ready', 'needs-you', 'suggest', 'observe'])
export type OpportunityState = z.infer<typeof OpportunityState>

/**
 * A clustered opportunity in the Now feed: a signal (what happened), a
 * pattern (why it matters), and one safe action. Built deterministically;
 * the model may only re-rank and rephrase.
 */
export const Opportunity = z.object({
  /** Stable signature: category + sorted case ids. Feedback keys off this. */
  id: z.string().min(1),
  state: OpportunityState,
  title: z.string().min(1),
  /** "Because…" precedent text. */
  because: z.string().min(1),
  category: z.string().min(1),
  caseIds: z.array(z.string()),
  skillId: z.string().optional(),
  skillName: z.string().optional()
})
export type Opportunity = z.infer<typeof Opportunity>

export const ActivityFeed = z.object({
  needsYou: z.array(Opportunity),
  ready: z.array(Opportunity),
  recent: z.array(ActivityItem),
  warning: z.string().nullable().default(null)
})
export type ActivityFeed = z.infer<typeof ActivityFeed>

export const ActivityFeedback = z.object({
  signature: z.string().min(1),
  action: z.enum(['dismissed', 'acted']),
  at: z.string().min(1)
})
export type ActivityFeedback = z.infer<typeof ActivityFeedback>

/** Compact persisted form of a Saltbreak event, kept for clustering. */
export const StoredActivityEvent = z.object({
  id: z.number(),
  type: z.string(),
  entity: z.string(),
  entityId: z.string(),
  subject: z.string().optional(),
  status: z.string().optional(),
  resolution: z.string().nullable().optional(),
  at: z.string()
})
export type StoredActivityEvent = z.infer<typeof StoredActivityEvent>

export const ActivityDismissRequest = z.object({ signature: z.string().min(1) })
export const ActivityActRequest = z.object({ signature: z.string().min(1) })
