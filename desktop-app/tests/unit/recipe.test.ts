import { describe, expect, it } from 'vitest'
import {
  formatRecipeErrorMessage,
  parseRecipeErrorMessage,
  recipeErrorsFromRejection,
  RecipeValidationError
} from '../../src/shared/policy/recipe'

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
