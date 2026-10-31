import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadStateFromFile, saveStateToFile } from '../../src/main/store/index'
import { defaultState, type PersistedState } from '../../src/shared/schemas'

function tempStatePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'ghost-state-')), 'state.json')
}

describe('versioned JSON store', () => {
  it('returns the default state when no file exists', () => {
    const state = loadStateFromFile(tempStatePath())
    expect(state.schemaVersion).toBe(5)
    expect(state.recordings).toEqual([])
    expect(state.skills).toEqual([])
    expect(state.runs).toEqual([])
  })

  it('round-trips a populated state', () => {
    const filePath = tempStatePath()
    const state: PersistedState = {
      ...defaultState(),
      runs: [
        {
          id: 'run-1',
          skillId: 'resolve-support-ticket',
          skillVersion: 1,
          mode: 'assisted',
          inputs: { caseId: 'case-001' },
          status: 'succeeded',
          startedAt: new Date(0).toISOString(),
          currentStepIndex: 3,
          attempts: [],
          checks: [],
          awaitingApproval: false
        }
      ]
    }
    saveStateToFile(filePath, state)
    expect(loadStateFromFile(filePath)).toEqual(state)
  })

  it('rejects corrupt persisted data', () => {
    const filePath = tempStatePath()
    writeFileSync(filePath, '{ not valid json', 'utf8')
    expect(() => loadStateFromFile(filePath)).toThrow()
  })
})
