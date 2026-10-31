import { describe, expect, it } from 'vitest'
import { evaluateCheck, resolvePlaceholders } from '../../src/main/runner/checks'
import { createRunner, type Runner } from '../../src/main/runner/index'
import type { RunProgress, RunRecord, SkillRecipe } from '../../src/shared/schemas'

const NOW = Date.parse('2026-10-31T12:00:00.000Z')

function recipe(): SkillRecipe {
  return {
    schemaVersion: 1,
    id: 'resolve-support-ticket',
    version: 1,
    goal: 'Resolve a support ticket',
    inputSchemaRef: 'TargetProcedureInput',
    steps: [
      {
        id: 'goto-inbox',
        kind: 'computer_task',
        applicationId: 'saltbreak',
        goal: 'Open the inbox.',
        bindings: { action: 'goto', value: '/staff/inbox' },
        dataRefs: [],
        checks: []
      },
      {
        id: 'click-ticket-resolve',
        kind: 'computer_task',
        applicationId: 'saltbreak',
        goal: 'Click resolve.',
        bindings: { action: 'click', selector: '[data-semid="ticket-resolve-{{inputs.ticketId}}"]' },
        dataRefs: [],
        checks: []
      },
      {
        id: 'verify-ticket-resolved',
        kind: 'verify',
        goal: 'Verify the ticket shows as resolved.',
        bindings: {},
        dataRefs: [],
        checks: [
          {
            name: 'text_contains',
            selector: '[data-semid="ticket-status-{{inputs.ticketId}}"]',
            expected: 'resolved'
          }
        ]
      }
    ],
    allowedApplications: ['saltbreak'],
    allowedTools: []
  }
}

/** In-memory pseudo-DOM with just enough behavior for the ticket flow. */
function harness() {
  const texts: Record<string, string> = {
    '[data-semid="ticket-status-T-101"]': 'open',
    '[data-semid="ticket-status-T-102"]': 'pending'
  }
  const present = new Set([
    '[data-semid="nav-staff"]',
    '[data-semid="ticket-resolve-T-101"]',
    '[data-semid="ticket-resolve-T-102"]',
    '[data-semid="ticket-status-T-101"]',
    '[data-semid="ticket-status-T-102"]'
  ])
  let path = '/'
  const persisted: RunRecord[] = []
  const pushes: Array<RunProgress | null> = []
  const highlights: Array<string | null> = []
  const runner = createRunner({
    now: () => NOW,
    tick: () => Promise.resolve(),
    getSkillVersion: (skillId) =>
      skillId === 'resolve-support-ticket'
        ? { skillName: 'Resolve support ticket', recipe: recipe() }
        : null,
    domQuery: {
      visible: async (selector) => present.has(selector),
      text: async (selector) => texts[selector] ?? null,
      value: async () => null
    },
    domAct: {
      click: async (selector) => {
        if (!present.has(selector)) throw new Error(`missing ${selector}`)
        const match = /^\[data-semid="ticket-resolve-(.+)"\]$/.exec(selector)
        if (match) {
          texts[`[data-semid="ticket-status-${match[1]}"]`] = 'resolved'
        }
      },
      fill: async () => {
        throw new Error('no inputs in this flow')
      },
      submit: async () => undefined,
      goto: async (next) => {
        path = next
      }
    },
    persistRun: (record) => {
      const index = persisted.findIndex((r) => r.id === record.id)
      if (index >= 0) persisted[index] = structuredClone(record)
      else persisted.push(structuredClone(record))
    },
    onProgress: (progress) => {
      pushes.push(progress)
    },
    highlight: (selector) => {
      highlights.push(selector)
    }
  })
  return {
    runner,
    persisted,
    pushes,
    highlights,
    texts,
    currentPath: () => path
  }
}

async function settle(runner: Runner): Promise<RunProgress> {
  for (let i = 0; i < 100; i++) {
    const progress = runner.getProgress()
    if (
      progress &&
      (progress.status === 'succeeded' ||
        progress.status === 'failed' ||
        progress.status === 'cancelled')
    ) {
      return progress
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Run did not settle.')
}

const INPUTS = { ticketId: 'T-102' }

describe('runner', () => {
  it('runs assisted end to end with passing checks', async () => {
    const { runner, texts, currentPath } = harness()
    const first = runner.startRun({ skillId: 'resolve-support-ticket', mode: 'assisted', inputs: INPUTS })
    const done = await settle(runner)
    expect(first.status).toBe('running')
    expect(done.status).toBe('succeeded')
    expect(done.checks).toHaveLength(1)
    expect(done.checks[0]?.passed).toBe(true)
    expect(texts['[data-semid="ticket-status-T-102"]']).toBe('resolved')
    expect(currentPath()).toBe('/staff/inbox')
    expect(done.current).toBeNull()
  })

  it('fails honestly when the target element is missing', async () => {
    const { runner } = harness()
    runner.startRun({
      skillId: 'resolve-support-ticket',
      mode: 'assisted',
      inputs: { ticketId: 'T-999' }
    })
    const done = await settle(runner)
    expect(done.status).toBe('failed')
    expect(done.error).toContain('missing')
  })

  it('guides step by step with user confirmation', async () => {
    const { runner, texts } = harness()
    const first = runner.startRun({ skillId: 'resolve-support-ticket', mode: 'guide', inputs: INPUTS })
    expect(first.current?.id).toBe('goto-inbox')
    await runner.advanceRun(first.runId)
    // The user resolves the ticket in the target window; simulate the effect.
    texts['[data-semid="ticket-status-T-102"]'] = 'resolved'
    const second = await runner.advanceRun(first.runId)
    expect(second.current?.id).toBe('verify-ticket-resolved')
    const done = await runner.advanceRun(first.runId)
    expect(done.status).toBe('succeeded')
  })

  it('fails a guided run when checks do not pass', async () => {
    const { runner } = harness()
    const first = runner.startRun({ skillId: 'resolve-support-ticket', mode: 'guide', inputs: INPUTS })
    await runner.advanceRun(first.runId)
    await runner.advanceRun(first.runId)
    const done = await runner.advanceRun(first.runId)
    expect(done.status).toBe('failed')
    expect(done.error).toContain('text_contains')
  })

  it('pauses, resumes, and stops', () => {
    const { runner } = harness()
    const first = runner.startRun({ skillId: 'resolve-support-ticket', mode: 'guide', inputs: INPUTS })
    expect(runner.pauseRun(first.runId).status).toBe('paused')
    expect(runner.resumeRun(first.runId).status).toBe('running')
    expect(runner.stopRun(first.runId).status).toBe('cancelled')
  })

  it('rejects a second concurrent run and unknown skills', () => {
    const { runner } = harness()
    const first = runner.startRun({ skillId: 'resolve-support-ticket', mode: 'guide', inputs: INPUTS })
    expect(() =>
      runner.startRun({ skillId: 'resolve-support-ticket', mode: 'guide', inputs: INPUTS })
    ).toThrow()
    runner.stopRun(first.runId)
    expect(() => runner.startRun({ skillId: 'nope', mode: 'guide', inputs: INPUTS })).toThrow()
  })

  it('emits no highlight for steps without selectors', () => {
    const { runner, highlights } = harness()
    runner.startRun({ skillId: 'resolve-support-ticket', mode: 'guide', inputs: INPUTS })
    expect(highlights[0]).toBeNull()
  })
})

describe('placeholders', () => {
  it('resolves {{inputs.x}} and {{x}} forms', () => {
    expect(resolvePlaceholders('[data-semid="t-{{inputs.ticketId}}"]', INPUTS)).toBe(
      '[data-semid="t-T-102"]'
    )
    expect(resolvePlaceholders('[data-semid="t-{{ticketId}}"]', INPUTS)).toBe(
      '[data-semid="t-T-102"]'
    )
    expect(() => resolvePlaceholders('{{inputs.missing}}', INPUTS)).toThrow('Missing run input')
  })
})

describe('check validators', () => {
  function ctx(texts: Record<string, string>) {
    return {
      inputs: INPUTS,
      nowMs: NOW,
      dom: {
        visible: async (selector: string) => selector in texts,
        text: async (selector: string) => texts[selector] ?? null,
        value: async (_selector: string) => null as string | null
      }
    }
  }

  it('detects visible targets', async () => {
    const found = await evaluateCheck({ name: 'target_visible', selector: '[data-semid="a"]' }, ctx({ '[data-semid="a"]': 'x' }))
    expect(found.passed).toBe(true)
    const missing = await evaluateCheck({ name: 'target_visible', selector: '[data-semid="b"]' }, ctx({}))
    expect(missing.passed).toBe(false)
  })

  it('matches text with resolved placeholders', async () => {
    const passed = await evaluateCheck(
      {
        name: 'text_contains',
        selector: '[data-semid="ticket-status-{{inputs.ticketId}}"]',
        expected: 'resolved'
      },
      ctx({ '[data-semid="ticket-status-T-102"]': 'resolved · T-102' })
    )
    expect(passed.passed).toBe(true)
    const failed = await evaluateCheck(
      {
        name: 'text_contains',
        selector: '[data-semid="ticket-status-{{inputs.ticketId}}"]',
        expected: 'resolved'
      },
      ctx({ '[data-semid="ticket-status-T-102"]': 'pending' })
    )
    expect(failed.passed).toBe(false)
  })

  it('rejects unknown checks and malformed refs', async () => {
    await expect(evaluateCheck({ name: 'nope' }, ctx({}))).rejects.toThrow('Unknown check')
    const malformed = await evaluateCheck({ name: 'text_contains' }, ctx({}))
    expect(malformed.passed).toBe(false)
  })
})
