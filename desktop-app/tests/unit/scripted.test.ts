import { describe, expect, it } from 'vitest'
import { AFTER_HOURS_RULES, scriptedIds, scriptedProposal } from '../../src/main/providers/fixture'
import { validateRecipe } from '../../src/shared/policy/recipe'
import { Proposal } from '../../src/shared/schemas'
import { recipeInputKeys } from '../../src/shared/skills/inputs'
import { SALTBREAK_STARTER_TASKS } from '../../src/shared/target'

describe('scripted starter proposals', () => {
  it('covers every Saltbreak starter task id', () => {
    expect(new Set(scriptedIds())).toEqual(new Set(SALTBREAK_STARTER_TASKS.map((t) => t.id)))
    expect(scriptedProposal('nope')).toBeNull()
  })

  it('offers only owner starters', () => {
    expect(SALTBREAK_STARTER_TASKS.every((t) => t.audience === 'owner')).toBe(true)
    expect(SALTBREAK_STARTER_TASKS[0]?.id).toBe('handle-after-hours-tickets')
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
      const needed = recipeInputKeys(proposal.recipe)
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

  it('decides after-hours tickets with the owner rules, then clicks the chosen resolution', () => {
    const proposal = scriptedProposal('handle-after-hours-tickets')!
    const steps = proposal.recipe.steps
    const decideIndex = steps.findIndex((s) => s.kind === 'decide')
    const decide = steps[decideIndex]!
    expect(decide.rules).toEqual(AFTER_HOURS_RULES)
    expect(decide.options).toEqual(['refund', 'exchange'])
    expect(decide.writes).toBe('resolution')
    expect(decide.bindings.readSelector).toBe('[data-semid="ticket-body-{{inputs.ticketId}}"]')
    expect(steps[decideIndex + 1]?.bindings.selector).toBe(
      '[data-semid="ticket-{{inputs.resolution}}-{{inputs.ticketId}}"]'
    )
    expect(recipeInputKeys(proposal.recipe)).toEqual(['ticketId'])
  })
})
