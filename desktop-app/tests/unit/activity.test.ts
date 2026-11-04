import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildOpportunities,
  classifyTicketText,
  type SkillCoverage
} from '../../src/main/activity/engine'
import {
  getActivityFeed,
  refreshActivity,
  setActivityFetcher,
  skillCoverage
} from '../../src/main/activity/service'
import { seedStarterSkills } from '../../src/main/skills/index'
import { loadState, resetStoreCache, saveState } from '../../src/main/store/index'
import type { StoredActivityEvent } from '../../src/shared/schemas'

function opened(id: number, ticketId: string, subject: string, status = 'open'): StoredActivityEvent {
  return {
    id,
    type: 'ticket_opened',
    entity: 'ticket',
    entityId: ticketId,
    subject,
    status,
    resolution: null,
    at: '2026-10-30T00:00:00.000Z'
  }
}

const PILE: StoredActivityEvent[] = [
  opened(1, 'T-202', 'Rash guard is too small'),
  opened(2, 'T-203', 'Fin box cracked on arrival'),
  opened(3, 'T-204', 'Leash is too short for my board'),
  opened(4, 'T-205', 'Delaminating right out of the box'),
  opened(5, 'T-206', 'Funboard too big for my son'),
  opened(6, 'T-207', 'Disputing paddle charge with my bank'),
  opened(7, 'T-208', 'Towel arrived torn')
]

const COVERAGE: SkillCoverage[] = [
  {
    skillId: 'handle-after-hours-support-tickets',
    skillName: 'Handle after-hours support tickets',
    rulesByCategory: {
      damaged: 'Damaged in shipping means refund.',
      'wrong-size': 'Wrong size means exchange.'
    }
  }
]

describe('classifyTicketText', () => {
  it('classifies the demo categories', () => {
    expect(classifyTicketText('Board arrived with a ding in the rail')).toBe('damaged')
    expect(classifyTicketText('Rash guard is too small')).toBe('wrong-size')
    expect(classifyTicketText('I filed a chargeback with my bank')).toBe('chargeback')
    expect(classifyTicketText('Where is my order?')).toBe('other')
  })
})

describe('buildOpportunities', () => {
  it('clusters the pile: covered categories ready, chargeback needs you', () => {
    const { needsYou, ready } = buildOpportunities(PILE, COVERAGE, [])
    expect(ready.map((o) => o.category).sort()).toEqual(['damaged', 'wrong-size'])
    expect(ready.find((o) => o.category === 'damaged')?.caseIds).toEqual(['T-203', 'T-205', 'T-208'])
    expect(ready.find((o) => o.category === 'wrong-size')?.caseIds).toEqual([
      'T-202',
      'T-204',
      'T-206'
    ])
    expect(needsYou).toHaveLength(1)
    expect(needsYou[0]?.category).toBe('chargeback')
    expect(needsYou[0]?.caseIds).toEqual(['T-207'])
  })

  it('cites resolved precedent over the bare rule', () => {
    const events: StoredActivityEvent[] = [
      ...PILE,
      {
        id: 8,
        type: 'ticket_resolved',
        entity: 'ticket',
        entityId: 'T-201',
        subject: 'Board arrived with a ding in the rail',
        resolution: 'refund',
        at: '2026-10-30T01:00:00.000Z'
      }
    ]
    const { ready } = buildOpportunities(events, COVERAGE, [])
    expect(ready.find((o) => o.category === 'damaged')?.because).toContain('T-201')
  })

  it('excludes tickets closed by a later resolved event even with a stale snapshot', () => {
    const events: StoredActivityEvent[] = [
      ...PILE,
      {
        id: 8,
        type: 'ticket_resolved',
        entity: 'ticket',
        entityId: 'T-208',
        subject: 'Towel arrived torn',
        resolution: 'refund',
        at: '2026-10-30T01:00:00.000Z'
      }
    ]
    const { ready } = buildOpportunities(events, COVERAGE, [])
    expect(ready.find((o) => o.category === 'damaged')?.caseIds).toEqual(['T-203', 'T-205'])
  })

  it('excludes tickets that are no longer open', () => {
    const events = PILE.map((event) =>
      event.entityId === 'T-208' ? { ...event, status: 'resolved' } : event
    )
    const { ready } = buildOpportunities(events, COVERAGE, [])
    expect(ready.find((o) => o.category === 'damaged')?.caseIds).toEqual(['T-203', 'T-205'])
  })

  it('carries customer, summary, amount, rule, and proposed action per case', () => {
    const events: StoredActivityEvent[] = [
      {
        ...opened(1, 'T-301', 'Board cracked in the mail'),
        customer: 'Maya Chen',
        amountCents: 12900
      },
      opened(2, 'T-302', 'Deck arrived torn')
    ]
    const coverage: SkillCoverage[] = [
      {
        skillId: 'after-hours',
        skillName: 'Handle after-hours support tickets',
        rulesByCategory: {
          damaged: 'Damaged in shipping, reported within 7 days, means refund.'
        },
        actionsByCategory: { damaged: 'Refund' }
      }
    ]
    const { ready } = buildOpportunities(events, coverage, [])
    const damaged = ready.find((o) => o.category === 'damaged')
    // The conditional rule survives verbatim; it is not collapsed to a
    // bare "damage → refund" policy.
    expect(damaged?.ruleText).toBe('Damaged in shipping, reported within 7 days, means refund.')
    expect(damaged?.actionLabel).toBe('Refund')
    expect(damaged?.cases).toEqual([
      { id: 'T-301', customer: 'Maya Chen', summary: 'Board cracked in the mail', amountCents: 12900 },
      { id: 'T-302', summary: 'Deck arrived torn' }
    ])
    // Unavailable details stay absent so the UI can say so honestly.
    expect(damaged?.cases[1]?.customer).toBeUndefined()
    expect(damaged?.cases[1]?.amountCents).toBeUndefined()
  })

  it('suppresses a dismissed cluster until its membership changes', () => {
    const signature = 'damaged:T-203,T-205,T-208'
    const feedback = [{ signature, action: 'dismissed' as const, at: '2026-10-30T00:00:00.000Z' }]
    const first = buildOpportunities(PILE, COVERAGE, feedback)
    expect(first.ready.map((o) => o.category)).toEqual(['wrong-size'])
    const grown = buildOpportunities(
      [...PILE, opened(9, 'T-209', 'Wax melted and the board is damaged')],
      COVERAGE,
      feedback
    )
    expect(grown.ready.map((o) => o.category).sort()).toEqual(['damaged', 'wrong-size'])
  })
})

describe('activity service', () => {
  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(mkdtempSync(join(tmpdir(), 'ghost-activity-')), 'state.json')
    delete process.env.MODEL_API_KEY
    resetStoreCache()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
  })

  it('derives coverage from the seeded after-hours skill rules', () => {
    seedStarterSkills()
    const coverage = skillCoverage()
    const entry = coverage.find((row) => row.skillName === 'Handle after-hours support tickets')
    expect(entry?.rulesByCategory.damaged).toBe('Damaged in shipping means refund.')
    expect(entry?.rulesByCategory['wrong-size']).toBe('Wrong size means exchange.')
  })

  it('ingests events once, advances the cursor, and builds the feed', async () => {
    seedStarterSkills()
    const urls: string[] = []
    const payload = {
      events: PILE.map((event) => ({
        id: event.id,
        type: event.type,
        entity: event.entity,
        entityId: event.entityId,
        data: {},
        createdAt: event.at,
        ticket: {
          subject: event.subject ?? '',
          body: '',
          status: event.status ?? 'open',
          resolution: null
        }
      }))
    }
    setActivityFetcher((async (url: string) => {
      urls.push(String(url))
      return new Response(JSON.stringify(payload), { status: 200 })
    }) as typeof fetch)

    await refreshActivity()
    expect(loadState().activityCursor).toBe(7)
    await refreshActivity()
    expect(urls[1]).toContain('since=7')
    expect(loadState().activityEvents).toHaveLength(7)

    const feed = await getActivityFeed()
    expect(feed.ready.map((o) => o.category).sort()).toEqual(['damaged', 'wrong-size'])
    expect(feed.needsYou[0]?.caseIds).toEqual(['T-207'])
    expect(feed.recent.length).toBeGreaterThan(0)
  })
})
