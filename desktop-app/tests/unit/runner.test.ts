import { describe, expect, it } from 'vitest'
import {
  evaluateCheck,
  resolvePlaceholders,
  resolveSelectorPlaceholders,
  type DomQuery
} from '../../src/main/runner/checks'
import { createRunner, type Runner } from '../../src/main/runner/index'
import {
  clickSnippet,
  fillSnippet,
  submitSnippet,
  textSnippet,
  valueSnippet,
  visibleSnippet
} from '../../src/main/runner/snippets'
import {
  selectorsForChecks,
  startPageLoadWait,
  waitForPageLoad,
  waitForStepChecks,
  type LoadEventSource
} from '../../src/main/runner/wait'
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
function harness(overrides?: {
  text?: (
    selector: string,
    base: (selector: string) => Promise<string | null>
  ) => Promise<string | null>
  checkWait?: { timeoutMs?: number; pollMs?: number }
}) {
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
  const sleepCalls: number[] = []
  const baseText = async (selector: string): Promise<string | null> =>
    texts[selector] ?? null
  const runner = createRunner({
    now: () => NOW,
    tick: () => Promise.resolve(),
    getScopeId: () => 'saltbreak',
    getSkillVersion: (skillId) =>
      skillId === 'resolve-support-ticket'
        ? { skillName: 'Resolve support ticket', recipe: recipe() }
        : null,
    domQuery: {
      visible: async (selector) => present.has(selector),
      text: overrides?.text ? (selector) => overrides.text!(selector, baseText) : baseText,
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
    },
    sleep: async (ms) => {
      sleepCalls.push(ms)
    },
    ...(overrides?.checkWait ? { checkWait: overrides.checkWait } : {})
  })
  return {
    runner,
    persisted,
    pushes,
    highlights,
    sleepCalls,
    texts,
    currentPath: () => path
  }
}

describe('runner control races', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  async function waitFor(cond: () => boolean): Promise<void> {
    for (let i = 0; i < 1000; i++) {
      if (cond()) return
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    throw new Error('Timed out waiting for condition.')
  }

  function controlledRunner(options: {
    click?: () => Promise<void>
    text?: (selector: string) => Promise<string | null>
  }): { runner: Runner; clicks: string[] } {
    const clicks: string[] = []
    const runner = createRunner({
      now: () => NOW,
      tick: () => Promise.resolve(),
      getScopeId: () => 'saltbreak',
      getSkillVersion: () => ({ skillName: 's', recipe: recipe() }),
      domQuery: {
        visible: async () => true,
        text: options.text ?? (async () => 'resolved'),
        value: async () => null
      },
      domAct: {
        click: async (selector) => {
          clicks.push(selector)
          await options.click?.()
        },
        fill: async () => undefined,
        submit: async () => undefined,
        goto: async () => undefined
      },
      persistRun: () => undefined,
      onProgress: () => undefined,
      highlight: () => undefined
    })
    return { runner, clicks }
  }

  it('keeps cancelled when stop lands during an in-flight step', async () => {
    const gate = deferred<void>()
    const { runner, clicks } = controlledRunner({ click: () => gate.promise })
    const first = runner.startRun({ skillId: 's', mode: 'assisted', inputs: INPUTS })
    await waitFor(() => clicks.length === 1)
    runner.stopRun(first.runId)
    gate.resolve()
    const done = await settle(runner)
    expect(done.status).toBe('cancelled')
    expect(done.current?.id).toBe('click-ticket-resolve')
  })

  it('executes the step once across a pause/resume race', async () => {
    const gate = deferred<void>()
    const { runner, clicks } = controlledRunner({ click: () => gate.promise })
    const first = runner.startRun({ skillId: 's', mode: 'assisted', inputs: INPUTS })
    await waitFor(() => clicks.length === 1)
    runner.pauseRun(first.runId)
    runner.resumeRun(first.runId)
    gate.resolve()
    const done = await settle(runner)
    expect(done.status).toBe('succeeded')
    expect(clicks).toHaveLength(1)
  })

  it('rejects a second advance while one is in flight', async () => {
    const gate = deferred<string | null>()
    const { runner } = controlledRunner({ text: () => gate.promise })
    const first = runner.startRun({ skillId: 's', mode: 'guide', inputs: INPUTS })
    await runner.advanceRun(first.runId)
    await runner.advanceRun(first.runId)
    const pending = runner.advanceRun(first.runId)
    await expect(runner.advanceRun(first.runId)).rejects.toThrow(/already in progress/)
    gate.resolve('resolved')
    const done = await pending
    expect(done.status).toBe('succeeded')
  })

  it('rejects retry while a loop is driving the run', async () => {
    const gate = deferred<void>()
    const { runner, clicks } = controlledRunner({ click: () => gate.promise })
    runner.startRun({ skillId: 's', mode: 'assisted', inputs: INPUTS })
    await waitFor(() => clicks.length === 1)
    const id = runner.getProgress()?.runId ?? ''
    await expect(runner.retryRun(id)).rejects.toThrow(/driving/)
    gate.resolve()
    const done = await settle(runner)
    expect(done.status).toBe('succeeded')
  })
})

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

describe('runner start gates', () => {
  function runnerWith(recipe: SkillRecipe, scopeId = 'saltbreak'): Runner {
    return createRunner({
      now: () => NOW,
      tick: () => Promise.resolve(),
      getScopeId: () => scopeId,
      getSkillVersion: () => ({ skillName: 's', recipe }),
      domQuery: { visible: async () => true, text: async () => null, value: async () => null },
      domAct: {
        click: async () => undefined,
        fill: async () => undefined,
        submit: async () => undefined,
        goto: async () => undefined
      },
      persistRun: () => undefined,
      onProgress: () => undefined,
      highlight: () => undefined
    })
  }

  it('refuses a recipe that does not allow the live scope', () => {
    const runner = runnerWith(recipe(), 'ebay-com')
    expect(() =>
      runner.startRun({ skillId: 's', mode: 'assisted', inputs: {} })
    ).toThrow(/ebay-com/)
    expect(runner.getProgress()).toBeNull()
  })

  it('refuses a recipe with an absolute-URL goto', () => {
    const bad = recipe()
    bad.steps[0]!.bindings = { action: 'goto', value: 'https://evil.example.com/' }
    const runner = runnerWith(bad)
    expect(() => runner.startRun({ skillId: 's', mode: 'assisted', inputs: {} })).toThrow(
      /absolute URL/
    )
  })

  it('refuses a verify step without checks', () => {
    const bad = recipe()
    bad.steps[2]!.checks = []
    const runner = runnerWith(bad)
    expect(() => runner.startRun({ skillId: 's', mode: 'guide', inputs: {} })).toThrow(
      /without checks/
    )
  })
})

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

  it('leaves ordinary values untouched in selector substitution', () => {
    expect(
      resolveSelectorPlaceholders('[data-semid="t-{{inputs.ticketId}}"]', INPUTS)
    ).toBe('[data-semid="t-T-102"]')
  })

  it('keeps hostile values inside the attribute selector', () => {
    const hostile = { ticketId: 'x"]} , body[data-x="' }
    const selector = resolveSelectorPlaceholders('[data-semid="t-{{inputs.ticketId}}"]', hostile)
    // The hostile quote is escaped, so it can't close the attribute early;
    // only the template's own closing quote remains.
    expect(selector).not.toContain('x"]')
    expect(selector).toContain('\\"')
    expect(selector.startsWith('[data-semid="t-')).toBe(true)
    expect(selector.endsWith('"]')).toBe(true)
    expect(() => resolveSelectorPlaceholders('{{inputs.missing}}', INPUTS)).toThrow(
      'Missing run input'
    )
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

describe('page snippets', () => {
  it('visible snippet probes real visibility, not presence', () => {
    const code = visibleSnippet('[data-semid="ticket-status-T-102"]')
    for (const marker of [
      'querySelector',
      'isConnected',
      'getBoundingClientRect',
      'getComputedStyle',
      'display',
      'visibility',
      'opacity'
    ]) {
      expect(code).toContain(marker)
    }
    expect(code).toContain('return true')
    expect(code).toContain('return false')
  })

  it('query snippets cap text and type-check values', () => {
    expect(textSnippet('[data-semid="a"]')).toContain('textContent')
    expect(textSnippet('[data-semid="a"]')).toContain('5000')
    expect(valueSnippet('[data-semid="a"]')).toContain('typeof v')
  })

  it('action snippets keep their behavior markers', () => {
    const click = clickSnippet('[data-semid="a"]')
    expect(click).toContain('scrollIntoView')
    expect(click).toContain('.click()')
    expect(click).toContain('missing')

    const fill = fillSnippet('[data-semid="a"]', 'hello')
    expect(fill).toContain("dispatchEvent(new Event('input'")
    expect(fill).toContain("dispatchEvent(new Event('change'")
    expect(fill).toContain('getOwnPropertyDescriptor')

    const submit = submitSnippet('[data-semid="a"]')
    expect(submit).toContain("closest('form')")
    expect(submit).toContain('requestSubmit')
  })

  it('escapes selectors and values so quotes cannot break snippets', () => {
    const evil = '[data-x="a\\"b\\\\c"]'
    const code = fillSnippet(evil, 'v"x')
    expect(code).toContain(JSON.stringify(evil))
    expect(code).toContain(JSON.stringify('v"x'))
    expect(clickSnippet(evil)).toContain(JSON.stringify(evil))
  })
})

describe('check waits', () => {
  function manualClock() {
    let nowMs = 1000
    const sleeps: number[] = []
    return {
      now: () => nowMs,
      sleep: async (ms: number) => {
        sleeps.push(ms)
        nowMs += ms
      },
      sleeps
    }
  }

  function stubDom(impl: Partial<DomQuery>): DomQuery {
    return {
      visible: async () => false,
      text: async () => null,
      value: async () => null,
      ...impl
    }
  }

  it('selectorsForChecks resolves placeholders and skips unresolvable entries', () => {
    expect(
      selectorsForChecks(
        [
          { name: 'text_contains', selector: '[data-semid="t-{{inputs.ticketId}}"]' },
          { name: 'target_visible' },
          { name: 'text_contains', selector: '[data-semid="t-{{inputs.missing}}"]' }
        ],
        INPUTS
      )
    ).toEqual(['[data-semid="t-T-102"]'])
  })

  it('returns immediately when checks are ready and when there are none', async () => {
    const clock = manualClock()
    const dom = stubDom({ text: async () => 'resolved' })
    const ready = await waitForStepChecks(
      [{ name: 'text_contains', selector: '[data-semid="a"]' }],
      INPUTS,
      dom,
      { timeoutMs: 5000, pollMs: 100, sleep: clock.sleep, now: clock.now }
    )
    expect(ready).toBe(true)
    expect(clock.sleeps).toHaveLength(0)

    const empty = await waitForStepChecks([], INPUTS, dom, {
      timeoutMs: 5000,
      pollMs: 100,
      sleep: clock.sleep,
      now: clock.now
    })
    expect(empty).toBe(true)
    expect(clock.sleeps).toHaveLength(0)
  })

  it('polls until check targets appear', async () => {
    const clock = manualClock()
    let calls = 0
    const dom = stubDom({
      text: async () => (++calls < 3 ? null : 'resolved')
    })
    const ready = await waitForStepChecks(
      [{ name: 'text_contains', selector: '[data-semid="a"]' }],
      INPUTS,
      dom,
      { timeoutMs: 5000, pollMs: 100, sleep: clock.sleep, now: clock.now }
    )
    expect(ready).toBe(true)
    expect(calls).toBe(3)
    expect(clock.sleeps).toEqual([100, 100])
  })

  it('gives up after a bounded timeout', async () => {
    const clock = manualClock()
    const dom = stubDom({})
    const ready = await waitForStepChecks(
      [{ name: 'text_contains', selector: '[data-semid="never"]' }],
      INPUTS,
      dom,
      { timeoutMs: 250, pollMs: 100, sleep: clock.sleep, now: clock.now }
    )
    expect(ready).toBe(false)
    const total = clock.sleeps.reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThanOrEqual(250)
    expect(total).toBeLessThan(500)
  })

  it('waits on visibility for target_visible checks', async () => {
    const clock = manualClock()
    let calls = 0
    const dom = stubDom({ visible: async () => ++calls >= 2 })
    const ready = await waitForStepChecks(
      [{ name: 'target_visible', selector: '[data-semid="a"]' }],
      INPUTS,
      dom,
      { timeoutMs: 5000, pollMs: 50, sleep: clock.sleep, now: clock.now }
    )
    expect(ready).toBe(true)
    expect(calls).toBe(2)
    expect(clock.sleeps).toEqual([50])
  })

  it('treats value_equals as ready when either value or text answers', async () => {
    const clock = manualClock()
    const byValue = await waitForStepChecks(
      [{ name: 'value_equals', selector: '[data-semid="a"]' }],
      INPUTS,
      stubDom({ value: async () => 'x' }),
      { timeoutMs: 100, pollMs: 10, sleep: clock.sleep, now: clock.now }
    )
    expect(byValue).toBe(true)
    const byText = await waitForStepChecks(
      [{ name: 'value_equals', selector: '[data-semid="a"]' }],
      INPUTS,
      stubDom({ text: async () => 'x' }),
      { timeoutMs: 100, pollMs: 10, sleep: clock.sleep, now: clock.now }
    )
    expect(byText).toBe(true)
  })

  it('succeeds an assisted run when a late check target appears during the wait', async () => {
    let calls = 0
    const { runner, sleepCalls } = harness({
      text: async (selector, base) => {
        if (selector === '[data-semid="ticket-status-T-102"]' && ++calls < 3) return null
        return base(selector)
      },
      checkWait: { timeoutMs: 2000, pollMs: 1 }
    })
    runner.startRun({ skillId: 'resolve-support-ticket', mode: 'assisted', inputs: INPUTS })
    const done = await settle(runner)
    expect(done.status).toBe('succeeded')
    expect(calls).toBeGreaterThanOrEqual(3)
    expect(sleepCalls.length).toBeGreaterThan(0)
  })

  it('fails honestly when a check target never appears', async () => {
    const { runner } = harness({
      text: async (selector, base) =>
        selector === '[data-semid="ticket-status-T-102"]' ? null : base(selector),
      checkWait: { timeoutMs: 30, pollMs: 1 }
    })
    runner.startRun({ skillId: 'resolve-support-ticket', mode: 'assisted', inputs: INPUTS })
    const done = await settle(runner)
    expect(done.status).toBe('failed')
    expect(done.error).toContain('text_contains')
  })
})

describe('page load waits', () => {
  function fakeLoadSource() {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    const source: LoadEventSource = {
      on: (event, listener) => {
        const set = listeners.get(event) ?? new Set()
        set.add(listener)
        listeners.set(event, set)
      },
      removeListener: (event, listener) => {
        listeners.get(event)?.delete(listener)
      }
    }
    return {
      source,
      emit: (event: 'did-finish-load' | 'did-fail-load', ...args: unknown[]) => {
        for (const listener of [...(listeners.get(event) ?? [])]) {
          ;(listener as (...callArgs: unknown[]) => void)(...args)
        }
      },
      count: (event: 'did-finish-load' | 'did-fail-load') => listeners.get(event)?.size ?? 0
    }
  }

  it('resolves on did-finish-load and detaches listeners', async () => {
    const fake = fakeLoadSource()
    const pending = waitForPageLoad(fake.source, { timeoutMs: 1000 })
    expect(fake.count('did-finish-load')).toBe(1)
    fake.emit('did-finish-load')
    await expect(pending).resolves.toBeUndefined()
    expect(fake.count('did-finish-load')).toBe(0)
    expect(fake.count('did-fail-load')).toBe(0)
  })

  it('rejects on main-frame did-fail-load', async () => {
    const fake = fakeLoadSource()
    const pending = waitForPageLoad(fake.source, { timeoutMs: 1000 })
    fake.emit('did-fail-load', {}, -105, 'Name not resolved', 'https://nope/', true)
    await expect(pending).rejects.toThrow('Navigation failed')
    expect(fake.count('did-finish-load')).toBe(0)
  })

  it('ignores subframe failures and aborted loads while waiting', async () => {
    const fake = fakeLoadSource()
    const pending = waitForPageLoad(fake.source, { timeoutMs: 1000 })
    fake.emit('did-fail-load', {}, -3, 'Aborted', 'https://x/', false)
    fake.emit('did-fail-load', {}, -3, 'Aborted', 'https://x/', true)
    fake.emit('did-finish-load')
    await expect(pending).resolves.toBeUndefined()
  })

  it('rejects on timeout', async () => {
    const fake = fakeLoadSource()
    await expect(waitForPageLoad(fake.source, { timeoutMs: 5 })).rejects.toThrow('timed out')
    expect(fake.count('did-finish-load')).toBe(0)
    expect(fake.count('did-fail-load')).toBe(0)
  })

  it('cancel detaches without settling', async () => {
    const fake = fakeLoadSource()
    const wait = startPageLoadWait(fake.source, { timeoutMs: 1000 })
    let settled = false
    void wait.promise.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    wait.cancel()
    fake.emit('did-finish-load')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(settled).toBe(false)
    expect(fake.count('did-finish-load')).toBe(0)
  })
})
