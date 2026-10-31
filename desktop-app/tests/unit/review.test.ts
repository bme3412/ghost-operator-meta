import { describe, expect, it } from 'vitest'
import type { SkillRecipe } from '../../src/shared/schemas/skill'
import { countReviewItems, countReviewSteps } from '../../src/shared/skills/review'

function recipe(kinds: string[]): SkillRecipe {
  return {
    schemaVersion: 1,
    id: 'test-skill',
    version: 1,
    goal: 'Test',
    inputSchemaRef: 'TestInput',
    steps: kinds.map((kind, index) => ({
      id: `step-${index}`,
      kind: kind as 'computer_task' | 'review' | 'verify',
      bindings: {},
      dataRefs: [],
      checks: []
    })),
    allowedApplications: ['saltbreak'],
    allowedTools: []
  }
}

describe('review counting', () => {
  it('counts zero for deterministic-only recipes with no unresolved items', () => {
    const r = recipe(['computer_task', 'verify'])
    expect(countReviewSteps(r)).toBe(0)
    expect(countReviewItems(r, [])).toBe(0)
  })

  it('counts review steps', () => {
    const r = recipe(['computer_task', 'review', 'review', 'verify'])
    expect(countReviewSteps(r)).toBe(2)
    expect(countReviewItems(r, [])).toBe(2)
  })

  it('adds unresolved items to review steps', () => {
    const r = recipe(['review'])
    expect(countReviewItems(r, ['a', 'b'])).toBe(3)
    expect(countReviewItems(recipe(['computer_task']), ['only-unresolved'])).toBe(1)
  })
})
