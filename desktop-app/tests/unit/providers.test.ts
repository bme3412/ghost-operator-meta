import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveProviderId } from '../../src/main/providers/index'
import { eventSummary, META_SYSTEM_PROMPT } from '../../src/main/providers/meta'
import { KNOWN_CHECKS } from '../../src/shared/policy/checks'
import type { Recording } from '../../src/shared/schemas'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Isolated env carrying exactly the given keys (no ambient leakage). */
function cleanEnv(patch: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...patch } as NodeJS.ProcessEnv
}

const NOW = Date.parse('2026-10-31T12:00:00.000Z')

function recordingWith(events: Recording['events']): Recording {
  return {
    id: 'rec-summary',
    goal: 'Do something on a general site',
    applicationScope: 'example-com',
    startedAt: new Date(NOW).toISOString(),
    events,
    notes: []
  }
}

describe('provider routing default', () => {
  it('prefers meta when a model key is set', () => {
    expect(resolveProviderId(cleanEnv({ MODEL_API_KEY: 'sk-test' }))).toBe('meta')
  })

  it('falls back to fixture without a model key', () => {
    expect(resolveProviderId(cleanEnv({}))).toBe('fixture')
  })

  it('treats a blank model key as unset', () => {
    expect(resolveProviderId(cleanEnv({ MODEL_API_KEY: '' }))).toBe('fixture')
    expect(resolveProviderId(cleanEnv({ MODEL_API_KEY: '   ' }))).toBe('fixture')
  })

  it('respects an explicit GHOST_PROVIDER=meta without a key', () => {
    expect(resolveProviderId(cleanEnv({ GHOST_PROVIDER: 'meta' }))).toBe('meta')
  })

  it('respects an explicit GHOST_PROVIDER=fixture even with a key', () => {
    expect(
      resolveProviderId(cleanEnv({ GHOST_PROVIDER: 'fixture', MODEL_API_KEY: 'sk-test' }))
    ).toBe('fixture')
  })

  it('ignores an unknown GHOST_PROVIDER value and routes by key', () => {
    expect(resolveProviderId(cleanEnv({ GHOST_PROVIDER: 'bogus' }))).toBe('fixture')
    expect(
      resolveProviderId(cleanEnv({ GHOST_PROVIDER: 'bogus', MODEL_API_KEY: 'sk-test' }))
    ).toBe('meta')
  })
})

describe('meta prompt generality guard', () => {
  const forbidden = ['saltbreak', 'T-101', 'ticketId']

  it('exports a prompt with no site-specific tokens', () => {
    const lowered = META_SYSTEM_PROMPT.toLowerCase()
    expect(lowered).not.toContain('saltbreak')
    expect(META_SYSTEM_PROMPT).not.toContain('T-101')
    expect(META_SYSTEM_PROMPT).not.toContain('ticketId')
  })

  it('keeps the meta prompt module free of site-specific tokens', () => {
    const source = readFileSync(join(HERE, '../../src/main/providers/meta.ts'), 'utf8')
    expect(source.toLowerCase()).not.toContain('saltbreak')
    for (const token of ['T-101', 'ticketId']) {
      expect(source).not.toContain(token)
    }
    expect(forbidden).toHaveLength(3)
  })

  it('maps navigate events to goto steps', () => {
    expect(META_SYSTEM_PROMPT).toContain('navigate')
    expect(META_SYSTEM_PROMPT).toContain('"goto"')
    expect(META_SYSTEM_PROMPT).toContain('prefer one goto step')
  })

  it('offers end-page hooks for the closing verify step', () => {
    expect(META_SYSTEM_PROMPT).toContain('end_page')
    expect(META_SYSTEM_PROMPT).toContain('target_visible')
  })

  it('keeps the output-shape and action/check rules', () => {
    for (const anchor of [
      'allowedApplications',
      'computer_task',
      'click|fill|submit|goto',
      '{{inputs',
      'unresolved',
      'review'
    ]) {
      expect(META_SYSTEM_PROMPT).toContain(anchor)
    }
    for (const check of KNOWN_CHECKS) {
      expect(META_SYSTEM_PROMPT).toContain(check)
    }
  })
})

describe('meta event summary', () => {
  it('includes capped selector candidates and accessible descriptors', () => {
    const summary = eventSummary(
      recordingWith([
        {
          sequence: 0,
          type: 'click',
          semanticId: 'buy-now',
          selector: '[data-semid="buy-now"]',
          selectorCandidates: [
            '[data-semid="buy-now"]',
            '#buy-now',
            '[data-testid="buy"]',
            '[name="buy"]',
            'main > div:nth-of-type(2) > button:nth-of-type(1)',
            'body button:nth-of-type(9)'
          ],
          accessibleRole: 'button',
          accessibleLabel: 'Buy now',
          targetLabel: 'Buy now',
          atMs: NOW
        }
      ])
    )
    const line = JSON.parse(summary) as Record<string, unknown>
    expect(line['candidates']).toEqual([
      '[data-semid="buy-now"]',
      '#buy-now',
      '[data-testid="buy"]',
      '[name="buy"]'
    ])
    expect(line['accessible']).toBe('button "Buy now"')
    expect(line['selector']).toBe('[data-semid="buy-now"]')
  })

  it('passes a navigate path to the model as the goto value', () => {
    const summary = eventSummary(
      recordingWith([
        {
          sequence: 0,
          type: 'click',
          selectorCandidates: ['div:nth-of-type(1) > a:nth-of-type(1)'],
          targetLabel: 'View all 8 →',
          atMs: NOW
        },
        { sequence: 1, type: 'navigate', value: '/shop', atMs: NOW + 500 }
      ])
    )
    const lines = summary.split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines[1]).toMatchObject({ seq: 1, type: 'navigate', value: '/shop' })
  })

  it('appends ending-page hooks when the recording carries them', () => {
    const recording = recordingWith([{ sequence: 0, type: 'navigate', value: '/shop', atMs: NOW }])
    recording.endPage = { path: '/shop', hooks: ['[data-semid="shop-product-list"]'] }
    const lines = eventSummary(recording)
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines.at(-1)).toEqual({
      type: 'end_page',
      path: '/shop',
      hooks: ['[data-semid="shop-product-list"]']
    })
  })

  it('omits candidates and descriptors when the event carries none', () => {
    const summary = eventSummary(
      recordingWith([{ sequence: 0, type: 'navigate', value: '/', atMs: NOW }])
    )
    const line = JSON.parse(summary) as Record<string, unknown>
    expect(line['candidates']).toEqual([])
    expect(line['accessible']).toBeNull()
    expect(line['seq']).toBe(0)
    expect(line['type']).toBe('navigate')
  })

  it('renders one JSON line per event with legacy fields intact', () => {
    const summary = eventSummary(
      recordingWith([
        { sequence: 0, type: 'navigate', value: '/', atMs: NOW },
        {
          sequence: 1,
          type: 'click',
          semanticId: 'ok',
          selector: '[data-semid="ok"]',
          targetLabel: 'OK',
          recordIdentity: 'R-7',
          atMs: NOW + 1_000
        }
      ])
    )
    const lines = summary.split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatchObject({
      seq: 1,
      type: 'click',
      semid: 'ok',
      selector: '[data-semid="ok"]',
      label: 'OK',
      value: null,
      record: 'R-7'
    })
  })
})
