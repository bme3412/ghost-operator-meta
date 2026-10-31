import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Recording, RecorderStatePush } from '../../shared/schemas'
import { loadState, saveState } from '../store'
import { getWindow } from '../windows/registry'
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

function persistRecording(recording: Recording): void {
  const state = loadState()
  saveState({ ...state, recordings: [...state.recordings, recording] })
}

function broadcast(push: RecorderStatePush): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(EVENTS.recordingState, push)
  }
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
