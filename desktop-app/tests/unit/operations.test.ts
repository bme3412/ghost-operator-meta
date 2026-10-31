import { describe, expect, it } from 'vitest'
import {
  attemptSelectorsForStep,
  executeComputerTask,
  type OperationDeps
} from '../../src/main/runner/operations'
import type { SkillStep } from '../../src/shared/schemas'

function step(bindings: Record<string, string>, selectorCandidates?: string[]): SkillStep {
  return {
    id: 'step-1',
    kind: 'computer_task',
    ...(selectorCandidates ? { selectorCandidates } : {}),
    bindings,
    dataRefs: [],
    checks: []
  }
}

/** DomAct that only matches selectors in `present`; records attempts. */
function fakeAct(present: string[]): { deps: OperationDeps; attempts: string[] } {
  const attempts: string[] = []
  return {
    attempts,
    deps: {
      act: {
        click: async (selector) => {
          attempts.push(`click ${selector}`)
          if (!present.includes(selector)) throw new Error(`missing ${selector}`)
        },
        fill: async (selector, value) => {
          attempts.push(`fill ${selector}=${value}`)
          if (!present.includes(selector)) throw new Error(`missing ${selector}`)
        },
        submit: async (selector) => {
          attempts.push(`submit ${selector}`)
          if (!present.includes(selector)) throw new Error(`missing ${selector}`)
        },
        goto: async () => undefined
      }
    }
  }
}

describe('attemptSelectorsForStep', () => {
  it('returns just the primary when no candidates are declared', () => {
    const selectors = attemptSelectorsForStep(
      step({ action: 'click', selector: '[data-semid="ticket-resolve-{{inputs.ticketId}}"]' }),
      { ticketId: 'T-102' }
    )
    expect(selectors).toEqual(['[data-semid="ticket-resolve-T-102"]'])
  })

  it('orders the primary before resolved fallbacks', () => {
    const selectors = attemptSelectorsForStep(
      step({ action: 'click', selector: '[data-semid="a-{{inputs.ticketId}}"]' }, [
        '[data-semid="a-{{inputs.ticketId}}"]',
        '#a-{{inputs.ticketId}}',
        'button:nth-of-type(1)'
      ]),
      { ticketId: 'T-102' }
    )
    expect(selectors).toEqual([
      '[data-semid="a-T-102"]',
      '#a-T-102',
      'button:nth-of-type(1)'
    ])
  })

  it('skips candidates that name a missing input', () => {
    const selectors = attemptSelectorsForStep(
      step({ action: 'click', selector: '[data-semid="a"]' }, [
        '[data-semid="{{inputs.missing}}"]',
        '#a'
      ]),
      {}
    )
    expect(selectors).toEqual(['[data-semid="a"]', '#a'])
  })
})

describe('executeComputerTask fallback', () => {
  it('clicks the primary with the legacy action string when it matches', async () => {
    const { deps, attempts } = fakeAct(['[data-semid="a"]'])
    const outcome = await executeComputerTask(
      step({ action: 'click', selector: '[data-semid="a"]' }, ['[data-semid="a"]', '#a']),
      {},
      deps
    )
    expect(outcome.actions).toEqual(['clicked [data-semid="a"]'])
    expect(outcome.highlight).toBe('[data-semid="a"]')
    expect(attempts).toEqual(['click [data-semid="a"]'])
  })

  it('falls through to the first matching candidate and records it', async () => {
    const { deps, attempts } = fakeAct(['#a'])
    const outcome = await executeComputerTask(
      step({ action: 'click', selector: '[data-semid="a"]' }, ['#a', '[name="a"]']),
      {},
      deps
    )
    expect(outcome.actions).toEqual(['clicked #a (selector candidate 2 of 3)'])
    expect(outcome.highlight).toBe('#a')
    expect(attempts).toEqual(['click [data-semid="a"]', 'click #a'])
  })

  it('retries fill and submit across the chain', async () => {
    const { deps } = fakeAct(['[name="q"]', 'form:nth-of-type(1)'])
    const filled = await executeComputerTask(
      step({ action: 'fill', selector: '#q', value: 'hi' }, ['[name="q"]']),
      {},
      deps
    )
    expect(filled.actions).toEqual(['filled [name="q"] (selector candidate 2 of 2)'])
    const submitted = await executeComputerTask(
      step({ action: 'submit', selector: '#missing-form' }, ['form:nth-of-type(1)']),
      {},
      deps
    )
    expect(submitted.actions).toEqual([
      'submitted form:nth-of-type(1) (selector candidate 2 of 2)'
    ])
  })

  it('rethrows the original error when the lone selector misses', async () => {
    const { deps } = fakeAct([])
    await expect(
      executeComputerTask(step({ action: 'click', selector: '[data-semid="nope"]' }), {}, deps)
    ).rejects.toThrow('missing [data-semid="nope"]')
  })

  it('reports the tried count when every candidate misses', async () => {
    const { deps, attempts } = fakeAct([])
    await expect(
      executeComputerTask(
        step({ action: 'click', selector: '[data-semid="a"]' }, ['#a', '[name="a"]']),
        {},
        deps
      )
    ).rejects.toThrow('matched none of 3 selector(s)')
    expect(attempts).toHaveLength(3)
  })

  it('still requires a selector and a fill value', async () => {
    const { deps } = fakeAct([])
    await expect(
      executeComputerTask(step({ action: 'click' }), {}, deps)
    ).rejects.toThrow('has no selector')
    await expect(
      executeComputerTask(step({ action: 'fill', selector: '#a' }), {}, deps)
    ).rejects.toThrow('has no value')
  })
})

describe('executeComputerTask readiness wait', () => {
  /** DomQuery whose text() answers per-selector from `present`, after `delayMs`. */
  function fakeQuery(present: string[], delayMs = 0) {
    const started = Date.now()
    return {
      visible: async () => false,
      text: async (selector: string) => {
        if (Date.now() - started < delayMs) return null
        return present.includes(selector) ? '' : null
      },
      value: async () => null
    }
  }

  it('acts immediately when the selector already exists', async () => {
    const { deps, attempts } = fakeAct(['#a'])
    deps.query = fakeQuery(['#a'])
    const outcome = await executeComputerTask(
      step({ action: 'click', selector: '#a' }),
      {},
      deps
    )
    expect(outcome.actions).toEqual(['clicked #a'])
    expect(attempts).toEqual(['click #a'])
  })

  it('waits for a late-appearing target, then acts exactly once', async () => {
    const { deps, attempts } = fakeAct(['#late'])
    deps.query = fakeQuery(['#late'], 120)
    deps.readyWait = { timeoutMs: 5000 }
    const outcome = await executeComputerTask(
      step({ action: 'click', selector: '#late' }),
      {},
      deps
    )
    expect(outcome.actions).toEqual(['clicked #late'])
    expect(attempts).toEqual(['click #late'])
  })

  it('fails honestly without acting when nothing appears in time', async () => {
    const { deps, attempts } = fakeAct(['#a'])
    deps.query = fakeQuery([])
    deps.readyWait = { timeoutMs: 40 }
    await expect(
      executeComputerTask(step({ action: 'fill', selector: '#a', value: 'hi' }), {}, deps)
    ).rejects.toThrow('target missing')
    expect(attempts).toEqual([])
  })

  it('skips the wait when no query is wired', async () => {
    const { deps, attempts } = fakeAct(['#a'])
    const outcome = await executeComputerTask(
      step({ action: 'click', selector: '#a' }),
      {},
      deps
    )
    expect(outcome.actions).toEqual(['clicked #a'])
    expect(attempts).toEqual(['click #a'])
  })
})
