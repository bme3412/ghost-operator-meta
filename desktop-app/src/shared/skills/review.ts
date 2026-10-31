import type { SkillRecipe } from '../schemas/skill'

/** Steps that pause for human approval instead of replaying deterministically. */
export function countReviewSteps(recipe: SkillRecipe): number {
  return recipe.steps.filter((step) => step.kind === 'review').length
}

/**
 * Review burden of a skill version: review steps plus unresolved compile
 * notes. Used for the guided-run nudge; never blocks save/publish.
 */
export function countReviewItems(recipe: SkillRecipe, unresolved: readonly string[]): number {
  return countReviewSteps(recipe) + unresolved.length
}
