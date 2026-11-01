import { z } from 'zod'

/** Execution lifecycle of a run. Independent of freshness. */
export const ExecutionStatus = z.enum([
  'queued',
  'running',
  'verifying',
  'succeeded',
  'paused',
  'failed',
  'cancelled',
  'escalated'
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

/** Choice value meaning "my rules don't cover this; hand it back to the owner". */
export const ESCALATE = 'escalate'

/** One judgment call a decide step made, quoting the rule it applied. */
export const DecisionRecord = z.object({
  stepId: z.string().min(1),
  choice: z.string().min(1),
  /** The demonstrator's rule, verbatim; null when escalating. */
  rule: z.string().nullable(),
  reason: z.string(),
  /** The page text the decision was made from (trimmed). */
  evidence: z.string(),
  at: z.string().min(1)
})
export type DecisionRecord = z.infer<typeof DecisionRecord>

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
  decisions: z.array(DecisionRecord).default([]),
  awaitingApproval: z.boolean().default(false),
  /** Set when a decide step handed the case back to the owner. */
  escalation: z.string().optional(),
  /** Batch this run belongs to, when started from "Run on many". */
  batchId: z.string().optional(),
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
  rules: z.array(z.string()).optional(),
  options: z.array(z.string()).optional(),
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
  decisions: z.array(DecisionRecord).default([]),
  awaitingApproval: z.boolean().default(false),
  escalation: z.string().optional(),
  batch: z
    .object({ id: z.string(), index: z.number().int().nonnegative(), total: z.number().int().positive() })
    .optional(),
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

/** One case in a "Run on many" batch. */
export const BatchItem = z.object({
  /** The case id, bound to the batch's input key (e.g. T-202). */
  caseId: z.string().min(1),
  status: z.union([ExecutionStatus, z.literal('pending')]),
  runId: z.string().optional(),
  /** The decide step's choice, when there was one. */
  choice: z.string().optional(),
  rule: z.string().nullable().optional(),
  reason: z.string().optional(),
  /** The case text Ghost read, for the away page. */
  evidence: z.string().optional(),
  error: z.string().optional()
})
export type BatchItem = z.infer<typeof BatchItem>

/** A sequence of runs of one skill over many cases, while the owner is away. */
export const BatchRecord = z.object({
  id: z.string().min(1),
  skillId: z.string().min(1),
  skillName: z.string(),
  /** Run input each case id is bound to. */
  inputKey: z.string().min(1),
  /** Inputs shared by every case. */
  sharedInputs: z.record(z.string(), z.string()).default({}),
  items: z.array(BatchItem),
  status: z.enum(['running', 'done', 'cancelled']),
  startedAt: z.string().min(1),
  endedAt: z.string().optional(),
  /** Phone notification outcome. */
  notifiedAt: z.string().optional(),
  notifyError: z.string().optional()
})
export type BatchRecord = z.infer<typeof BatchRecord>

export const StartBatchRequest = z.object({
  skillId: z.string().min(1),
  inputKey: z.string().min(1).max(64),
  caseIds: z.array(z.string().min(1).max(64)).min(1).max(50),
  sharedInputs: z.record(z.string().max(64), z.string().max(500)).default({})
})
export type StartBatchRequest = z.infer<typeof StartBatchRequest>

export const BatchIdPayload = z.object({ batchId: z.string().min(1) })

export const RunIdPayload = z.object({ runId: z.string().min(1) })
export type RunIdPayload = z.infer<typeof RunIdPayload>
