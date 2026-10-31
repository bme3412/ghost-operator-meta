import { describe, expect, it } from 'vitest'
import { waitForAnySelector } from '../../src/main/runner/wait'
import type { DomQuery } from '../../src/main/runner/checks'

/** DomQuery with a scripted text() sequence; anything else answers null/false. */
function fakeQuery(script: Array<string | null | Error>): { query: DomQuery; probes: string[] } {
  const probes: string[] = []
  let i = 0
  const next = async (selector: string): Promise<string | null> => {
    probes.push(selector)
    const value = i < script.length ? script[i] : script[script.length - 1]
    i += 1
    if (value instanceof Error) throw value
    return value ?? null
  }
  return {
    probes,
    query: {
      visible: async () => false,
      text: next,
      value: async () => null
    }
  }
}

describe('waitForAnySelector', () => {
  it('resolves true immediately when a candidate already answers', async () => {
    const { query, probes } = fakeQuery([''])
    await expect(waitForAnySelector(['#a'], query, { timeoutMs: 50 })).resolves.toBe(true)
    expect(probes).toEqual(['#a'])
  })

  it('waits for a late-appearing element, then resolves true', async () => {
    const { query } = fakeQuery([null, null, 'ready'])
    await expect(waitForAnySelector(['#a'], query, { timeoutMs: 2000, pollMs: 10 })).resolves.toBe(
      true
    )
  })

  it('accepts any candidate, not just the first', async () => {
    const { query } = fakeQuery([null, 'fallback here'])
    await expect(
      waitForAnySelector(['#missing', '#fallback'], query, { timeoutMs: 500, pollMs: 10 })
    ).resolves.toBe(true)
  })

  it('rides through query errors from a navigation in flight', async () => {
    const { query } = fakeQuery([new Error('Script failed to execute'), 'back'])
    await expect(waitForAnySelector(['#a'], query, { timeoutMs: 2000, pollMs: 10 })).resolves.toBe(
      true
    )
  })

  it('resolves false on timeout when nothing ever answers', async () => {
    const { query } = fakeQuery([null])
    await expect(waitForAnySelector(['#a'], query, { timeoutMs: 40, pollMs: 10 })).resolves.toBe(
      false
    )
  })

  it('resolves true when there is nothing to wait for', async () => {
    const { query, probes } = fakeQuery([null])
    await expect(waitForAnySelector([], query, { timeoutMs: 10 })).resolves.toBe(true)
    expect(probes).toEqual([])
  })
})
