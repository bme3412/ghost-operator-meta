import { describe, expect, it } from 'vitest'
import { friendlyError } from '../../src/renderer/src/lib/errors'

describe('friendlyError', () => {
  it('strips the Electron IPC invocation prefix', () => {
    expect(friendlyError(new Error("Error invoking remote method 'runs:start': No skill."))).toBe(
      'No skill.'
    )
  })

  it('strips a leading Error prefix and stringifies values', () => {
    expect(friendlyError(new Error('Error: boom'))).toBe('boom')
    expect(friendlyError('plain failure')).toBe('plain failure')
  })

  it('condenses Zod issue arrays to path: message fragments', () => {
    const zod = JSON.stringify([
      { code: 'too_small', path: ['goal'], message: 'String must contain at least 1 character' },
      { code: 'invalid_type', path: ['inputs', 'ticketId'], message: 'Required' }
    ])
    expect(friendlyError(new Error(zod))).toBe(
      'goal: String must contain at least 1 character; inputs.ticketId: Required'
    )
  })

  it('leaves non-JSON brackets alone and caps length', () => {
    expect(friendlyError('[not json')).toBe('[not json')
    expect(friendlyError('x'.repeat(500))).toHaveLength(300)
  })
})
