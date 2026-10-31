import type { SkillRecipe } from '../schemas/skill'

/** Deterministic readable rendering of a recipe. Shared so store migration matches the compiler. */
export function renderInstructions(recipe: SkillRecipe): string {
  const lines: string[] = [`Goal: ${recipe.goal}`, '']
  recipe.steps.forEach((step, index) => {
    lines.push(`${index + 1}. [${step.kind}] ${step.id}`)
    if (step.goal) lines.push(`   Do: ${step.goal}`)
    const bindings = Object.entries(step.bindings)
    if (bindings.length > 0) {
      lines.push(`   Bindings: ${bindings.map(([k, v]) => `${k} ← ${v}`).join(', ')}`)
    }
    if (step.checks.length > 0) {
      const rendered = step.checks.map((c) =>
        c.selector ? `${c.name} ${c.selector}` : c.name
      )
      lines.push(`   Checks: ${rendered.join(', ')}`)
    }
    if (step.why) lines.push(`   Why: ${step.why}`)
    if (step.expected) lines.push(`   Expected: ${step.expected}`)
  })
  return lines.join('\n')
}
