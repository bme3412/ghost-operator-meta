import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  PersistedState,
  defaultState,
  migrateState,
  type RunRecord
} from '../../shared/schemas'

/** Packaged builds persist under userData; dev uses a local gitignored file. */
export function resolveStatePath(): string {
  if (process.env.GHOST_STATE_PATH) {
    return process.env.GHOST_STATE_PATH
  }
  if (app.isPackaged) {
    return join(app.getPath('userData'), 'ghost-operator-state.json')
  }
  return join(app.getAppPath(), '.local-state', 'ghost-operator-state.json')
}

export function loadStateFromFile(filePath: string): PersistedState {
  try {
    const raw = readFileSync(filePath, 'utf8')
    return migrateState(JSON.parse(raw))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultState()
    }
    throw error
  }
}

export function saveStateToFile(filePath: string, state: PersistedState): void {
  const parsed = PersistedState.parse(state)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf8')
}

/** Single authoritative in-memory store; every mutation persists. */
let cached: PersistedState | null = null

export function loadState(): PersistedState {
  if (!cached) {
    cached = loadStateFromFile(resolveStatePath())
  }
  return cached
}

export function saveState(state: PersistedState): void {
  cached = state
  saveStateToFile(resolveStatePath(), state)
}

/** Test hook: reset the cache so the next load re-reads from disk. */
export function resetStoreCache(): void {
  cached = null
}

export function listRuns(): RunRecord[] {
  return loadState().runs
}

export function getRun(runId: string): RunRecord | null {
  return loadState().runs.find((r) => r.id === runId) ?? null
}

export function upsertRun(record: RunRecord): void {
  const state = loadState()
  const runs = state.runs.some((r) => r.id === record.id)
    ? state.runs.map((r) => (r.id === record.id ? record : r))
    : [...state.runs, record]
  saveState({ ...state, runs })
}
