import { describe, expect, it } from 'vitest'
import {
  buildAccessibleDescriptor,
  buildSelectorCandidates,
  escapeAttributeValue,
  escapeCssIdentifier,
  formatAttemptAction,
  orderedAttemptSelectors,
  selectBestSelector
} from '../../src/shared/capture/selectors'

describe('buildSelectorCandidates', () => {
  it('orders hooks strongest-first: semid, id, testids, name, css path', () => {
    expect(
      buildSelectorCandidates({
        semid: 'ticket-resolve-T-101',
        id: 'resolve-btn',
        testId: 'resolve',
        testAttr: 'resolve-legacy',
        name: 'resolve',
        cssPath: 'main:nth-of-type(1) > button:nth-of-type(2)'
      })
    ).toEqual([
      '[data-semid="ticket-resolve-T-101"]',
      '#resolve-btn',
      '[data-testid="resolve"]',
      '[data-test="resolve-legacy"]',
      '[name="resolve"]',
      'main:nth-of-type(1) > button:nth-of-type(2)'
    ])
  })

  it('prefers the semid hook so Saltbreak captures keep their selector', () => {
    const chain = buildSelectorCandidates({
      semid: 'nav-staff',
      cssPath: 'body:nth-of-type(1) > nav:nth-of-type(1)'
    })
    expect(chain[0]).toBe('[data-semid="nav-staff"]')
    expect(selectBestSelector(chain)).toBe('[data-semid="nav-staff"]')
  })

  it('falls back to the css path when no hook exists', () => {
    const chain = buildSelectorCandidates({
      cssPath: 'div:nth-of-type(3) > button:nth-of-type(1)'
    })
    expect(chain).toEqual(['div:nth-of-type(3) > button:nth-of-type(1)'])
    expect(selectBestSelector(chain)).toBe('div:nth-of-type(3) > button:nth-of-type(1)')
  })

  it('adds a site-relative anchor href after name, before the css path', () => {
    const chain = buildSelectorCandidates({
      name: 'shop-link',
      href: '/shop',
      cssPath: 'div:nth-of-type(1) > a:nth-of-type(1)'
    })
    expect(chain).toEqual([
      '[name="shop-link"]',
      'a[href="/shop"]',
      'div:nth-of-type(1) > a:nth-of-type(1)'
    ])
  })

  it('skips hrefs that are not site-relative', () => {
    for (const href of ['https://example.com/shop', '//example.com/shop', '#frag', 'shop', '']) {
      expect(buildSelectorCandidates({ href, cssPath: 'a:nth-of-type(1)' })).toEqual([
        'a:nth-of-type(1)'
      ])
    }
  })

  it('escapes quotes inside an href value', () => {
    const chain = buildSelectorCandidates({ href: '/search?q="x"' })
    expect(chain).toEqual(['a[href="/search?q=\\"x\\""]'])
  })

  it('returns an empty chain when the element offers nothing', () => {
    expect(buildSelectorCandidates({})).toEqual([])
    expect(buildSelectorCandidates({ semid: '  ', id: null, cssPath: undefined })).toEqual([])
    expect(selectBestSelector([])).toBeUndefined()
  })

  it('skips blank values and drops duplicates', () => {
    expect(
      buildSelectorCandidates({
        semid: 'dup',
        testId: 'dup',
        testAttr: 'dup',
        cssPath: '[data-semid="dup"]'
      })
    ).toEqual(['[data-semid="dup"]', '[data-testid="dup"]', '[data-test="dup"]'])
  })

  it('escapes ids with special characters', () => {
    const [idSelector] = buildSelectorCandidates({ id: 'foo.bar:baz' })
    expect(idSelector).toBe('#foo\\.bar\\:baz')
    const [digitSelector] = buildSelectorCandidates({ id: '123abc' })
    expect(digitSelector).toBe('#\\31 23abc')
  })
})

describe('escaping', () => {
  it('escapes quotes and backslashes in attribute values', () => {
    expect(escapeAttributeValue('say "hi" \\ bye')).toBe('say \\"hi\\" \\\\ bye')
  })

  it('passes plain identifiers through untouched', () => {
    expect(escapeCssIdentifier('resolve-btn_2')).toBe('resolve-btn_2')
  })
})

describe('buildAccessibleDescriptor', () => {
  it('records role and label separately from the css chain', () => {
    expect(buildAccessibleDescriptor({ role: 'button', label: 'Resolve ticket' })).toEqual({
      role: 'button',
      label: 'Resolve ticket'
    })
  })

  it('keeps a lone role or label', () => {
    expect(buildAccessibleDescriptor({ role: 'search', label: null })).toEqual({ role: 'search' })
    expect(buildAccessibleDescriptor({ label: 'Close' })).toEqual({ label: 'Close' })
  })

  it('returns undefined when neither is present', () => {
    expect(buildAccessibleDescriptor({})).toBeUndefined()
    expect(buildAccessibleDescriptor({ role: '  ', label: '' })).toBeUndefined()
  })
})

describe('orderedAttemptSelectors', () => {
  it('puts the primary first, then fallbacks', () => {
    expect(orderedAttemptSelectors('[data-semid="a"]', ['#a', '[name="a"]'])).toEqual([
      '[data-semid="a"]',
      '#a',
      '[name="a"]'
    ])
  })

  it('collapses the stored full-chain convention without duplication', () => {
    expect(
      orderedAttemptSelectors('[data-semid="a"]', ['[data-semid="a"]', '#a'])
    ).toEqual(['[data-semid="a"]', '#a'])
  })

  it('skips empties and works without a primary', () => {
    expect(orderedAttemptSelectors(undefined, ['', '#a', '  '])).toEqual(['#a'])
    expect(orderedAttemptSelectors(undefined, undefined)).toEqual([])
  })
})

describe('formatAttemptAction', () => {
  it('keeps the legacy shape for single-candidate attempts', () => {
    expect(formatAttemptAction('clicked', '[data-semid="a"]', 0, 1)).toBe(
      'clicked [data-semid="a"]'
    )
  })

  it('records which candidate matched on fallback', () => {
    expect(formatAttemptAction('filled', '#field', 1, 3)).toBe(
      'filled #field (selector candidate 2 of 3)'
    )
    expect(formatAttemptAction('submitted', 'form:nth-of-type(1)', 2, 3)).toBe(
      'submitted form:nth-of-type(1) (selector candidate 3 of 3)'
    )
  })
})
