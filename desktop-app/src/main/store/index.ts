import { app } from 'electron'
import {
  closeSync,
  mkdirSync,
  openSync,
  fsyncSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
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

/** Details of the most recent corrupt-state recovery, if the last load quarantined a file. */
export interface StateRecovery {
  /** Path of the corrupt file that was quarantined. */
  filePath: string
  /** Timestamped backup the corrupt bytes were moved to. */
  quarantinedPath: string
  /** Short reason (parse vs validation failure). */
  reason: string
}

let lastRecovery: StateRecovery | null = null

/** Recovery flag for the UI/logs to note; null when the last load needed no recovery. */
export function getLastStateRecovery(): StateRecovery | null {
  return lastRecovery
}

/** Test hook: clear the recovery flag. */
export function clearLastStateRecovery(): void {
  lastRecovery = null
}

/** Move a corrupt state file aside so the next save starts from a clean slate. */
function quarantineCorruptFile(filePath: string, reason: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const quarantinedPath = `${filePath}.corrupt-${stamp}.bak`
  renameSync(filePath, quarantinedPath)
  lastRecovery = { filePath, quarantinedPath, reason }
  console.warn(
    `[store] corrupt state file quarantined: ${filePath} -> ${quarantinedPath} (${reason}); starting from default state`
  )
  return quarantinedPath
}

export function loadStateFromFile(filePath: string): PersistedState {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultState()
    }
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    quarantineCorruptFile(filePath, `JSON parse error: ${(error as Error).message}`)
    return defaultState()
  }
  try {
    return migrateState(parsed)
  } catch (error) {
    quarantineCorruptFile(filePath, `validation error: ${(error as Error).message}`)
    return defaultState()
  }
}

export function saveStateToFile(filePath: string, state: PersistedState): void {
  const parsed = PersistedState.parse(state)
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), 'utf8')
  // Best-effort durability: fsync the temp file before the atomic rename.
  try {
    const fd = openSync(tmpPath, 'r')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  } catch {
    // Filesystems that reject fsync (some network/tmp mounts) still get atomicity via rename.
  }
  try {
    renameSync(tmpPath, filePath)
  } catch (error) {
    try {
      unlinkSync(tmpPath)
    } catch {
      // Ignore cleanup failures; the original error below is what matters.
    }
    throw error
  }
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
