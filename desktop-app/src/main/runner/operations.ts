import type { SkillStep } from '../../shared/schemas'
import { formatAttemptAction, orderedAttemptSelectors } from '../../shared/capture/selectors'
import { resolvePlaceholders } from './checks'

/** Actions the runner can perform in the target page. Each throws on failure. */
export interface DomAct {
  click: (selector: string) => Promise<void>
  fill: (selector: string, value: string) => Promise<void>
  submit: (selector: string) => Promise<void>
  goto: (path: string) => Promise<void>
}

export interface OperationDeps {
  act: DomAct
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
    resolved[name] = resolvePlaceholders(template, inputs)
  }
  return resolved
}

/** Target-page highlight selector for a step, or null when it has none. */
export function selectorForStep(step: SkillStep, inputs: Record<string, string>): string | null {
  const selector = step.bindings['selector']
  if (!selector) return null
  try {
    return resolvePlaceholders(selector, inputs)
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
    ? resolvePlaceholders(step.bindings['selector'], inputs)
    : undefined
  const fallbacks: string[] = []
  for (const raw of step.selectorCandidates ?? []) {
    try {
      fallbacks.push(resolvePlaceholders(raw, inputs))
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
