import { describe, expect, it, vi } from 'vitest'
import { buildNtfyRequest, caseUrlFor, notifyBatchFinished } from '../../src/main/away/index'
import { renderAwayPage } from '../../src/main/away/page'
import {
  decideFixture,
  normalizeDecision,
  rulesFromNotes,
  type DecideRequest
} from '../../src/main/providers/decide'
import { AFTER_HOURS_RULES, compileFixture } from '../../src/main/providers/fixture'
import { CANNED_TRANSCRIPT, MAX_AUDIO_BYTES, transcribe } from '../../src/main/providers/transcribe'
import { batchHeadline, createBatchRunner, type BatchDeps } from '../../src/main/runner/batch'
import { isPermissionAllowed } from '../../src/main/windows/guards'
import { validateRecipe } from '../../src/shared/policy/recipe'
import type { BatchRecord, Recording, RunRecord, SkillRecipe, SkillStep } from '../../src/shared/schemas'
import { recipeInputKeys } from '../../src/shared/skills/inputs'

/** The after-hours pile, as seeded in Saltbreak. */
const PILE: Record<string, string> = {
  'T-201':
    'Opened the box this morning and there is a deep ding in the rail. Looks like it was damaged in shipping, the box was crushed on that corner.',
  'T-202': 'Ordered a medium but it is way too small across the shoulders. Can I swap it for a large?',
  'T-203':
    'The center fin box is cracked straight through. The packaging had a hole in it, so it must have been damaged in transit.',
  'T-204': 'The 6ft leash is the wrong size for my 9ft longboard. Can I exchange it for a 9ft leash?',
  'T-205':
    'The soft top is peeling and the deck is delaminating near the tail. The box looked like it had been dropped. Arrived damaged.',
  'T-206':
    'Bought this for my 9 year old and it is too big for him to carry or paddle. Could we exchange it for a smaller size?',
  'T-207':
    'I do not recognize this purchase. I have already filed a chargeback with my bank and they told me to contact you.',
  'T-208': 'The towel came torn along the fringe and the mailer was ripped open. Damaged in shipping.'
}

const EXPECTED: Record<string, string> = {
  'T-201': 'refund',
  'T-202': 'exchange',
  'T-203': 'refund',
  'T-204': 'exchange',
  'T-205': 'refund',
  'T-206': 'exchange',
  'T-207': 'escalate',
  'T-208': 'refund'
}

function request(text: string): DecideRequest {
  return { goal: 'Handle the ticket', rules: AFTER_HOURS_RULES, options: ['refund', 'exchange'], text }
}

describe('decide (fixture provider)', () => {
  it('handles the whole after-hours pile with the owner rules', () => {
    for (const [id, text] of Object.entries(PILE)) {
      expect({ id, choice: decideFixture(request(text)).choice }).toEqual({ id, choice: EXPECTED[id] })
    }
  })

  it('quotes the rule it applied', () => {
    const decision = decideFixture(request(PILE['T-201']!))
    expect(decision.rule).toBe('Damaged in shipping means refund.')
  })

  it('escalates the chargeback and says why', () => {
    const decision = decideFixture(request(PILE['T-207']!))
    expect(decision.rule).toBeNull()
    expect(decision.reason).toContain('chargeback')
  })

  it('escalates when no rule matches and when rules conflict', () => {
    expect(decideFixture(request('Do you ship to Canada?')).choice).toBe('escalate')
    expect(
      decideFixture(request('It arrived damaged in shipping and it is also the wrong size.')).choice
    ).toBe('escalate')
  })

  it('holds model output to the contract', () => {
    const req = request(PILE['T-201']!)
    expect(normalizeDecision('Refund', 'Damaged in shipping means refund.', 'ok', req)).toEqual({
      choice: 'refund',
      rule: 'Damaged in shipping means refund.',
      reason: 'ok'
    })
    expect(normalizeDecision('store-credit', null, 'x', req).choice).toBe('escalate')
    expect(normalizeDecision('refund', 'I made this rule up', 'x', req).choice).toBe('escalate')
    expect(normalizeDecision('escalate', null, 'unsure', req)).toEqual({
      choice: 'escalate',
      rule: null,
      reason: 'unsure'
    })
  })

  it('pulls rules out of spoken notes and leaves narration out', () => {
    const { rules, choices } = rulesFromNotes([
      'Damaged in shipping means refund. Wrong size means exchange. Anything else, ask me.',
      'Now I scroll down to the ticket.'
    ])
    expect(rules).toEqual(AFTER_HOURS_RULES)
    expect(choices).toEqual(['refund', 'exchange'])
  })
})

function decideStep(overrides: Partial<SkillStep> = {}): SkillStep {
  return {
    id: 'decide',
    kind: 'decide',
    applicationId: 'saltbreak',
    goal: 'Decide',
    bindings: { readSelector: '[data-semid="ticket-body-{{inputs.ticketId}}"]' },
    dataRefs: [],
    checks: [],
    rules: AFTER_HOURS_RULES,
    options: ['refund', 'exchange'],
    writes: 'resolution',
    ...overrides
  }
}

function recipeWith(steps: SkillStep[]): SkillRecipe {
  return {
    schemaVersion: 1,
    id: 'r',
    version: 1,
    goal: 'g',
    inputSchemaRef: 'TargetProcedureInput',
    steps,
    allowedApplications: ['saltbreak'],
    allowedTools: []
  }
}

const CLICK: SkillStep = {
  id: 'apply',
  kind: 'computer_task',
  applicationId: 'saltbreak',
  goal: 'Apply',
  bindings: { action: 'click', selector: '[data-semid="ticket-{{inputs.resolution}}-{{inputs.ticketId}}"]' },
  dataRefs: [],
  checks: []
}

describe('decide step validation', () => {
  it('accepts a complete decide step', () => {
    expect(validateRecipe(recipeWith([decideStep(), CLICK]))).toEqual([])
  })

  it('rejects missing pieces and a listed escalate option', () => {
    const errors = validateRecipe(
      recipeWith([decideStep({ bindings: {}, rules: [], options: ['refund', 'escalate'], writes: undefined })])
    )
    expect(errors.join('\n')).toMatch(/readSelector/)
    expect(errors.join('\n')).toMatch(/without rules/)
    expect(errors.join('\n')).toMatch(/"escalate" as an option/)
    expect(errors.join('\n')).toMatch(/"writes"/)
  })

  it('rejects writing an input an earlier step already uses', () => {
    const errors = validateRecipe(recipeWith([CLICK, decideStep()]))
    expect(errors.join('\n')).toMatch(/earlier step already uses it/)
  })

  it('does not ask the person for inputs Ghost decides', () => {
    expect(recipeInputKeys(recipeWith([decideStep(), CLICK]))).toEqual(['ticketId'])
  })
})

describe('fixture compiler with spoken rules', () => {
  const NOW = Date.parse('2026-10-31T12:00:00.000Z')
  const recording: Recording = {
    id: 'rec-vacation',
    goal: 'Handle after-hours support tickets',
    applicationScope: 'saltbreak',
    startedAt: new Date(NOW).toISOString(),
    endedAt: new Date(NOW + 60_000).toISOString(),
    notes: [
      {
        sequence: 1,
        text: 'Damaged in shipping means refund. Wrong size means exchange. Anything else, ask me.',
        atMs: NOW + 1_500
      }
    ],
    events: [
      { sequence: 0, type: 'navigate', value: '/staff/inbox', atMs: NOW },
      {
        sequence: 2,
        type: 'click',
        semanticId: 'ticket-refund-T-201',
        selector: '[data-semid="ticket-refund-T-201"]',
        targetLabel: 'Refund',
        recordIdentity: 'T-201',
        atMs: NOW + 3_000
      }
    ]
  }

  it('inserts a decide step before the demonstrated choice and parameterizes it', () => {
    const proposal = compileFixture(recording)
    const steps = proposal.recipe.steps
    const index = steps.findIndex((s) => s.kind === 'decide')
    expect(index).toBeGreaterThan(-1)
    const decide = steps[index]!
    expect(decide.rules).toEqual(AFTER_HOURS_RULES)
    expect(decide.options).toEqual(['refund', 'exchange'])
    expect(decide.writes).toBe('resolution')
    expect(decide.bindings.readSelector).toBe('[data-semid="ticket-body-{{inputs.ticketId}}"]')
    expect(steps[index + 1]?.bindings.selector).toBe(
      '[data-semid="ticket-{{inputs.resolution}}-{{inputs.ticketId}}"]'
    )
    expect(steps.some((s) => s.id === 'verify-ticket-resolved')).toBe(true)
    expect(validateRecipe(proposal.recipe)).toEqual([])
    expect(recipeInputKeys(proposal.recipe)).toEqual(['ticketId'])
  })
})

function batchOf(items: BatchRecord['items'], extra: Partial<BatchRecord> = {}): BatchRecord {
  return {
    id: 'batch-1',
    skillId: 'skill-1',
    skillName: 'Handle after-hours support tickets',
    inputKey: 'ticketId',
    sharedInputs: {},
    items,
    status: 'done',
    startedAt: '2026-10-31T12:00:00.000Z',
    ...extra
  }
}

function runRecord(runId: string, ticketId: string, choice: string): RunRecord {
  const escalated = choice === 'escalate'
  return {
    id: runId,
    skillId: 'skill-1',
    skillVersion: 1,
    mode: 'assisted',
    inputs: { ticketId },
    status: escalated ? 'escalated' : 'succeeded',
    startedAt: '2026-10-31T12:00:00.000Z',
    currentStepIndex: 0,
    attempts: [],
    checks: [],
    decisions: [
      {
        stepId: 'decide',
        choice,
        rule: escalated ? null : `rule for ${choice}`,
        reason: escalated ? 'Mentions a chargeback.' : 'Matched.',
        evidence: PILE[ticketId] ?? '',
        at: '2026-10-31T12:00:01.000Z'
      }
    ],
    awaitingApproval: false
  } as RunRecord
}

describe('batch runner', () => {
  it('keeps going past an escalation and reports every case once at the end', async () => {
    const started: string[] = []
    const persisted: BatchRecord[] = []
    const onFinished = vi.fn(async () => ({ notifiedAt: '2026-10-31T13:00:00.000Z' }))
    const deps: BatchDeps = {
      now: () => Date.parse('2026-10-31T12:00:00.000Z'),
      getSkillName: () => 'Handle after-hours support tickets',
      startRun: (request, { batch }) => {
        started.push(`${request.inputs?.['ticketId']}@${batch.index}/${batch.total}`)
        expect(request.mode).toBe('assisted')
        return { runId: `run-${request.inputs?.['ticketId']}` } as ReturnType<BatchDeps['startRun']>
      },
      waitForRunEnd: async (runId) => {
        const ticketId = runId.replace('run-', '')
        if (ticketId === 'T-203') throw new Error('unreachable')
        return runRecord(runId, ticketId, EXPECTED[ticketId]!)
      },
      stopRun: () => undefined,
      persist: (b) => persisted.push(b),
      onFinished
    }
    const runner = createBatchRunner(deps)
    const ids = Object.keys(PILE).filter((id) => id !== 'T-203')
    const batch = runner.start({ skillId: 'skill-1', inputKey: 'ticketId', caseIds: ids, sharedInputs: {} })
    expect(batch.items.every((i) => i.status === 'pending')).toBe(true)
    await runner.whenIdle()

    expect(started).toEqual(ids.map((id, index) => `${id}@${index}/${ids.length}`))
    const final = runner.getActive()!
    expect(final.status).toBe('done')
    expect(final.notifiedAt).toBe('2026-10-31T13:00:00.000Z')
    expect(onFinished).toHaveBeenCalledTimes(1)
    const t207 = final.items.find((i) => i.caseId === 'T-207')!
    expect(t207.status).toBe('escalated')
    expect(t207.evidence).toContain('chargeback')
    expect(final.items.filter((i) => i.status === 'succeeded')).toHaveLength(6)
    expect(batchHeadline(final)).toBe('Muse for SMB resolved 6 tickets. 1 needs your judgment.')
    expect(persisted.at(-1)).toEqual(final)
  })

  it('refuses an empty case list and a second concurrent batch', () => {
    let release: (r: RunRecord | null) => void = () => undefined
    const runner = createBatchRunner({
      now: () => 0,
      getSkillName: () => 'S',
      startRun: () => ({ runId: 'run-1' }) as ReturnType<BatchDeps['startRun']>,
      waitForRunEnd: () => new Promise((resolve) => (release = resolve)),
      stopRun: () => undefined,
      persist: () => undefined,
      onFinished: async () => ({})
    })
    expect(() => runner.start({ skillId: 's', inputKey: 'ticketId', caseIds: [' '], sharedInputs: {} })).toThrow(
      /at least one case/
    )
    runner.start({ skillId: 's', inputKey: 'ticketId', caseIds: ['T-1'], sharedInputs: {} })
    expect(() => runner.start({ skillId: 's', inputKey: 'ticketId', caseIds: ['T-2'], sharedInputs: {} })).toThrow(
      /already running/
    )
    release(null)
  })
})

const FINISHED = batchOf([
  { caseId: 'T-201', status: 'succeeded', choice: 'refund', rule: 'Damaged in shipping means refund.' },
  { caseId: 'T-202', status: 'succeeded', choice: 'exchange', rule: 'Wrong size means exchange.' },
  {
    caseId: 'T-207',
    status: 'escalated',
    reason: 'The case mentions "chargeback".',
    evidence: '<script>alert(1)</script> filed a chargeback'
  }
])

describe('phone notification', () => {
  it('puts the headline in the title and needs-you cases first', () => {
    const req = buildNtfyRequest(FINISHED, {
      server: 'https://ntfy.sh/',
      topic: 'maya-saltbreak',
      clickUrl: 'http://192.168.1.5:3200/away/batch-1?k=abc'
    })
    expect(req.url).toBe('https://ntfy.sh/maya-saltbreak')
    expect(req.headers).toMatchObject({
      Title: 'Muse for SMB resolved 2 tickets. 1 needs your judgment.',
      Click: 'http://192.168.1.5:3200/away/batch-1?k=abc',
      Priority: 'high'
    })
    expect(req.body.split('\n')).toEqual([
      'Needs you: T-207. The case mentions "chargeback".',
      'Refund: T-201',
      'Exchange: T-202'
    ])
  })

  it('reports a missing topic instead of failing silently', async () => {
    const fetchImpl = vi.fn()
    const result = await notifyBatchFinished(FINISHED, {}, fetchImpl as unknown as typeof fetch)
    expect(result.notifyError).toMatch(/NTFY_TOPIC/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts to ntfy when a topic is set', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }))
    const result = await notifyBatchFinished(
      FINISHED,
      { NTFY_TOPIC: 'maya', GHOST_AWAY_HOST: '10.0.0.2', GHOST_AWAY_SECRET: 's' },
      fetchImpl as unknown as typeof fetch
    )
    expect(result.notifiedAt).toBeDefined()
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ntfy.sh/maya')
    expect((init.headers as Record<string, string>)['Click']).toMatch(/^http:\/\/10\.0\.0\.2:3200\/away\/batch-1\?k=/)
  })

  it('rewrites localhost case links so the phone can open them', () => {
    expect(caseUrlFor('T-207', 'http://localhost:3000', '192.168.1.5')).toBe(
      'http://192.168.1.5:3000/staff/inbox#T-207'
    )
  })
})

describe('away page', () => {
  const html = renderAwayPage(FINISHED, { caseUrl: (id) => `http://192.168.1.5:3000/staff/inbox#${id}` })

  it('leads with the case that needs the owner', () => {
    expect(html).toContain('Muse for SMB resolved 2 tickets. 1 needs your judgment.')
    expect(html.indexOf('data-case="T-207"')).toBeLessThan(html.indexOf('data-case="T-201"'))
    expect(html).toContain('Open T-207')
  })

  it('quotes the owner rule for each handled case', () => {
    expect(html).toContain('Your rule: “Damaged in shipping means refund.”')
    expect(html).toContain('Your rule: “Wrong size means exchange.”')
  })

  it('escapes customer text', () => {
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

describe('voice notes', () => {
  const clip = new Uint8Array([1, 2, 3])

  it('returns the canned transcript without a key', async () => {
    const fetchImpl = vi.fn()
    await expect(transcribe(clip, 'audio/webm', {}, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      text: CANNED_TRANSCRIPT,
      source: 'canned'
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts the clip to the transcription endpoint', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ text: ' Wrong size means exchange. ' }))
    const result = await transcribe(
      clip,
      'audio/webm;codecs=opus',
      { TRANSCRIBE_API_KEY: 'k', TRANSCRIBE_BASE_URL: 'https://example.test/v1/' },
      fetchImpl as unknown as typeof fetch
    )
    expect(result).toEqual({ text: 'Wrong size means exchange.', source: 'live' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.test/v1/audio/transcriptions')
    const form = init.body as FormData
    expect(form.get('model')).toBe('whisper-1')
    expect((form.get('file') as File).name).toBe('note.webm')
  })

  it('rejects empty and oversized clips', async () => {
    await expect(transcribe(new Uint8Array(), 'audio/webm', {})).rejects.toThrow(/No audio/)
    await expect(transcribe(new Uint8Array(MAX_AUDIO_BYTES + 1), 'audio/webm', {})).rejects.toThrow(/too long/)
  })

  it('grants audio capture to the panel only', () => {
    const panel = new Set([7])
    expect(isPermissionAllowed(7, 'media', ['audio'], panel)).toBe(true)
    expect(isPermissionAllowed(7, 'media', ['audio', 'video'], panel)).toBe(false)
    expect(isPermissionAllowed(7, 'media', undefined, panel)).toBe(false)
    expect(isPermissionAllowed(7, 'geolocation', undefined, panel)).toBe(false)
    expect(isPermissionAllowed(3, 'media', ['audio'], panel)).toBe(false)
  })
})
