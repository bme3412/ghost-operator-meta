import { z } from 'zod'
import { Recording } from './recording'
import { RunRecord } from './run'
import { SiteMap } from './scout'
import { Skill } from './skills'
import { Suggestion } from './suggest'

export const STATE_SCHEMA_VERSION = 5 as const

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
export const SiteProfile = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1)
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
  siteMaps: z.array(SiteMap).optional()
})
export type PersistedState = z.infer<typeof PersistedState>

export function defaultState(): PersistedState {
  return { schemaVersion: STATE_SCHEMA_VERSION, recordings: [], skills: [], runs: [] }
}

/** Parse any known persisted version and migrate forward to current. */
export function migrateState(raw: unknown): PersistedState {
  const current = PersistedState.safeParse(raw)
  if (current.success) return current.data
  const legacy = LegacyState.safeParse(raw)
  if (legacy.success) {
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      recordings: legacy.data.recordings,
      skills: [],
      runs: []
    }
  }
  // Final attempt surfaces a precise validation error for genuinely corrupt data.
  return PersistedState.parse(raw)
}
