import { describe, expect, it } from 'vitest'
import {
  formatRecipeErrorMessage,
  parseRecipeErrorMessage,
  recipeErrorsFromRejection,
  RecipeValidationError,
  validateRecipe
} from '../../src/shared/policy/recipe'
import type { SkillRecipe, SkillStep } from '../../src/shared/schemas'

function step(partial: Partial<SkillStep> & { id: string }): SkillStep {
  return {
    kind: 'computer_task',
    bindings: { action: 'click', selector: '[data-semid="x"]' },
    dataRefs: [],
    checks: [],
    ...partial
  }
}

function recipeWith(steps: SkillStep[]): SkillRecipe {
  return {
    schemaVersion: 1,
    id: 'r',
    version: 1,
    goal: 'g',
    inputSchemaRef: 'R',
    steps,
    allowedApplications: ['saltbreak'],
    allowedTools: []
  }
}

describe('recipe error messages', () => {
  it('round-trips blocking errors through format and parse', () => {
    const errors = ['Step "a" uses unknown check "vibes_ok".', 'Step "b" needs bindings.selector.']
    expect(parseRecipeErrorMessage(formatRecipeErrorMessage(errors))).toEqual(errors)
  })

  it('recovers the list from an IPC-style wrapped rejection', () => {
    const errors = ['Step "a" uses unknown check "vibes_ok".']
    const wrapped = new Error(formatRecipeErrorMessage(errors))
    expect(recipeErrorsFromRejection(wrapped)).toEqual(errors)
    expect(recipeErrorsFromRejection(`Error: ${formatRecipeErrorMessage(errors)}`)).toEqual(errors)
  })

  it('returns null for unrelated failures', () => {
    expect(parseRecipeErrorMessage('Unknown skill nope.')).toBeNull()
    expect(recipeErrorsFromRejection(new Error('Unknown skill nope.'))).toBeNull()
    expect(recipeErrorsFromRejection('boom')).toBeNull()
  })

  it('carries every blocking error in the thrown message', () => {
    const errors = ['first problem', 'second problem']
    const thrown = new RecipeValidationError(errors)
    expect(thrown.errors).toEqual(errors)
    expect(thrown.message).toContain('first problem')
    expect(thrown.message).toContain('second problem')
  })
})

describe('recipe navigation policy', () => {
  it('accepts relative-path gotos', () => {
    const recipe = recipeWith([
      step({ id: 'g', bindings: { action: 'goto', value: '/staff/inbox' } })
    ])
    expect(validateRecipe(recipe, 'saltbreak')).toEqual([])
  })

  it('rejects absolute-URL gotos', () => {
    for (const value of ['https://evil.example.com/', 'http://127.0.0.1:9999/x']) {
      const recipe = recipeWith([step({ id: 'g', bindings: { action: 'goto', value } })])
      expect(validateRecipe(recipe, 'saltbreak').join(' ')).toContain('absolute URL')
    }
  })

  it('rejects verify steps without checks', () => {
    const recipe = recipeWith([step({ id: 'v', kind: 'verify', bindings: {} })])
    expect(validateRecipe(recipe, 'saltbreak').join(' ')).toContain('without checks')
  })

  it('rejects recipes that do not allow the live scope', () => {
    const recipe = recipeWith([step({ id: 'a' })])
    expect(validateRecipe(recipe, 'ebay-com').join(' ')).toContain('"ebay-com"')
  })
})
