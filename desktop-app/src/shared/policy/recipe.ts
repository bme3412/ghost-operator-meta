import type { SkillRecipe } from '../schemas/skill'
import { TARGET } from '../target'
import { CHECK_PARAMS, isKnownCheck, isKnownTool } from './checks'

const DOM_ACTIONS = new Set(['click', 'fill', 'submit', 'goto'])

/**
 * Validate a recipe against registered capabilities. Returns blocking errors.
 * `scopeId` is the creating site the recipe must allow (Saltbreak by default).
 */
export function validateRecipe(recipe: SkillRecipe, scopeId: string = TARGET.id): string[] {
  const errors: string[] = []
  if (!recipe.allowedApplications.includes(scopeId)) {
    errors.push(`Recipe must allow the "${scopeId}" application.`)
  }
  for (const step of recipe.steps) {
    if (step.kind === 'tool') {
      if (!step.toolId) {
        errors.push(`Step "${step.id}" is a tool step without a toolId.`)
      } else if (!isKnownTool(step.toolId)) {
        errors.push(`Step "${step.id}" uses unregistered tool "${step.toolId}".`)
      }
    }
    if (step.kind === 'computer_task') {
      const action = step.bindings['action']
      if (!action || !DOM_ACTIONS.has(action)) {
        errors.push(
          `Step "${step.id}" needs bindings.action as one of ${[...DOM_ACTIONS].join(', ')}.`
        )
      } else if (action === 'goto' && !step.bindings['value']) {
        errors.push(`Step "${step.id}" is a goto step without bindings.value (path).`)
      } else if (action !== 'goto' && !step.bindings['selector']) {
        errors.push(`Step "${step.id}" needs bindings.selector for action "${action}".`)
      }
      if (action === 'fill' && step.bindings['value'] === undefined) {
        errors.push(`Step "${step.id}" is a fill step without bindings.value.`)
      }
    }
    for (const check of step.checks) {
      if (!isKnownCheck(check.name)) {
        errors.push(`Step "${step.id}" uses unknown check "${check.name}".`)
        continue
      }
      const params = CHECK_PARAMS[check.name]
      if (params?.selector && !check.selector) {
        errors.push(`Step "${step.id}" check "${check.name}" needs a selector.`)
      }
      if (params?.expected && check.expected === undefined) {
        errors.push(`Step "${step.id}" check "${check.name}" needs an expected value.`)
      }
    }
  }
  return errors
}

/** Heading of every recipe-validation failure message. The Studio UI parses it back into a list. */
export const RECIPE_ERROR_PREFIX = 'Recipe is invalid:'

export function formatRecipeErrorMessage(errors: string[]): string {
  return `${RECIPE_ERROR_PREFIX}\n${errors.map((entry) => `- ${entry}`).join('\n')}`
}

export class RecipeValidationError extends Error {
  readonly errors: string[]
  constructor(errors: string[]) {
    super(formatRecipeErrorMessage(errors))
    this.name = 'RecipeValidationError'
    this.errors = errors
  }
}

/** Throw a RecipeValidationError when the recipe fails capability validation. */
export function assertRecipeValid(recipe: SkillRecipe, scopeId: string = TARGET.id): void {
  const errors = validateRecipe(recipe, scopeId)
  if (errors.length > 0) {
    throw new RecipeValidationError(errors)
  }
}

/**
 * Recover the blocking-error list from a failure message. Returns null when
 * the message is not a recipe-validation failure. Tolerates Electron IPC
 * "Error: ..." wrapping around the message.
 */
export function parseRecipeErrorMessage(message: string): string[] | null {
  const start = message.indexOf(RECIPE_ERROR_PREFIX)
  if (start === -1) return null
  const errors = message
    .slice(start + RECIPE_ERROR_PREFIX.length)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0)
  return errors.length > 0 ? errors : null
}

/** Extract a recipe error list from an IPC rejection, or null when unrelated. */
export function recipeErrorsFromRejection(err: unknown): string[] | null {
  const candidates: Array<string | null> = [
    err instanceof Error ? err.message : null,
    typeof err === 'string' ? err : null,
    String(err)
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    const parsed = parseRecipeErrorMessage(candidate)
    if (parsed) return parsed
  }
  return null
}
