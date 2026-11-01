import type {
  BatchItem,
  BatchRecord,
  RunProgress,
  RunRecord,
  StartBatchRequest,
  StartRunRequest
} from '../../shared/schemas'
import type { RunBatchRef } from './index'

export interface BatchDeps {
  now: () => number
  getSkillName: (skillId: string) => string | null
  startRun: (request: StartRunRequest, options: { batch: RunBatchRef }) => RunProgress
  /** Resolves with the persisted record once the run reaches a terminal state. */
  waitForRunEnd: (runId: string) => Promise<RunRecord | null>
  stopRun: (runId: string) => void
  persist: (batch: BatchRecord) => void
  /** Called once when every case has a terminal outcome (phone notification). */
  onFinished: (batch: BatchRecord) => Promise<Partial<Pick<BatchRecord, 'notifiedAt' | 'notifyError'>>>
}

/** Per-case outcome summary of a batch, for notifications and the away page. */
export interface BatchSummary {
  handled: BatchItem[]
  escalated: BatchItem[]
  failed: BatchItem[]
}

export function summarizeBatch(batch: BatchRecord): BatchSummary {
  return {
    handled: batch.items.filter((i) => i.status === 'succeeded'),
    escalated: batch.items.filter((i) => i.status === 'escalated'),
    failed: batch.items.filter(
      (i) => i.status === 'failed' || i.status === 'cancelled' || i.status === 'pending'
    )
  }
}

/** "Ghost resolved 6 tickets. 1 needs you." */
export function batchHeadline(batch: BatchRecord): string {
  const { handled, escalated, failed } = summarizeBatch(batch)
  const noun = batch.inputKey === 'ticketId' ? 'ticket' : 'case'
  const plural = (n: number): string => `${n} ${noun}${n === 1 ? '' : 's'}`
  const needsYou = escalated.length + failed.length
  const lead = `Ghost resolved ${plural(handled.length)}.`
  return needsYou === 0 ? `${lead} Nothing needs you.` : `${lead} ${needsYou} need${needsYou === 1 ? 's' : ''} you.`
}

function itemFromRecord(item: BatchItem, record: RunRecord | null): BatchItem {
  if (!record) return { ...item, status: 'failed', error: 'The run record was not found.' }
  const decision = record.decisions[record.decisions.length - 1]
  return {
    ...item,
    runId: record.id,
    status: record.status,
    ...(decision
      ? {
          choice: decision.choice,
          rule: decision.rule,
          reason: decision.reason,
          evidence: decision.evidence
        }
      : {}),
    ...(record.error ? { error: record.error } : {})
  }
}

/**
 * Runs one skill over many cases, one after another, always in "Do it for
 * me" mode. An escalation or a failure never stops the batch: each case gets
 * its own honest outcome, and the owner hears about all of them at the end.
 */
export function createBatchRunner(deps: BatchDeps): {
  start: (request: StartBatchRequest) => BatchRecord
  cancel: (batchId: string) => BatchRecord | null
  getActive: () => BatchRecord | null
  /** Settles when the active batch finishes (tests). */
  whenIdle: () => Promise<void>
} {
  let active: BatchRecord | null = null
  let cancelled = false
  let currentRunId: string | null = null
  let loop: Promise<void> = Promise.resolve()
  let counter = 0

  function save(next: BatchRecord): BatchRecord {
    active = next
    deps.persist(next)
    return next
  }

  function setItem(index: number, item: BatchItem): void {
    if (!active) return
    const items = active.items.slice()
    items[index] = item
    save({ ...active, items })
  }

  async function drive(batch: BatchRecord): Promise<void> {
    for (let index = 0; index < batch.items.length; index++) {
      if (cancelled || !active) break
      const item = active.items[index] as BatchItem
      let runId: string
      try {
        const progress = deps.startRun(
          {
            skillId: batch.skillId,
            mode: 'assisted',
            inputs: { ...batch.sharedInputs, [batch.inputKey]: item.caseId }
          },
          { batch: { id: batch.id, index, total: batch.items.length } }
        )
        runId = progress.runId
      } catch (error) {
        setItem(index, { ...item, status: 'failed', error: (error as Error).message })
        continue
      }
      currentRunId = runId
      setItem(index, { ...item, status: 'running', runId })
      const record = await deps.waitForRunEnd(runId)
      currentRunId = null
      setItem(index, itemFromRecord(active.items[index] as BatchItem, record))
    }
    if (!active) return
    const ended: BatchRecord = {
      ...active,
      items: active.items.map((i) => (i.status === 'pending' ? { ...i, status: 'cancelled' } : i)),
      status: cancelled ? 'cancelled' : 'done',
      endedAt: new Date(deps.now()).toISOString()
    }
    save(ended)
    try {
      const notified = await deps.onFinished(ended)
      save({ ...ended, ...notified })
    } catch (error) {
      save({ ...ended, notifyError: (error as Error).message })
    }
  }

  return {
    start(request: StartBatchRequest): BatchRecord {
      if (active && active.status === 'running') {
        throw new Error('A batch is already running.')
      }
      const caseIds = [...new Set(request.caseIds.map((id) => id.trim()).filter((id) => id !== ''))]
      if (caseIds.length === 0) throw new Error('Add at least one case to run on.')
      const skillName = deps.getSkillName(request.skillId)
      if (skillName === null) throw new Error(`No skill ${request.skillId}.`)
      counter += 1
      const startedAtMs = deps.now()
      cancelled = false
      const batch = save({
        id: `batch-${startedAtMs}-${counter}`,
        skillId: request.skillId,
        skillName,
        inputKey: request.inputKey,
        sharedInputs: request.sharedInputs,
        items: caseIds.map((caseId) => ({ caseId, status: 'pending' })),
        status: 'running',
        startedAt: new Date(startedAtMs).toISOString()
      })
      loop = drive(batch)
      return batch
    },

    cancel(batchId: string): BatchRecord | null {
      if (!active || active.id !== batchId || active.status !== 'running') return active
      cancelled = true
      if (currentRunId) {
        try {
          deps.stopRun(currentRunId)
        } catch {
          // The run may have ended on its own in the meantime.
        }
      }
      return active
    },

    getActive: () => active,

    whenIdle: () => loop
  }
}
