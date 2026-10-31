import { describe, expect, it } from 'vitest'
import { scriptedIds, scriptedProposal } from '../../src/main/providers/fixture'
import { validateRecipe } from '../../src/shared/policy/recipe'
import { Proposal } from '../../src/shared/schemas'
import { SALTBREAK_STARTER_TASKS } from '../../src/shared/target'

/** Input keys a recipe needs, scanned from {{inputs.*}} placeholders. */
function collectInputs(recipe: { steps: Array<{ bindings: Record<string, string>; checks: unknown[] }> }): string[] {
  const haystack = JSON.stringify({ bindings: recipe.steps.map((s) => s.bindings), checks: recipe.steps.map((s) => s.checks) })
  const keys = new Set<string>()
  for (const match of haystack.matchAll(/\{\{\s*(?:inputs\.)?([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (match[1]) keys.add(match[1])
  }
  return [...keys]
}

describe('scripted starter proposals', () => {
  it('covers every Saltbreak starter task id', () => {
    expect(new Set(scriptedIds())).toEqual(new Set(SALTBREAK_STARTER_TASKS.map((t) => t.id)))
    expect(scriptedProposal('nope')).toBeNull()
  })

  it('produces schema-valid recipes that pass policy review', () => {
    for (const task of SALTBREAK_STARTER_TASKS) {
      const proposal = scriptedProposal(task.id)
      expect(proposal).not.toBeNull()
      expect(() => Proposal.parse(proposal)).not.toThrow()
      expect(validateRecipe(proposal!.recipe)).toEqual([])
      expect(proposal!.recipe.id).toBe(task.id)
      expect(proposal!.recipe.allowedApplications).toEqual(['saltbreak'])
    }
  })

  it('demonstrates every run input each recipe needs', () => {
    for (const task of SALTBREAK_STARTER_TASKS) {
      const proposal = scriptedProposal(task.id)!
      const needed = collectInputs(proposal.recipe)
      const paths = Object.values(proposal.demonstrated)
      for (const key of needed) {
        expect(paths).toContain(`inputs.${key}`)
      }
      expect(new Set(Object.keys(task.exampleInputs))).toEqual(new Set(needed))
    }
  })

  it('gates the payout script on the SB-8014 mismatch and verifies variance zero', () => {
    const recipe = scriptedProposal('reconcile-payout')!.recipe
    const gate = recipe.steps.find((s) => s.id === 'gate-mismatch')
    expect(gate?.kind).toBe('review')
    expect(gate?.goal).toContain('SB-8014')
    const variance = recipe.steps.find((s) => s.id === 'verify-variance')
    expect(variance?.checks).toEqual([
      { name: 'text_contains', selector: '[data-semid="cell-value-B1"]', expected: '0' }
    ])
  })

  it('gates the ticket script on the known T-101 question', () => {
    const recipe = scriptedProposal('answer-ticket')!.recipe
    expect(recipe.steps[0]?.kind).toBe('review')
    expect(recipe.steps[0]?.goal).toContain('T-109')
  })

  it('ends the shop script at a human checkout step', () => {
    const recipe = scriptedProposal('shop-under-budget')!.recipe
    const last = recipe.steps[recipe.steps.length - 1]
    expect(last?.kind).toBe('review')
    expect(last?.goal).toContain('pay')
  })

  it('parameterizes the order help script by order and reason', () => {
    const proposal = scriptedProposal('report-order-charge')!
    expect(collectInputs(proposal.recipe).sort()).toEqual(['orderId', 'reason'])
    expect(proposal.demonstrated).toEqual({
      'Order "SB-8014"': 'inputs.orderId',
      'Reason "Charged twice"': 'inputs.reason'
    })
  })
})
