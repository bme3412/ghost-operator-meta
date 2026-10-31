import { BrowserWindow } from 'electron'
import type { ProviderId, RunProgress } from '../../shared/schemas'
import { EVENTS } from '../ipc/channels'
import { broadcastLibraryChanged } from '../ipc/broadcast'
import { explainStep } from '../providers/explain'
import { getActiveVersion, getSkill } from '../skills'
import { upsertRun } from '../store'
import { resolveTargetUrl } from '../target'
import { getWindow } from '../windows/registry'
import { createRunner, type Runner } from './index'

/** Settle delay after DOM actions so server round-trips can land. Prototype timing. */
const SETTLE_MS = 750

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function contents(): Electron.WebContents {
  const target = getWindow('target')
  if (!target) throw new Error('Target window is not available.')
  return target.webContents
}

async function dom<T>(code: string): Promise<T> {
  try {
    return (await contents().executeJavaScript(code)) as T
  } catch (error) {
    throw new Error(`Target page query failed: ${(error as Error).message}`)
  }
}

function broadcast(progress: RunProgress | null): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(EVENTS.runProgress, progress)
  }
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
      getSkillVersion: (skillId, version) => {
        const skill = getSkill(skillId)
        if (!skill) return null
        const record =
          version === null
            ? getActiveVersion(skillId)
            : (skill.versions.find((v) => v.version === version) ?? null)
        if (!record || (version === null && record.status !== 'published')) return null
        return { skillName: skill.name, recipe: record.recipe }
      },
      domQuery: {
        visible: (selector: string): Promise<boolean> =>
          dom<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`),
        text: (selector: string): Promise<string | null> =>
          dom<string | null>(
            `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? (el.textContent ?? '').slice(0, 5000) : null; })()`
          ),
        value: (selector: string): Promise<string | null> =>
          dom<string | null>(
            `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const v = el?.value; return typeof v === 'string' ? v : null; })()`
          )
      },
      domAct: {
        click: async (selector: string): Promise<void> => {
          await dom(
            `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing ' + ${JSON.stringify(selector)}); el.scrollIntoView({ block: 'nearest' }); el.click(); })()`
          )
          await sleep(SETTLE_MS)
        },
        fill: async (selector: string, value: string): Promise<void> => {
          await dom(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el || !('value' in el)) throw new Error('cannot fill ' + ${JSON.stringify(selector)});
            const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
              : el instanceof HTMLSelectElement ? null : HTMLInputElement.prototype;
            if (proto) {
              const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
              if (setter) setter.call(el, ${JSON.stringify(value)});
              else el.value = ${JSON.stringify(value)};
            } else {
              el.value = ${JSON.stringify(value)};
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          })()`)
        },
        submit: async (selector: string): Promise<void> => {
          await dom(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            const form = el instanceof HTMLFormElement ? el : el?.closest('form');
            if (!form) throw new Error('cannot submit ' + ${JSON.stringify(selector)} + ': no form');
            form.requestSubmit();
          })()`)
          await sleep(SETTLE_MS)
        },
        goto: async (path: string): Promise<void> => {
          const target = getWindow('target')
          if (!target) throw new Error('Target window is not available.')
          const url = path.startsWith('http')
            ? path
            : `${resolveTargetUrl()}${path.startsWith('/') ? path : `/${path}`}`
          await target.loadURL(url)
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
