/**
 * Wait-for-condition helpers for runner reliability. All polling is bounded:
 * every wait resolves within its timeout so a stuck page degrades into an
 * honest check failure instead of a hung run.
 *
 * Electron-free so unit tests can exercise every helper with fakes.
 */
import type { CheckRef } from '../../shared/schemas'
import { resolvePlaceholders, type DomQuery } from './checks'

/** Upper bound for waiting on a step's check selectors to become ready. */
export const CHECK_WAIT_TIMEOUT_MS = 5000
/** Poll interval while waiting on check selectors. */
export const CHECK_WAIT_POLL_MS = 100
/** Small capped sleep kept after DOM actions for framework round-trips. */
export const FALLBACK_SETTLE_MS = 150
/** Upper bound for a goto navigation to finish loading. */
export const GOTO_LOAD_TIMEOUT_MS = 15000

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface PollOpts {
  timeoutMs?: number
  pollMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

function resolvedOpts(opts?: PollOpts): {
  timeoutMs: number
  pollMs: number
  sleep: (ms: number) => Promise<void>
  now: () => number
} {
  return {
    timeoutMs: opts?.timeoutMs ?? CHECK_WAIT_TIMEOUT_MS,
    pollMs: opts?.pollMs ?? CHECK_WAIT_POLL_MS,
    sleep: opts?.sleep ?? defaultSleep,
    now: opts?.now ?? Date.now
  }
}

/** Resolve a check's selector against run inputs, or null when there is none. */
export function selectorForCheck(
  ref: CheckRef,
  inputs: Record<string, string>
): string | null {
  if (!ref.selector) return null
  try {
    return resolvePlaceholders(ref.selector, inputs)
  } catch {
    return null
  }
}

/** Resolved selectors for checks that name one; unresolvable entries are skipped. */
export function selectorsForChecks(
  checks: CheckRef[],
  inputs: Record<string, string>
): string[] {
  const selectors: string[] = []
  for (const ref of checks) {
    const selector = selectorForCheck(ref, inputs)
    if (selector) selectors.push(selector)
  }
  return selectors
}

/**
 * Generic bounded poll. Resolves true as soon as `ready` holds, false when the
 * timeout expires first. Never throws for timeouts.
 */
export async function waitForCondition(
  ready: () => Promise<boolean>,
  opts?: PollOpts
): Promise<boolean> {
  const { timeoutMs, pollMs, sleep, now } = resolvedOpts(opts)
  const deadline = now() + timeoutMs
  for (;;) {
    if (await ready()) return true
    if (now() >= deadline) return false
    await sleep(pollMs)
  }
}

/** A check is ready to evaluate when its target element can answer it. */
async function checkReady(
  ref: CheckRef,
  inputs: Record<string, string>,
  dom: DomQuery
): Promise<boolean> {
  const selector = selectorForCheck(ref, inputs)
  if (!selector) return true
  switch (ref.name) {
    case 'target_visible':
      return dom.visible(selector)
    case 'text_contains':
      return (await dom.text(selector)) !== null
    case 'value_equals': {
      const [value, text] = await Promise.all([dom.value(selector), dom.text(selector)])
      return value !== null || text !== null
    }
    default:
      return true
  }
}

/**
 * Wait until every check on the step can be evaluated (its selector answers),
 * up to a bounded timeout. Returns true when ready, false on timeout. Callers
 * always proceed to evaluate the checks afterwards so a timeout degrades into
 * an honest check failure, never a hang.
 */
export async function waitForStepChecks(
  checks: CheckRef[],
  inputs: Record<string, string>,
  dom: DomQuery,
  opts?: PollOpts
): Promise<boolean> {
  if (checks.length === 0) return true
  return waitForCondition(async () => {
    for (const ref of checks) {
      if (!(await checkReady(ref, inputs, dom))) return false
    }
    return true
  }, opts)
}

/** Minimal load-event surface of Electron's WebContents (adapter-friendly). */
export interface LoadEventSource {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: 'did-finish-load' | 'did-fail-load', listener: (...args: any[]) => void): void
  removeListener(
    event: 'did-finish-load' | 'did-fail-load',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void
  ): void
}

export interface PageLoadWait {
  promise: Promise<void>
  cancel: () => void
}

/**
 * Settle when the main frame finishes loading (resolve) or fails to load
 * (reject). Subframe failures and superseded navigations (ERR_ABORTED) are
 * ignored while waiting for the main frame. Rejects when the bounded timeout
 * expires. `cancel` detaches the listeners for callers whose navigation call
 * itself threw.
 */
export function startPageLoadWait(
  source: LoadEventSource,
  opts?: { timeoutMs?: number }
): PageLoadWait {
  const timeoutMs = opts?.timeoutMs ?? GOTO_LOAD_TIMEOUT_MS
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const cleanup = (): void => {
    source.removeListener('did-finish-load', onFinish)
    source.removeListener('did-fail-load', onFail)
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }
  function onFinish(): void {
    if (settled) return
    settled = true
    cleanup()
    resolvePromise()
  }
  function onFail(
    _event: unknown,
    errorCode?: number,
    description?: string,
    _url?: string,
    isMainFrame?: boolean
  ): void {
    if (settled) return
    if (isMainFrame === false) return
    if (errorCode === -3) return
    settled = true
    cleanup()
    rejectPromise(
      new Error(
        `Navigation failed${description ? `: ${description}` : ''} (code ${errorCode ?? 'unknown'}).`
      )
    )
  }

  let resolvePromise = (): void => undefined
  let rejectPromise = (_error: Error): void => undefined
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  timer = setTimeout(() => {
    if (settled) return
    settled = true
    cleanup()
    rejectPromise(new Error(`Navigation timed out after ${timeoutMs}ms.`))
  }, timeoutMs)
  const maybeUnref = timer as unknown as { unref?: () => void }
  if (typeof maybeUnref.unref === 'function') {
    maybeUnref.unref()
  }
  source.on('did-finish-load', onFinish)
  source.on('did-fail-load', onFail)

  return {
    promise,
    cancel: () => {
      if (settled) return
      settled = true
      cleanup()
    }
  }
}

/** Convenience wrapper when no cancellation is needed. */
export function waitForPageLoad(
  source: LoadEventSource,
  opts?: { timeoutMs?: number }
): Promise<void> {
  return startPageLoadWait(source, opts).promise
}
