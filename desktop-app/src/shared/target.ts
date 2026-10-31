/** The web application Ghost Operator teaches, guides, and assists. */
export const TARGET = {
  id: 'saltbreak',
  name: 'Saltbreak',
  defaultUrl: 'http://localhost:3000'
} as const

export type TargetId = typeof TARGET.id

export interface TargetInfo {
  id: string
  name: string
  url: string
}

/**
 * A target site profile. Saltbreak is the default profile; any other
 * http(s) site the user points the target window at becomes a profile whose
 * id derives from the origin hostname (e.g. "ebay-com").
 */
export interface SiteProfile {
  id: string
  name: string
  url: string
}

/**
 * Live reachability snapshot for the current target. Produced by the main
 * process (Node fetch); renderers treat it as a hint and retry themselves.
 */
export interface TargetStatus {
  id: string
  name: string
  url: string
  reachable: boolean
  checkedAt: string
}

/** The default site profile: Saltbreak at the configured target URL. */
export function saltbreakProfile(url: string): SiteProfile {
  return { id: TARGET.id, name: TARGET.name, url }
}

/** Slugify an origin hostname into a site id ("EBay.COM" -> "ebay-com"). */
export function slugifyHostname(hostname: string): string {
  return (
    hostname
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'site'
  )
}

/**
 * Validate an absolute http(s) target URL and normalize it (trimmed, no
 * trailing slash). Throws when the URL is not an absolute http(s) URL.
 */
export function normalizeTargetUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`Invalid target URL "${rawUrl}": must be an absolute http(s) URL.`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid target URL "${rawUrl}": only http(s) URLs are allowed.`)
  }
  return trimmed.replace(/\/$/, '')
}

/**
 * Build the site profile for a target URL. The configured Saltbreak URL
 * keeps the Saltbreak profile (so the deterministic Saltbreak path is
 * unchanged); every other origin derives its id from its hostname.
 */
export function siteProfileForUrl(rawUrl: string, saltbreakUrl?: string): SiteProfile {
  const url = normalizeTargetUrl(rawUrl)
  if (saltbreakUrl !== undefined && url === saltbreakUrl.replace(/\/$/, '')) {
    return saltbreakProfile(url)
  }
  const hostname = new URL(url).hostname
  return { id: slugifyHostname(hostname), name: hostname, url }
}
