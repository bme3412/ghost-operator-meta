import type { ProviderId, RunProgress } from '../../shared/schemas'
import { EVENTS } from '../ipc/channels'
import { broadcastLibraryChanged, sendToRoles } from '../ipc/broadcast'
import { explainStep } from '../providers/explain'
import { getActiveVersion, getSkill } from '../skills'
import { upsertRun } from '../store'
import { getTargetInfo, resolveTargetUrl } from '../target'
import { isTargetNavigationAllowed } from '../windows/guards'
import { getWindow } from '../windows/registry'
import { createRunner, type Runner } from './index'
import {
  clickSnippet,
  fillSnippet,
  submitSnippet,
  textSnippet,
  valueSnippet,
  visibleSnippet
} from './snippets'
import {
  FALLBACK_SETTLE_MS,
  GOTO_LOAD_TIMEOUT_MS,
  startPageLoadWait,
  type LoadEventSource
} from './wait'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function contents(): Electron.WebContents {
  const target = getWindow('target')
  if (!target) throw new Error('Target window is not available.')
  return target.webContents
}

/** Adapt a WebContents to the pure load-wait helper (branching keeps overloads happy). */
function loadSource(wc: Electron.WebContents): LoadEventSource {
  return {
    on(event, listener) {
      if (event === 'did-finish-load') wc.on('did-finish-load', listener)
      else wc.on('did-fail-load', listener)
    },
    removeListener(event, listener) {
      if (event === 'did-finish-load') wc.removeListener('did-finish-load', listener)
      else wc.removeListener('did-fail-load', listener)
    }
  }
}

async function dom<T>(code: string): Promise<T> {
  try {
    return (await contents().executeJavaScript(code)) as T
  } catch (error) {
    throw new Error(`Target page query failed: ${(error as Error).message}`)
  }
}

/** Isolated world for read-only check queries; the page cannot see or spoof it. */
const CHECK_WORLD_ID = 1337

// Read-only check queries run in an isolated world with its own JS wrappers,
// so a page that overrides querySelector or Element methods reads back
// honestly. Actions stay in the main world so page event handlers observe
// exactly what a user gesture would produce.
async function domRead<T>(code: string): Promise<T> {
  try {
    const raw = await contents().executeJavaScriptInIsolatedWorld(CHECK_WORLD_ID, [{ code }])
    // A single script resolves to its value; tolerate an array shape too.
    return (Array.isArray(raw) ? raw[0] : raw) as T
  } catch (error) {
    throw new Error(`Target page query failed: ${(error as Error).message}`)
  }
}

function broadcast(progress: RunProgress | null): void {
  // Run progress carries run inputs: the panel alone receives it.
  sendToRoles(['panel'], EVENTS.runProgress, progress)
  if (progress && ['succeeded', 'failed', 'cancelled'].includes(progress.status)) {
    broadcastLibraryChanged()
  }
}

function highlight(selector: string | null): void {
  getWindow('target')?.webContents.send(EVENTS.highlight, selector)
}

let singleton: Runner | null = null

export function getRunner(): Runner {
  if (!singleton) {
    singleton = createRunner({
      now: () => Date.now(),
      tick: () => new Promise((resolve) => setImmediate(resolve)),
      getScopeId: () => getTargetInfo().id,
      getSkillVersion: (skillId, version) => {
        const skill = getSkill(skillId)
        if (!skill) return null
        const record =
          version === null
            ? getActiveVersion(skillId)
            : (skill.versions.find((v) => v.version === version) ?? null)
        // Only published versions run — explicit version numbers included.
        if (!record || record.status !== 'published') return null
        return { skillName: skill.name, recipe: record.recipe }
      },
      domQuery: {
        visible: (selector: string): Promise<boolean> => domRead<boolean>(visibleSnippet(selector)),
        text: (selector: string): Promise<string | null> =>
          domRead<string | null>(textSnippet(selector)),
        value: (selector: string): Promise<string | null> =>
          domRead<string | null>(valueSnippet(selector))
      },
      domAct: {
        click: async (selector: string): Promise<void> => {
          await dom(clickSnippet(selector))
          // Small capped fallback; the runner core waits on check selectors.
          await sleep(FALLBACK_SETTLE_MS)
        },
        fill: async (selector: string, value: string): Promise<void> => {
          await dom(fillSnippet(selector, value))
          await sleep(FALLBACK_SETTLE_MS)
        },
        submit: async (selector: string): Promise<void> => {
          await dom(submitSnippet(selector))
          await sleep(FALLBACK_SETTLE_MS)
        },
        goto: async (path: string): Promise<void> => {
          const target = getWindow('target')
          if (!target) throw new Error('Target window is not available.')
          const url = path.startsWith('http')
            ? path
            : `${resolveTargetUrl()}${path.startsWith('/') ? path : `/${path}`}`
          // programmatic loadURL emits no will-navigate, so enforce the same
          // origin lock here: a run must never leave the configured origin,
          // whatever the recipe or run inputs contain.
          if (!isTargetNavigationAllowed(url, resolveTargetUrl())) {
            throw new Error(`Navigation to ${url} leaves the target origin.`)
          }
          // Attach before navigating so the load event cannot slip past us.
          const load = startPageLoadWait(loadSource(target.webContents), {
            timeoutMs: GOTO_LOAD_TIMEOUT_MS
          })
          try {
            await target.loadURL(url)
          } catch (error) {
            load.cancel()
            throw new Error(`Navigation to ${url} failed: ${(error as Error).message}`)
          }
          await load.promise
          await sleep(FALLBACK_SETTLE_MS)
        }
      },
      persistRun: upsertRun,
      onProgress: broadcast,
      highlight
    })
  }
  return singleton
}

/** Test hook: drop the singleton so the next access rebuilds it. */
export function resetRunner(): void {
  singleton = null
}

export async function explainCurrentStep(
  runId: string,
  providerId: ProviderId
): Promise<{ explanation: string; providerId: ProviderId }> {
  const progress = getRunner().getProgress()
  if (!progress || progress.runId !== runId || !progress.current) {
    throw new Error(`No current step for run ${runId}.`)
  }
  const skill = getSkill(progress.skillId)
  return explainStep(
    progress.current,
    skill?.name ?? progress.skillId,
    progress.inputs,
    providerId
  )
}
