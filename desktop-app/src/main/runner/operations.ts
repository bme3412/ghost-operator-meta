import type { SkillStep } from '../../shared/schemas'
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
  const highlight = resolved['selector'] ?? null
  switch (action) {
    case 'click': {
      if (!resolved['selector']) throw new Error(`Step "${step.id}" has no selector.`)
      await deps.act.click(resolved['selector'])
      return {
        actions: [`clicked ${resolved['selector']}`],
        observed: step.goal ?? `Clicked ${resolved['selector']}.`,
        highlight
      }
    }
    case 'fill': {
      if (!resolved['selector']) throw new Error(`Step "${step.id}" has no selector.`)
      if (resolved['value'] === undefined) throw new Error(`Step "${step.id}" has no value.`)
      await deps.act.fill(resolved['selector'], resolved['value'])
      return {
        actions: [`filled ${resolved['selector']}`],
        observed: step.goal ?? `Filled ${resolved['selector']}.`,
        highlight
      }
    }
    case 'submit': {
      if (!resolved['selector']) throw new Error(`Step "${step.id}" has no selector.`)
      await deps.act.submit(resolved['selector'])
      return {
        actions: [`submitted ${resolved['selector']}`],
        observed: step.goal ?? `Submitted ${resolved['selector']}.`,
        highlight
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
