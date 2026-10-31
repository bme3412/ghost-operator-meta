import { describe, expect, it } from 'vitest'
import { migrateState } from '../../src/shared/schemas'

const RECORDING = {
  id: 'rec-1',
  goal: 'Resolve a support ticket',
  applicationScope: 'saltbreak',
  startedAt: '2026-10-31T12:00:00.000Z',
  events: [],
  notes: []
}

describe('state migration', () => {
  it('migrates Harbor-era states by keeping recordings only', () => {
    for (const schemaVersion of [1, 2, 3, 4]) {
      const migrated = migrateState({
        schemaVersion,
        harbor: { cases: [] },
        recordings: [RECORDING],
        skills: [{ id: 'old' }],
        runs: [{ id: 'run-old' }]
      })
      expect(migrated.schemaVersion).toBe(5)
      expect(migrated.recordings).toEqual([RECORDING])
      expect(migrated.skills).toEqual([])
      expect(migrated.runs).toEqual([])
    }
  })

  it('passes current state through untouched', () => {
    const current = {
      schemaVersion: 5 as const,
      recordings: [RECORDING],
      skills: [],
      runs: []
    }
    expect(migrateState(current)).toEqual(current)
  })

  it('rejects corrupt data with a validation error', () => {
    expect(() => migrateState({ schemaVersion: 5, recordings: 'nope' })).toThrow()
    expect(() => migrateState({ nope: true })).toThrow()
  })
})
