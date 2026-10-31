import { TARGET } from '../target'

/**
 * Site ids with stable hooks and deterministic coverage. A site is familiar
 * iff its id is listed here; today only Saltbreak qualifies. Add ids here as
 * other sites graduate (stable selectors, reviewed fixtures).
 */
export const FAMILIAR_SITE_IDS: readonly string[] = [TARGET.id]

/** True for familiar sites (stable hooks); null/undefined/'' is unfamiliar. */
export function isFamiliarSiteId(siteId: string | null | undefined): boolean {
  if (!siteId) return false
  return FAMILIAR_SITE_IDS.includes(siteId)
}

/** True for arbitrary sites (logins, purchases, no stable hooks). */
export function isUnfamiliarSiteId(siteId: string | null | undefined): boolean {
  return !isFamiliarSiteId(siteId)
}
