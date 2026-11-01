import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearLastStateRecovery,
  getLastStateRecovery,
  loadStateFromFile,
  saveStateToFile
} from '../../src/main/store/index'
import { defaultState, type PersistedState } from '../../src/shared/schemas'

function tempStatePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'ghost-state-')), 'state.json')
}

function populatedState(): PersistedState {
  return {
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
        decisions: [],
        attempts: [],
        checks: [],
        awaitingApproval: false
      }
    ]
  }
}

describe('versioned JSON store', () => {
  beforeEach(() => {
    clearLastStateRecovery()
  })

  it('returns the default state when no file exists', () => {
    const state = loadStateFromFile(tempStatePath())
    expect(state.schemaVersion).toBe(6)
    expect(state.recordings).toEqual([])
    expect(state.skills).toEqual([])
    expect(state.runs).toEqual([])
    expect(getLastStateRecovery()).toBeNull()
  })

  it('round-trips a populated state', () => {
    const filePath = tempStatePath()
    const state = populatedState()
    saveStateToFile(filePath, state)
    expect(loadStateFromFile(filePath)).toEqual(state)
  })

  it('leaves no temp file behind after save', () => {
    const filePath = tempStatePath()
    saveStateToFile(filePath, populatedState())
    expect(existsSync(`${filePath}.tmp`)).toBe(false)
  })

  it('quarantines corrupt persisted data and yields default state', () => {
    const filePath = tempStatePath()
    writeFileSync(filePath, '{ not valid json', 'utf8')
    const state = loadStateFromFile(filePath)
    expect(state).toEqual(defaultState())
    // Original is moved aside to a timestamped backup preserving the bad bytes.
    const recovery = getLastStateRecovery()
    expect(recovery).not.toBeNull()
    expect(recovery!.filePath).toBe(filePath)
    expect(recovery!.quarantinedPath).toMatch(/\.corrupt-.*\.bak$/)
    expect(readFileSync(recovery!.quarantinedPath, 'utf8')).toBe('{ not valid json')
    expect(existsSync(filePath)).toBe(false)
  })

  it('recovers from a mid-write-style truncated file', () => {
    const filePath = tempStatePath()
    const full = JSON.stringify(populatedState(), null, 2)
    writeFileSync(filePath, full.slice(0, Math.floor(full.length / 2)), 'utf8')
    expect(loadStateFromFile(filePath)).toEqual(defaultState())
    const recovery = getLastStateRecovery()
    expect(recovery).not.toBeNull()
    expect(recovery!.reason).toMatch(/parse/i)
    // A subsequent save starts clean and round-trips.
    saveStateToFile(filePath, populatedState())
    expect(loadStateFromFile(filePath)).toEqual(populatedState())
  })

  it('quarantines well-formed JSON that fails validation', () => {
    const filePath = tempStatePath()
    writeFileSync(filePath, JSON.stringify({ schemaVersion: 999, bogus: true }), 'utf8')
    expect(loadStateFromFile(filePath)).toEqual(defaultState())
    const recovery = getLastStateRecovery()
    expect(recovery).not.toBeNull()
    expect(recovery!.reason).toMatch(/validation/i)
    expect(readdirSync(join(filePath, '..')).some((f) => f.includes('.corrupt-'))).toBe(true)
  })
})
