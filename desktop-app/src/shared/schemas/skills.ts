import { z } from 'zod'
import { SkillRecipe } from './skill'

export const SkillStatus = z.enum(['draft', 'published'])
export type SkillStatus = z.infer<typeof SkillStatus>

export const SkillVersionRecord = z.object({
  version: z.number().int().positive(),
  recipe: SkillRecipe,
  instructions: z.string(),
  status: SkillStatus,
  recordingIds: z.array(z.string()).default([]),
  providerId: z.string().min(1),
  unresolved: z.array(z.string().max(1000)).max(50).default([]),
  createdAt: z.string().min(1)
})
export type SkillVersionRecord = z.infer<typeof SkillVersionRecord>

export const Skill = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  activeVersion: z.number().int().positive().nullable(),
  versions: z.array(SkillVersionRecord).min(1)
})
export type Skill = z.infer<typeof Skill>

export const SkillSummary = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  activeVersion: z.number().int().positive().nullable(),
  latestVersion: z.number().int().positive(),
  latestStatus: SkillStatus,
  /** Creating site id (recipe.allowedApplications[0]); null when unrecorded. */
  siteId: z.string().min(1).nullable()
})
export type SkillSummary = z.infer<typeof SkillSummary>

/** A generated procedure awaiting review. Not yet a saved skill version. */
export const Proposal = z.object({
  recipe: SkillRecipe,
  unresolved: z.array(z.string()).default([]),
  /** Demonstrated value → parameter path, for the review screen. */
  demonstrated: z.record(z.string(), z.string()).default({}),
  notes: z.array(z.string()).default([])
})
export type Proposal = z.infer<typeof Proposal>

export const ProviderId = z.enum(['fixture', 'meta'])
export type ProviderId = z.infer<typeof ProviderId>

export const CompileRequest = z.object({
  recordingId: z.string().min(1),
  providerId: ProviderId.default('fixture')
})
export type CompileRequest = z.infer<typeof CompileRequest>

/** skills:script request: a canned fixture proposal for a starter task id. */
export const ScriptRequest = z.object({
  scriptedId: z.string().min(1)
})
export type ScriptRequest = z.infer<typeof ScriptRequest>

export const CompileResult = z.union([
  z.object({ ok: z.literal(true), proposal: Proposal, providerId: ProviderId }),
  z.object({ ok: z.literal(false), errors: z.array(z.string()).min(1) })
])
export type CompileResult = z.infer<typeof CompileResult>

export const SaveDraftRequest = z.object({
  skillId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  recipe: SkillRecipe,
  recordingIds: z.array(z.string()).default([]),
  providerId: z.string().min(1),
  unresolved: z.array(z.string().max(1000)).max(50).default([])
})
export type SaveDraftRequest = z.infer<typeof SaveDraftRequest>

export const UpdateDraftRequest = z.object({
  skillId: z.string().min(1),
  version: z.number().int().positive(),
  recipe: SkillRecipe.optional(),
  instructions: z.string().optional()
})
export type UpdateDraftRequest = z.infer<typeof UpdateDraftRequest>

export const PublishRequest = z.object({
  skillId: z.string().min(1),
  version: z.number().int().positive()
})
export type PublishRequest = z.infer<typeof PublishRequest>
