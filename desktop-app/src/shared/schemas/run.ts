import { z } from 'zod'

/** Execution lifecycle of a run. Independent of freshness. */
export const ExecutionStatus = z.enum([
  'queued',
  'running',
  'verifying',
  'succeeded',
  'paused',
  'failed',
  'cancelled'
])
export type ExecutionStatus = z.infer<typeof ExecutionStatus>

/** Whether an output is still valid against current inputs. */
export const Freshness = z.enum(['current', 'stale', 'blocked'])
export type Freshness = z.infer<typeof Freshness>

export const SourceRef = z.object({
  sourceId: z.string().min(1),
  version: z.number().int().nonnegative()
})
export type SourceRef = z.infer<typeof SourceRef>

export const RunReceipt = z.object({
  runId: z.string().min(1),
  skillId: z.string().min(1),
  skillVersion: z.number().int().positive(),
  pinnedInputs: z.array(SourceRef),
  operationKey: z.string().min(1),
  status: ExecutionStatus
})
export type RunReceipt = z.infer<typeof RunReceipt>

export const StepAttempt = z.object({
  runId: z.string().min(1),
  stepId: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  actions: z.array(z.string()).default([]),
  observedOutcome: z.string().default(''),
  passed: z.boolean().optional()
})
export type StepAttempt = z.infer<typeof StepAttempt>

export const RunMode = z.enum(['guide', 'assisted'])
export type RunMode = z.infer<typeof RunMode>

export const CheckResult = z.object({
  check: z.string().min(1),
  passed: z.boolean(),
  observed: z.string(),
  at: z.string().min(1)
})
export type CheckResult = z.infer<typeof CheckResult>

/** Full persisted record of a skill execution. */
export const RunRecord = z.object({
  id: z.string().min(1),
  skillId: z.string().min(1),
  skillVersion: z.number().int().positive(),
  mode: RunMode,
  inputs: z.record(z.string(), z.string()).default({}),
  status: ExecutionStatus,
  startedAt: z.string().min(1),
  endedAt: z.string().optional(),
  currentStepIndex: z.number().int().nonnegative(),
  attempts: z.array(StepAttempt).default([]),
  checks: z.array(CheckResult).default([]),
  awaitingApproval: z.boolean().default(false),
  error: z.string().optional()
})
export type RunRecord = z.infer<typeof RunRecord>

export const BindingView = z.object({
  path: z.string(),
  value: z.string()
})
export type BindingView = z.infer<typeof BindingView>

export const RunStepView = z.object({
  index: z.number().int().nonnegative(),
  id: z.string().min(1),
  kind: z.string(),
  goal: z.string().optional(),
  why: z.string().optional(),
  expected: z.string().optional(),
  bindings: z.record(z.string(), BindingView).default({}),
  checks: z.array(z.string()).default([]),
  status: z.enum(['done', 'current', 'todo'])
})
export type RunStepView = z.infer<typeof RunStepView>

/** Pushed to the panel on every run transition. Never steals focus. */
export const RunProgress = z.object({
  runId: z.string().min(1),
  skillId: z.string().min(1),
  skillName: z.string(),
  skillVersion: z.number().int().positive(),
  mode: RunMode,
  status: ExecutionStatus,
  inputs: z.record(z.string(), z.string()).default({}),
  current: RunStepView.nullable(),
  steps: z.array(RunStepView).default([]),
  checks: z.array(CheckResult).default([]),
  awaitingApproval: z.boolean().default(false),
  error: z.string().optional()
})
export type RunProgress = z.infer<typeof RunProgress>

export const StartRunRequest = z.object({
  skillId: z.string().min(1),
  version: z.number().int().positive().optional(),
  mode: RunMode,
  inputs: z.record(z.string().max(64), z.string().max(500))
})
export type StartRunRequest = z.infer<typeof StartRunRequest>

export const RunIdPayload = z.object({ runId: z.string().min(1) })
export type RunIdPayload = z.infer<typeof RunIdPayload>
