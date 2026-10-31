import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EndPage, Recording, RecorderStatePush } from '../../shared/schemas'
import { loadState, saveState } from '../store'
import { appendMinedSuggestions } from '../suggest'
import { mineRecording } from '../suggest/mine'
import { getTargetInfo } from '../target'
import { getWindow } from '../windows/registry'
import { sendToRoles } from '../ipc/broadcast'
import { EVENTS } from '../ipc/channels'
import { createRecorder, type Recorder } from './index'

function screenshotsDir(): string {
  const base = app.isPackaged ? app.getPath('userData') : join(app.getAppPath(), '.local-state')
  return join(base, 'screenshots')
}

export function screenshotPathForRef(ref: string): string {
  const base = app.isPackaged ? app.getPath('userData') : join(app.getAppPath(), '.local-state')
  return join(base, ref)
}

async function captureScreenshot(recordingId: string, sequence: number): Promise<string | null> {
  try {
    const target = getWindow('target')
    if (!target) return null
    const image = await target.webContents.capturePage()
    const png = image.toPNG()
    if (png.length === 0) return null
    const dir = screenshotsDir()
    mkdirSync(dir, { recursive: true })
    const fileName = `${recordingId}-${sequence}.png`
    writeFileSync(join(dir, fileName), png)
    return join('screenshots', fileName)
  } catch {
    return null
  }
}

/** Isolated world for read-only ending-page queries (matches the runner's). */
const END_PAGE_WORLD_ID = 1337

/**
 * Stable data-semid hooks on the page where the demonstration ended, in
 * document order, nav chrome excluded. Read in an isolated world so page
 * scripts cannot spoof the hooks the compiler may verify against.
 */
const END_PAGE_SNIPPET = `(() => {
  const hooks = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('[data-semid]')) {
    const semid = el.getAttribute('data-semid');
    if (!semid || seen.has(semid) || hooks.length >= 12) continue;
    if (semid.startsWith('nav-') || !/^[A-Za-z0-9_-]+$/.test(semid)) continue;
    seen.add(semid);
    hooks.push('[data-semid="' + semid + '"]');
  }
  return { path: location.pathname, hooks };
})()`

async function captureEndPage(): Promise<EndPage | null> {
  const target = getWindow('target')
  if (!target) return null
  try {
    const raw = await target.webContents.executeJavaScriptInIsolatedWorld(END_PAGE_WORLD_ID, [
      { code: END_PAGE_SNIPPET }
    ])
    const result = (Array.isArray(raw) ? raw[0] : raw) as { path?: unknown; hooks?: unknown } | null
    if (!result || typeof result.path !== 'string' || !Array.isArray(result.hooks)) return null
    const hooks = result.hooks.filter((h): h is string => typeof h === 'string')
    return hooks.length > 0 ? { path: result.path, hooks } : null
  } catch {
    return null
  }
}

async function persistRecording(recording: Recording): Promise<void> {
  const state = loadState()
  // Stamp the site the demonstration ran on; Saltbreak stays "saltbreak".
  const withScope: Recording = { ...recording, applicationScope: getTargetInfo().id }
  const endPage = await captureEndPage()
  const stamped: Recording = endPage ? { ...withScope, endPage } : withScope
  saveState({ ...state, recordings: [...state.recordings, stamped] })
  // Mine suggestions from the stamped recording. Ids are stable hashes, so
  // re-persisting never duplicates.
  const mined = mineRecording(stamped)
  if (mined.length > 0) appendMinedSuggestions(mined)
}

function broadcast(push: RecorderStatePush): void {
  // The target capture layer and the panel router need state; the hidden
  // scout window must not observe the recording goal or case id.
  sendToRoles(['target', 'panel'], EVENTS.recordingState, push)
}

let singleton: Recorder | null = null

export function getRecorder(): Recorder {
  if (!singleton) {
    singleton = createRecorder({
      now: () => Date.now(),
      captureScreenshot,
      persistRecording,
      onStateChange: broadcast
    })
  }
  return singleton
}

/** Test hook: swap the singleton for an isolated instance. */
export function resetRecorder(): void {
  singleton = null
}
