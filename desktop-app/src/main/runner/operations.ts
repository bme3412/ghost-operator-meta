import type { SkillStep } from '../../shared/schemas'
import { formatAttemptAction, orderedAttemptSelectors } from '../../shared/capture/selectors'
import { resolvePlaceholders, resolveSelectorPlaceholders, type DomQuery } from './checks'
import { SELECTOR_READY_TIMEOUT_MS, waitForAnySelector, type PollOpts } from './wait'

/** Actions the runner can perform in the target page. Each throws on failure. */
export interface DomAct {
  click: (selector: string) => Promise<void>
  fill: (selector: string, value: string) => Promise<void>
  submit: (selector: string) => Promise<void>
  goto: (path: string) => Promise<void>
}

export interface OperationDeps {
  act: DomAct
  /**
   * Read-only page queries. When present, click/fill/submit steps wait for
   * a candidate selector to exist before acting once — a click that lands a
   * client-side navigation no longer races the next step's action.
   */
  query?: DomQuery
  /** Poll budget overrides for the pre-action readiness wait (tests only). */
  readyWait?: PollOpts
}

export interface OperationOutcome {
  actions: string[]
  observed: string
  highlight: string | null
}

export function resolveBindings(
  step: SkillStep,
  inputs: Record<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [name, template] of Object.entries(step.bindings)) {
    // Selector bindings are escaped so run inputs can't inject CSS; every
    // other binding (values, actions) substitutes verbatim.
    resolved[name] =
      name === 'selector'
        ? resolveSelectorPlaceholders(template, inputs)
        : resolvePlaceholders(template, inputs)
  }
  return resolved
}

/** Target-page highlight selector for a step, or null when it has none. */
export function selectorForStep(step: SkillStep, inputs: Record<string, string>): string | null {
  const selector = step.bindings['selector']
  if (!selector) return null
  try {
    return resolveSelectorPlaceholders(selector, inputs)
  } catch {
    return null
  }
}

/**
 * Ordered replay selectors for a step: the primary binding first, then the
 * declared fallback chain. Candidates naming a missing run input cannot be
 * attempted and are skipped; the primary still throws as before.
 */
export function attemptSelectorsForStep(
  step: SkillStep,
  inputs: Record<string, string>
): string[] {
  const primary = step.bindings['selector']
    ? resolveSelectorPlaceholders(step.bindings['selector'], inputs)
    : undefined
  const fallbacks: string[] = []
  for (const raw of step.selectorCandidates ?? []) {
    try {
      fallbacks.push(resolveSelectorPlaceholders(raw, inputs))
    } catch {
      // Unresolvable candidate; it cannot be attempted.
    }
  }
  return orderedAttemptSelectors(primary, fallbacks)
}

/** Try each selector in order until one acts without throwing. */
async function attemptInOrder(
  stepId: string,
  selectors: string[],
  invoke: (selector: string) => Promise<void>
): Promise<{ matched: string; index: number }> {
  let lastError: unknown = null
  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i] as string
    try {
      await invoke(selector)
      return { matched: selector, index: i }
    } catch (error) {
      lastError = error
    }
  }
  if (selectors.length <= 1) throw lastError as Error
  const detail = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Step "${stepId}" matched none of ${selectors.length} selector(s): ${detail}`)
}

/**
 * Wait for an action step's target to exist before acting once. The wait is
 * read-only, so the action itself still runs exactly once; a timeout fails
 * honestly instead of racing a navigation in flight.
 */
async function awaitSelectorReady(
  stepId: string,
  selectors: string[],
  deps: OperationDeps
): Promise<void> {
  if (!deps.query || selectors.length === 0) return
  const timeoutMs = deps.readyWait?.timeoutMs ?? SELECTOR_READY_TIMEOUT_MS
  const ready = await waitForAnySelector(selectors, deps.query, {
    ...deps.readyWait,
    timeoutMs
  })
  if (!ready) {
    const target = selectors.length === 1 ? selectors[0] : `${selectors.length} selector(s)`
    throw new Error(
      `Step "${stepId}" target missing: no match for ${target} within ${timeoutMs / 1000}s.`
    )
  }
}

/**
 * Execute an assisted computer_task step in the target page through real DOM
 * interactions. Unknown actions fail the run instead of guessing.
 */
export async function executeComputerTask(
  step: SkillStep,
  inputs: Record<string, string>,
  deps: OperationDeps
): Promise<OperationOutcome> {
  const resolved = resolveBindings(step, inputs)
  const action = resolved['action']
  switch (action) {
    case 'click': {
      if (!resolved['selector']) throw new Error(`Step "${step.id}" has no selector.`)
      const selectors = attemptSelectorsForStep(step, inputs)
      await awaitSelectorReady(step.id, selectors, deps)
      const { matched, index } = await attemptInOrder(step.id, selectors, (s) =>
        deps.act.click(s)
      )
      return {
        actions: [formatAttemptAction('clicked', matched, index, selectors.length)],
        observed: step.goal ?? `Clicked ${matched}.`,
        highlight: matched
      }
    }
    case 'fill': {
      if (!resolved['selector']) throw new Error(`Step "${step.id}" has no selector.`)
      if (resolved['value'] === undefined) throw new Error(`Step "${step.id}" has no value.`)
      const selectors = attemptSelectorsForStep(step, inputs)
      await awaitSelectorReady(step.id, selectors, deps)
      const { matched, index } = await attemptInOrder(step.id, selectors, (s) =>
        deps.act.fill(s, resolved['value'] as string)
      )
      return {
        actions: [formatAttemptAction('filled', matched, index, selectors.length)],
        observed: step.goal ?? `Filled ${matched}.`,
        highlight: matched
      }
    }
    case 'submit': {
      if (!resolved['selector']) throw new Error(`Step "${step.id}" has no selector.`)
      const selectors = attemptSelectorsForStep(step, inputs)
      await awaitSelectorReady(step.id, selectors, deps)
      const { matched, index } = await attemptInOrder(step.id, selectors, (s) =>
        deps.act.submit(s)
      )
      return {
        actions: [formatAttemptAction('submitted', matched, index, selectors.length)],
        observed: step.goal ?? `Submitted ${matched}.`,
        highlight: matched
      }
    }
    case 'goto': {
      if (resolved['value'] === undefined) throw new Error(`Step "${step.id}" has no path.`)
      await deps.act.goto(resolved['value'])
      return {
        actions: [`opened ${resolved['value']}`],
        observed: step.goal ?? `Opened ${resolved['value']}.`,
        highlight: null
      }
    }
    default:
      throw new Error(`Assisted execution does not support action "${action ?? '(missing)'}".`)
  }
}
