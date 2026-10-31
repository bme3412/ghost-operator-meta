import { describe, expect, it } from 'vitest'
import {
  FAMILIAR_SITE_IDS,
  isFamiliarSiteId,
  isUnfamiliarSiteId
} from '../../src/shared/capture/sites'
import { TARGET } from '../../src/shared/target'

describe('site familiarity', () => {
  it('treats Saltbreak as the only familiar site', () => {
    expect(FAMILIAR_SITE_IDS).toEqual([TARGET.id])
    expect(isFamiliarSiteId('saltbreak')).toBe(true)
    expect(isUnfamiliarSiteId('saltbreak')).toBe(false)
  })

  it('treats arbitrary site ids as unfamiliar', () => {
    for (const id of ['ebay-com', 'www-ebay-com', 'localhost', 'site', 'Saltbreak']) {
      expect(isFamiliarSiteId(id)).toBe(false)
      expect(isUnfamiliarSiteId(id)).toBe(true)
    }
  })

  it('fails closed on missing site ids', () => {
    for (const id of [null, undefined, '']) {
      expect(isFamiliarSiteId(id)).toBe(false)
      expect(isUnfamiliarSiteId(id)).toBe(true)
    }
  })
})
