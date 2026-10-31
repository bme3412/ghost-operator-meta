import { z } from 'zod'

export const StepKind = z.enum([
  'read_source',
  'transform',
  'tool',
  'computer_task',
  'verify',
  'review'
])
export type StepKind = z.infer<typeof StepKind>

/** A named DOM assertion. Selectors run as CSS in the target page. */
export const CheckRef = z.object({
  name: z.string().min(1),
  selector: z.string().optional(),
  expected: z.string().optional()
})
export type CheckRef = z.infer<typeof CheckRef>

/** One step of a skill recipe. Screen coordinates are never reused across runs. */
export const SkillStep = z.object({
  id: z.string().min(1),
  kind: StepKind,
  toolId: z.string().optional(),
  applicationId: z.string().optional(),
  goal: z.string().optional(),
  why: z.string().optional(),
  expected: z.string().optional(),
  bindings: z.record(z.string(), z.string()).default({}),
  dataRefs: z.array(z.string()).default([]),
  checks: z.array(CheckRef).default([])
})
export type SkillStep = z.infer<typeof SkillStep>

/** Execution source of truth for a reusable procedure. Immutable per version. */
export const SkillRecipe = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  version: z.number().int().positive(),
  goal: z.string().min(1),
  inputSchemaRef: z.string().min(1),
  steps: z.array(SkillStep).min(1),
  allowedApplications: z.array(z.string()).default([]),
  allowedTools: z.array(z.string()).default([])
})
export type SkillRecipe = z.infer<typeof SkillRecipe>
