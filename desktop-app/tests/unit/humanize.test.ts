import { describe, expect, it } from 'vitest'
import {
  bindingSentences,
  checkLabel,
  demonstratedInputs,
  demonstratedKey,
  demonstratedValue,
  humanizeKey,
  stepLabel
} from '../../src/renderer/src/lib/humanize'

describe('humanizeKey', () => {
  it('splits camelCase and capitalizes words', () => {
    expect(humanizeKey('ticketId')).toBe('Ticket ID')
    expect(humanizeKey('recordId')).toBe('Record ID')
    expect(humanizeKey('case')).toBe('Case')
  })

  it('splits snake_case and kebab-case', () => {
    expect(humanizeKey('record_id')).toBe('Record ID')
    expect(humanizeKey('run-input')).toBe('Run Input')
  })

  it('keeps known acronyms uppercase and never returns empty', () => {
    expect(humanizeKey('targetUrl')).toBe('Target URL')
    expect(humanizeKey('')).toBe('')
    expect(humanizeKey('___')).toBe('___')
  })
})

describe('stepLabel', () => {
  it('prefers the plain-language goal', () => {
    expect(stepLabel({ id: 'click-x', kind: 'computer_task', goal: 'Click Resolved.' })).toBe(
      'Click Resolved.'
    )
  })

  it('falls back by kind, then by humanized id', () => {
    expect(stepLabel({ id: 'v1', kind: 'verify' })).toBe('Verify the result')
    expect(stepLabel({ id: 'r1', kind: 'review', goal: '  ' })).toBe('Review this step')
    expect(stepLabel({ id: 'goto-home', kind: 'computer_task' })).toBe('Goto Home')
  })
})

describe('checkLabel', () => {
  it('phrases known checks with their expectation', () => {
    expect(checkLabel('text_contains', 'resolved')).toBe('Shows “resolved”')
    expect(checkLabel('value_equals', 'T-101')).toBe('Equals “T-101”')
    expect(checkLabel('target_visible')).toBe('Is visible on the page')
  })

  it('humanizes unknown check names instead of rendering them raw', () => {
    expect(checkLabel('text_contains')).toBe('Shows the expected text')
    expect(checkLabel('custom_thing')).toBe('Custom Thing')
  })
})

describe('demonstrated helpers', () => {
  it('extracts quoted values and strips the inputs prefix', () => {
    expect(demonstratedValue('Ticket "T-101"')).toBe('T-101')
    expect(demonstratedValue('plain')).toBe('plain')
    expect(demonstratedKey('inputs.ticketId')).toBe('ticketId')
  })

  it('phrases binding sentences and input maps', () => {
    expect(bindingSentences({ 'Ticket "T-101"': 'inputs.ticketId' })).toEqual([
      'Each run will ask for Ticket ID (you used T-101)'
    ])
    expect(demonstratedInputs({ 'Ticket "T-101"': 'inputs.ticketId' })).toEqual({
      ticketId: 'T-101'
    })
  })
})
