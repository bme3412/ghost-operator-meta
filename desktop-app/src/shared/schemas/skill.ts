import { z } from 'zod'

export const StepKind = z.enum([
  'read_source',
  'transform',
  'tool',
  'computer_task',
  'verify',
  'review',
  'decide'
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
  /**
   * Ordered fallback selectors after bindings.selector, strongest first;
   * replay tries them in order until one matches. Optional so older stored
   * recipes keep parsing.
   */
  selectorCandidates: z.array(z.string()).optional(),
  bindings: z.record(z.string(), z.string()).default({}),
  dataRefs: z.array(z.string()).default([]),
  checks: z.array(CheckRef).default([]),
  /**
   * Decide steps only: the demonstrator's rules in their own words, the
   * choices Ghost may make, and the run input the choice is written to.
   * Anything the rules don't cover escalates instead of guessing.
   */
  rules: z.array(z.string().min(1)).optional(),
  options: z.array(z.string().regex(/^[a-z][a-z0-9_-]*$/)).optional(),
  writes: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional()
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
