import type { SkillRecipe } from '../schemas/skill'

const PLACEHOLDER = /\{\{\s*(?:inputs\.)?([A-Za-z0-9_]+)\s*\}\}/g

/**
 * Input keys a person must supply to run a recipe, scanned from {{inputs.*}}
 * placeholders. Keys a decide step writes at run time are Ghost's to fill.
 */
export function recipeInputKeys(recipe: SkillRecipe): string[] {
  const decided = new Set(
    recipe.steps.flatMap((s) => (s.kind === 'decide' && s.writes ? [s.writes] : []))
  )
  const haystack = JSON.stringify({
    bindings: recipe.steps.map((s) => s.bindings),
    checks: recipe.steps.map((s) => s.checks)
  })
  const keys = new Set<string>()
  for (const match of haystack.matchAll(PLACEHOLDER)) {
    if (match[1] && !decided.has(match[1])) keys.add(match[1])
  }
  return [...keys]
}
