import { z } from 'zod'
import { ActivityFeedback, StoredActivityEvent } from './activity'
import { Recording } from './recording'
import { BatchRecord, RunRecord } from './run'
import { SiteMap } from './scout'
import { Skill } from './skills'
import { Suggestion } from './suggest'

export const STATE_SCHEMA_VERSION = 6 as const

/**
 * Legacy persisted states (v1-v4, Harbor Goods era). Only recordings carry
 * forward; the Harbor domain, skills, and runs do not survive the retarget
 * to the Saltbreak web app.
 */
const LegacyState = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  recordings: z.array(Recording).default([])
})

/**
 * The site the target window currently points at. Absent when the user never
 * switched sites, in which case readers fall back to the Saltbreak profile
 * at the configured target URL.
 */
export const StarterTaskSchema = z.object({
  id: z.string().min(1),
  audience: z.enum(['owner', 'shopper']),
  title: z.string().min(1),
  exampleInputs: z.record(z.string(), z.string()),
  startPath: z.string().min(1)
})

export const SiteProfile = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  starterTasks: z.array(StarterTaskSchema).optional()
})
export type SiteProfile = z.infer<typeof SiteProfile>

/** Authoritative persisted state. Versioned; migrate on load when this grows. */
export const PersistedState = z.object({
  schemaVersion: z.literal(STATE_SCHEMA_VERSION),
  recordings: z.array(Recording).default([]),
  skills: z.array(Skill).default([]),
  runs: z.array(RunRecord).default([]),
  currentSite: SiteProfile.optional(),
  /** Recording-mined suggestions. Optional so v5 states without them keep parsing. */
  suggestions: z.array(Suggestion).optional(),
  /** Per-site page graphs from scout scans, one entry per site id. Optional; no version bump. */
  siteMaps: z.array(SiteMap).optional(),
  /** Curated starter skills were seeded (exactly once per state file). Optional; no version bump. */
  seededStarters: z.boolean().optional(),
  /** "Run on many" batches (v6). */
  batches: z.array(BatchRecord).default([]),
  /** Now-feed ingestion cursor into Saltbreak's event log. Optional; no version bump. */
  activityCursor: z.number().optional(),
  /** Raw Saltbreak events kept for clustering/precedent (capped in the service). Optional. */
  activityEvents: z.array(StoredActivityEvent).optional(),
  /** Feed feedback (dismissed / acted) keyed by opportunity signature. Optional. */
  activityFeedback: z.array(ActivityFeedback).optional()
})
export type PersistedState = z.infer<typeof PersistedState>

/** v5: the same shape before batches existed. */
const V5State = PersistedState.omit({ schemaVersion: true, batches: true }).extend({
  schemaVersion: z.literal(5)
})

export function defaultState(): PersistedState {
  return { schemaVersion: STATE_SCHEMA_VERSION, recordings: [], skills: [], runs: [], batches: [] }
}

/** Parse any known persisted version and migrate forward to current. */
export function migrateState(raw: unknown): PersistedState {
  const current = PersistedState.safeParse(raw)
  if (current.success) return current.data
  const v5 = V5State.safeParse(raw)
  if (v5.success) {
    return { ...v5.data, schemaVersion: STATE_SCHEMA_VERSION, batches: [] }
  }
  const legacy = LegacyState.safeParse(raw)
  if (legacy.success) {
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      recordings: legacy.data.recordings,
      skills: [],
      runs: [],
      batches: []
    }
  }
  // Final attempt surfaces a precise validation error for genuinely corrupt data.
  return PersistedState.parse(raw)
}
