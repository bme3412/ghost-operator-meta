import { describe, expect, it } from 'vitest'
import { validateRecipe } from '../../src/main/compiler/index'
import { compileFixture } from '../../src/main/providers/fixture'
import { Recording as RecordingSchema } from '../../src/shared/schemas'
import type { Recording, SkillRecipe } from '../../src/shared/schemas'

const NOW = Date.parse('2026-10-31T12:00:00.000Z')

function demoRecording(): Recording {
  return {
    id: 'rec-demo',
    goal: 'Resolve a support ticket',
    applicationScope: 'saltbreak',
    startedAt: new Date(NOW).toISOString(),
    endedAt: new Date(NOW + 60_000).toISOString(),
    notes: [{ sequence: 4, text: 'Resolve, do not reply; the answer is already posted.', atMs: NOW + 30_000 }],
    events: [
      { sequence: 0, type: 'navigate', value: '/', atMs: NOW },
      {
        sequence: 1,
        type: 'click',
        semanticId: 'nav-staff',
        selector: '[data-semid="nav-staff"]',
        targetLabel: 'Staff',
        atMs: NOW + 1_000
      },
      {
        sequence: 2,
        type: 'click',
        semanticId: 'nav-staff-inbox',
        selector: '[data-semid="nav-staff-inbox"]',
        targetLabel: 'Support inbox',
        atMs: NOW + 2_000
      },
      {
        sequence: 3,
        type: 'click',
        semanticId: 'ticket-resolve-T-101',
        selector: '[data-semid="ticket-resolve-T-101"]',
        targetLabel: 'resolved',
        recordIdentity: 'T-101',
        atMs: NOW + 3_000
      },
      { sequence: 4, type: 'submit', recordIdentity: 'T-101', atMs: NOW + 4_000 }
    ]
  }
}

describe('fixture compiler', () => {
  it('builds replayable steps from a ticket-resolve demonstration', () => {
    const proposal = compileFixture(demoRecording())
    const ids = proposal.recipe.steps.map((s) => s.id)
    expect(ids).toEqual([
      'goto-home',
      'click-nav-staff',
      'click-nav-staff-inbox',
      'click-ticket-resolve-t-101',
      'verify-ticket-resolved'
    ])
    expect(proposal.unresolved).toEqual([])
    expect(proposal.demonstrated).toEqual({ 'Ticket "T-101"': 'inputs.ticketId' })
    expect(proposal.recipe.allowedApplications).toEqual(['saltbreak'])
  })

  it('parameterizes the demonstrated identity in selectors and checks', () => {
    const proposal = compileFixture(demoRecording())
    const click = proposal.recipe.steps.find((s) => s.id === 'click-ticket-resolve-t-101')
    expect(click?.bindings['selector']).toBe('[data-semid="ticket-resolve-{{inputs.ticketId}}"]')
    const verify = proposal.recipe.steps.find((s) => s.id === 'verify-ticket-resolved')
    expect(verify?.checks).toEqual([
      {
        name: 'text_contains',
        selector: '[data-semid="ticket-status-{{inputs.ticketId}}"]',
        expected: 'resolved'
      }
    ])
  })

  it('skips the submit that follows its own click', () => {
    const proposal = compileFixture(demoRecording())
    expect(proposal.recipe.steps.some((s) => s.bindings['action'] === 'submit')).toBe(false)
  })

  it('attaches demonstrator notes to the active step', () => {
    const proposal = compileFixture(demoRecording())
    const verify = proposal.recipe.steps.find((s) => s.id === 'verify-ticket-resolved')
    expect(verify?.why).toContain('Resolve, do not reply')
    expect(proposal.notes).toEqual(['Resolve, do not reply; the answer is already posted.'])
  })

  it('converts hookless clicks to review steps instead of guessing', () => {
    const sparse: Recording = {
      ...demoRecording(),
      events: [{ sequence: 0, type: 'click', targetLabel: 'Mystery', atMs: NOW }]
    }
    const proposal = compileFixture(sparse)
    expect(proposal.recipe.steps.map((s) => s.kind)).toEqual(['review'])
    expect(proposal.unresolved.join(' ')).toContain('no stable selector')
  })

  it('reports pause gaps as review items', () => {
    const gappy: Recording = {
      ...demoRecording(),
      events: [...demoRecording().events, { sequence: 5, type: 'gap', atMs: NOW + 5_000 }]
    }
    const proposal = compileFixture(gappy)
    expect(proposal.unresolved.join(' ')).toContain('pause gap')
  })

  it('omits selectorCandidates when events carry no chain', () => {
    const proposal = compileFixture(demoRecording())
    for (const s of proposal.recipe.steps) {
      expect(s.selectorCandidates).toBeUndefined()
    }
  })

  it('passes substituted fallback candidates through to steps', () => {
    const chained: Recording = {
      ...demoRecording(),
      events: [
        {
          sequence: 0,
          type: 'click',
          semanticId: 'ticket-resolve-T-101',
          selector: '[data-semid="ticket-resolve-T-101"]',
          selectorCandidates: [
            '[data-semid="ticket-resolve-T-101"]',
            '#ticket-resolve-T-101',
            'button:nth-of-type(1)'
          ],
          recordIdentity: 'T-101',
          atMs: NOW
        }
      ]
    }
    const proposal = compileFixture(chained)
    const click = proposal.recipe.steps.find((s) => s.id === 'click-ticket-resolve-t-101')
    expect(click?.bindings['selector']).toBe('[data-semid="ticket-resolve-{{inputs.ticketId}}"]')
    expect(click?.selectorCandidates).toEqual([
      '#ticket-resolve-{{inputs.ticketId}}',
      'button:nth-of-type(1)'
    ])
  })

  it('parses legacy recordings and chained events without migration', () => {
    expect(() => RecordingSchema.parse(demoRecording())).not.toThrow()
    const chained = {
      ...demoRecording(),
      events: [
        {
          sequence: 0,
          type: 'click',
          selector: '#a',
          selectorCandidates: ['#a', '[name="a"]'],
          accessibleRole: 'button',
          accessibleLabel: 'A',
          atMs: NOW
        }
      ]
    }
    const parsed = RecordingSchema.parse(chained)
    expect(parsed.events[0]?.selectorCandidates).toEqual(['#a', '[name="a"]'])
  })
})

describe('recipe validation', () => {
  function recipe(): SkillRecipe {
    return compileFixture(demoRecording()).recipe
  }

  it('accepts the fixture recipe', () => {
    expect(validateRecipe(recipe())).toEqual([])
  })

  it('requires actions, selectors, and check params on DOM steps', () => {
    const bad = recipe()
    bad.steps[1] = { ...bad.steps[1]!, bindings: { action: 'click' } }
    bad.steps[2] = {
      ...bad.steps[2]!,
      bindings: { action: 'teleport', selector: '[data-semid="x"]' },
      checks: [{ name: 'target_visible' }]
    }
    const errors = validateRecipe(bad)
    expect(errors).toHaveLength(3)
    expect(errors.join(' ')).toContain('selector')
  })

  it('rejects unknown checks and tools', () => {
    const bad = recipe()
    bad.steps[0] = {
      ...bad.steps[0]!,
      kind: 'tool',
      toolId: 'mystery-tool',
      checks: [{ name: 'vibes_ok' }]
    }
    const errors = validateRecipe(bad)
    expect(errors).toHaveLength(2)
  })

  it('requires the saltbreak application scope', () => {
    const bad = { ...recipe(), allowedApplications: ['elsewhere'] }
    expect(validateRecipe(bad).join(' ')).toContain('saltbreak')
  })
})
