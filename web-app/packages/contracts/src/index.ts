import { z } from 'zod';

/** How well a task is understood. */
export const EvidenceStatus = z.enum([
  'described',
  'observed',
  'needs_clarification',
  'tested_skill',
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

/** Execution lifecycle of a run. Independent of freshness. */
export const ExecutionStatus = z.enum([
  'queued',
  'running',
  'verifying',
  'succeeded',
  'paused',
  'failed',
  'cancelled',
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

/** Whether an output is still valid against current inputs. */
export const Freshness = z.enum(['current', 'stale', 'blocked']);
export type Freshness = z.infer<typeof Freshness>;

export const EdgeType = z.enum([
  'contains',
  'uses',
  'consumes',
  'produces',
  'depends_on',
  'implemented_by',
  'supported_by',
]);
export type EdgeType = z.infer<typeof EdgeType>;

export const StepKind = z.enum([
  'read_source',
  'transform',
  'tool',
  'computer_task',
  'verify',
  'review',
]);
export type StepKind = z.infer<typeof StepKind>;

/** One step of a skill recipe. Coordinates are never reused across images. */
export const SkillStep = z.object({
  id: z.string().min(1),
  kind: StepKind,
  toolId: z.string().optional(),
  applicationId: z.string().optional(),
  goal: z.string().optional(),
  bindings: z.record(z.string()).default({}),
  dataRefs: z.array(z.string()).default([]),
  checks: z.array(z.string()).default([]),
});
export type SkillStep = z.infer<typeof SkillStep>;

/** Execution source of truth for a reusable procedure. Immutable per version. */
export const SkillRecipe = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  version: z.number().int().positive(),
  goal: z.string().min(1),
  inputSchemaRef: z.string().min(1),
  steps: z.array(SkillStep).min(1),
  allowedApplications: z.array(z.string()).default([]),
  allowedTools: z.array(z.string()).default([]),
});
export type SkillRecipe = z.infer<typeof SkillRecipe>;

export const SourceRef = z.object({
  sourceId: z.string().min(1),
  version: z.number().int().nonnegative(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const RunReceipt = z.object({
  runId: z.string().min(1),
  skillId: z.string().min(1),
  skillVersion: z.number().int().positive(),
  pinnedInputs: z.array(SourceRef),
  operationKey: z.string().min(1),
  status: ExecutionStatus,
});
export type RunReceipt = z.infer<typeof RunReceipt>;

export const StepAttempt = z.object({
  runId: z.string().min(1),
  stepId: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  actions: z.array(z.string()).default([]),
  observedOutcome: z.string().default(''),
  passed: z.boolean().optional(),
});
export type StepAttempt = z.infer<typeof StepAttempt>;

/** One captured interaction. Final values, not keystrokes. */
export const RecordingEvent = z.object({
  recordingId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  eventType: z.string().min(1),
  target: z.string().default(''),
  value: z.string().optional(),
  screenshotRef: z.string().optional(),
  actor: z.enum(['human', 'agent']).default('human'),
});
export type RecordingEvent = z.infer<typeof RecordingEvent>;

/** Lineage for one version of a derived output. */
export const ArtifactManifest = z.object({
  artifactId: z.string().min(1),
  version: z.number().int().nonnegative(),
  contentHash: z.string().min(1),
  fileRef: z.string().min(1),
  inputVersions: z.record(z.string()).default({}),
  producerSkillVersion: z.string().optional(),
  toolIds: z.array(z.string()).default([]),
  modelIds: z.array(z.string()).default([]),
  verificationRefs: z.array(z.string()).default([]),
});
export type ArtifactManifest = z.infer<typeof ArtifactManifest>;

export const CheckResult = z.object({
  checkId: z.string().min(1),
  passed: z.boolean(),
  observed: z.string().default(''),
  expected: z.string().optional(),
  evidenceRef: z.string().optional(),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const GraphEdge = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  type: EdgeType,
  status: z.enum(['proposed', 'confirmed']).default('proposed'),
  evidenceIds: z.array(z.string()).default([]),
});
export type GraphEdge = z.infer<typeof GraphEdge>;
