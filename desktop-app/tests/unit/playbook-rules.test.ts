import { describe, expect, it } from 'vitest'
import {
  peekPendingUpdateSkillId,
  setPendingUpdateSkillId,
  takePendingUpdateSkillId
} from '../../src/renderer/src/lib/pendingUpdate'
import { splitRule } from '../../src/renderer/src/panel/views/PlaybookView'

describe('splitRule (Playbook "See how this works")', () => {
  it('preserves the full saved rule as the row condition source', () => {
    const rule = 'Damaged in shipping, reported within 7 days, means refund'
    expect(splitRule(rule)).toEqual({
      condition: 'Damaged in shipping, reported within 7 days',
      outcome: 'refund'
    })
  })

  it('keeps conditions and exceptions instead of keyword summaries', () => {
    const rule = 'Damaged in shipping, reported within 7 days, means refund'
    const split = splitRule(rule)
    // The row must never collapse the conditional rule into "Damage → refund".
    expect(split?.condition).toContain('within 7 days')
    expect(split?.condition.toLowerCase()).not.toBe('damage')
  })

  it('returns null when there is no reliable condition/outcome split', () => {
    expect(splitRule('Ask me about anything unusual')).toBeNull()
    expect(splitRule('')).toBeNull()
  })
})

describe('pendingUpdate identity (Update this approach)', () => {
  it('carries the skill id once from Playbook through to Review', () => {
    setPendingUpdateSkillId('handle-after-hours-support-tickets')
    expect(peekPendingUpdateSkillId()).toBe('handle-after-hours-support-tickets')
    expect(takePendingUpdateSkillId()).toBe('handle-after-hours-support-tickets')
    // Consumed: a later unrelated save must not reuse it.
    expect(takePendingUpdateSkillId()).toBeNull()
    expect(peekPendingUpdateSkillId()).toBeNull()
  })

  it('can be cleared', () => {
    setPendingUpdateSkillId('some-skill')
    setPendingUpdateSkillId(null)
    expect(takePendingUpdateSkillId()).toBeNull()
  })
})
