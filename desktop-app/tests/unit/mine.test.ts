import { describe, expect, it } from 'vitest'
import { mineRecording, suggestionIdFor } from '../../src/main/suggest/mine'
import type { Recording, RecordingEvent } from '../../src/shared/schemas'

const FIXED_NOW = '2026-10-31T12:00:00.000Z'

function event(sequence: number, partial: Partial<RecordingEvent> & { type: RecordingEvent['type'] }): RecordingEvent {
  return { sequence, atMs: sequence * 1000, ...partial }
}

function recording(events: RecordingEvent[], extra: Record<string, unknown> = {}): Recording {
  return {
    id: 'rec-1',
    goal: 'Resolve a support ticket',
    applicationScope: 'saltbreak',
    startedAt: FIXED_NOW,
    events,
    notes: [],
    ...extra
  } as Recording
}

describe('suggestion miner', () => {
  it('returns no suggestions for an empty recording', () => {
    expect(mineRecording(recording([]), { now: () => FIXED_NOW })).toEqual([])
  })

  it('suggests parameterizing a repeated record identity', () => {
    const rows = mineRecording(
      recording([
        event(0, { type: 'click', selector: '[data-semid="ticket-row"]', recordIdentity: 'T-101' }),
        event(1, { type: 'click', selector: '[data-semid="ticket-resolve"]', recordIdentity: 'T-101' })
      ]),
      { now: () => FIXED_NOW }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toContain('T-101')
    expect(rows[0]!.title.toLowerCase()).toContain('parameterize')
    expect(rows[0]!.why).toContain('#0')
    expect(rows[0]!.why).toContain('#1')
    expect(rows[0]!.evidence.selectors).toContain('[data-semid="ticket-row"]')
    expect(rows[0]!.evidence.sourceRecordingId).toBe('rec-1')
    expect(rows[0]!.siteId).toBe('saltbreak')
    expect(rows[0]!.status).toBe('new')
  })

  it('ignores a record identity seen only once', () => {
    const rows = mineRecording(
      recording([
        event(0, { type: 'click', selector: '[data-semid="a"]', recordIdentity: 'T-101' }),
        event(1, { type: 'click', selector: '[data-semid="b"]' })
      ]),
      { now: () => FIXED_NOW }
    )
    expect(rows.filter((r) => r.title.includes('T-101'))).toHaveLength(0)
  })

  it('suggests automating fills followed by a submit', () => {
    const rows = mineRecording(
      recording([
        event(0, { type: 'input_commit', selector: '[data-semid="name"]', value: 'Ada' }),
        event(1, { type: 'select', selector: '[data-semid="plan"]', value: 'pro' }),
        event(2, { type: 'submit', selector: '[data-semid="form"]' })
      ]),
      { now: () => FIXED_NOW }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title.toLowerCase()).toContain('automat')
    expect(rows[0]!.why).toContain('#0')
    expect(rows[0]!.why).toContain('#2')
    expect(rows[0]!.evidence.selectors).toContain('[data-semid="name"]')
  })

  it('does not suggest a submission without both fills and a submit', () => {
    const fillsOnly = mineRecording(
      recording([event(0, { type: 'input_commit', selector: '[data-semid="name"]', value: 'Ada' })]),
      { now: () => FIXED_NOW }
    )
    expect(fillsOnly).toHaveLength(0)
    const submitOnly = mineRecording(
      recording([event(0, { type: 'submit', selector: '[data-semid="form"]' })]),
      { now: () => FIXED_NOW }
    )
    expect(submitOnly).toHaveLength(0)
  })

  it('suggests a macro for a click chain of three or more', () => {
    const rows = mineRecording(
      recording([
        event(0, { type: 'click', selector: '[data-semid="a"]', targetLabel: 'Inbox' }),
        event(1, { type: 'click', selector: '[data-semid="b"]', targetLabel: 'Ticket' }),
        event(2, { type: 'click', selector: '[data-semid="c"]', targetLabel: 'Resolve' })
      ]),
      { now: () => FIXED_NOW }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title.toLowerCase()).toContain('macro')
    expect(rows[0]!.why).toContain('#2')
    expect(rows[0]!.evidence.selectors).toHaveLength(3)
  })

  it('does not suggest a macro for two clicks', () => {
    const rows = mineRecording(
      recording([
        event(0, { type: 'click', selector: '[data-semid="a"]' }),
        event(1, { type: 'click', selector: '[data-semid="b"]' })
      ]),
      { now: () => FIXED_NOW }
    )
    expect(rows).toHaveLength(0)
  })

  it('suggests resolving open items from recording unresolved entries', () => {
    const rows = mineRecording(
      recording([], { unresolved: ['Pick a run mode for the review step', 'Bind the ticket input'] }),
      { now: () => FIXED_NOW }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toContain('2 open items')
    expect(rows[0]!.why).toContain('Pick a run mode')
  })

  it('accepts unresolved items via options as well', () => {
    const rows = mineRecording(recording([]), {
      now: () => FIXED_NOW,
      unresolved: ['One open item']
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toContain('1 open item')
  })

  it('collects touched pages into evidence', () => {
    const rows = mineRecording(
      recording([
        event(0, { type: 'navigate', value: '/inbox' }),
        event(1, { type: 'click', selector: '[data-semid="a"]' }),
        event(2, { type: 'click', selector: '[data-semid="b"]' }),
        event(3, { type: 'click', selector: '[data-semid="c"]' })
      ]),
      { now: () => FIXED_NOW }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.evidence.pages).toEqual(['/inbox'])
  })

  it('redacts long demonstrated values to their first 40 characters', () => {
    const longValue = 'x'.repeat(200)
    const rows = mineRecording(
      recording([
        event(0, { type: 'input_commit', selector: '[data-semid="notes"]', value: longValue }),
        event(1, { type: 'submit', selector: '[data-semid="form"]' })
      ]),
      { now: () => FIXED_NOW }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.why).toContain('x'.repeat(40))
    expect(rows[0]!.why).not.toContain(longValue)
  })

  it('produces stable ids across runs so refinish never duplicates', () => {
    const rec = recording([
      event(0, { type: 'click', selector: '[data-semid="a"]' }),
      event(1, { type: 'click', selector: '[data-semid="b"]' }),
      event(2, { type: 'click', selector: '[data-semid="c"]' })
    ])
    const first = mineRecording(rec, { now: () => FIXED_NOW })
    const second = mineRecording(rec, { now: () => '2027-01-01T00:00:00.000Z' })
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(second[0]!.id).toBe(first[0]!.id)
    expect(second[0]!.createdAt).not.toBe(first[0]!.createdAt)
  })

  it('derives the id from site, title, and evidence', () => {
    const evidence = { pages: ['/inbox'], selectors: ['[data-semid="a"]'], sourceRecordingId: 'rec-1' }
    expect(suggestionIdFor('saltbreak', 'Title', evidence)).toBe(
      suggestionIdFor('saltbreak', 'Title', { ...evidence })
    )
    expect(suggestionIdFor('other', 'Title', evidence)).not.toBe(
      suggestionIdFor('saltbreak', 'Title', evidence)
    )
    expect(suggestionIdFor('saltbreak', 'Other', evidence)).not.toBe(
      suggestionIdFor('saltbreak', 'Title', evidence)
    )
  })
})
