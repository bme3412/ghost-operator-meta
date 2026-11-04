import type { RunRecord } from '../../shared/schemas'
import { notifyBatchFinished } from '../away'
import { broadcastLibraryChanged } from '../ipc/broadcast'
import { getSkill } from '../skills'
import { getRun, upsertBatch } from '../store'
import { navigatePanel } from '../windows/registry'
import { createBatchRunner } from './batch'
import { TERMINAL } from './index'
import { getRunner, onRunProgress } from './service'

/** Resolve with the persisted run once the runner reports it terminal. */
function waitForRunEnd(runId: string): Promise<RunRecord | null> {
  return new Promise((resolve) => {
    const settle = (): boolean => {
      const record = getRun(runId)
      if (record && TERMINAL.has(record.status)) {
        resolve(record)
        return true
      }
      return false
    }
    if (settle()) return
    const unsubscribe = onRunProgress((progress) => {
      if (progress?.runId === runId && TERMINAL.has(progress.status)) {
        unsubscribe()
        resolve(getRun(runId))
      }
    })
  })
}

let singleton: ReturnType<typeof createBatchRunner> | null = null

export function getBatchRunner(): ReturnType<typeof createBatchRunner> {
  if (!singleton) {
    singleton = createBatchRunner({
      now: () => Date.now(),
      getSkillName: (skillId) => getSkill(skillId)?.name ?? null,
      getSkillVersion: (skillId) => getSkill(skillId)?.activeVersion ?? null,
      startRun: (request, options) => getRunner().startRun(request, options),
      waitForRunEnd,
      stopRun: (runId) => {
        getRunner().stopRun(runId)
      },
      persist: (batch) => {
        upsertBatch(batch)
        broadcastLibraryChanged()
        if (batch.status !== 'running' && batch.notifiedAt === undefined && batch.notifyError === undefined) {
          navigatePanel({ view: 'batch', batchId: batch.id })
        }
      },
      onFinished: notifyBatchFinished
    })
  }
  return singleton
}
