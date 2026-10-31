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
  starterTasks?: StarterTask[]
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
  starterTasks?: StarterTask[]
}

/**
 * Live reachability snapshot for the current target. Produced by the main
 * process (Node fetch); renderers treat it as a hint and retry themselves.
 */
export interface TargetStatus {
  id: string
  name: string
  url: string
  starterTasks?: StarterTask[]
  reachable: boolean
  checkedAt: string
}

/** Who a starter task is for. Owner tasks live under /staff/*, shopper tasks on the storefront. */
export type StarterAudience = 'owner' | 'shopper'

/**
 * A curated tap-to-run demo task. `id` keys the canned fixture proposal;
 * `exampleInputs` prefill the run inputs (first input to demonstrate on);
 * `startPath` is where the run begins.
 */
export interface StarterTask {
  id: string
  audience: StarterAudience
  title: string
  exampleInputs: Record<string, string>
  startPath: string
}

/** Curated Saltbreak demo tasks: tap a card, review the script, run it, run it again. */
export const SALTBREAK_STARTER_TASKS: StarterTask[] = [
  {
    id: 'reconcile-payout',
    audience: 'owner',
    title: 'Reconcile payout PO-1043 in Books',
    exampleInputs: { payoutId: 'PO-1043' },
    startPath: '/staff/payments'
  },
  {
    id: 'answer-ticket',
    audience: 'owner',
    title: 'Answer ticket T-101 from product facts',
    exampleInputs: { ticketId: 'T-101' },
    startPath: '/staff/inbox'
  },
  {
    id: 'shop-under-budget',
    audience: 'shopper',
    title: 'Find an in-stock beginner board under $500 and add it to the cart',
    exampleInputs: { maxDollars: '500' },
    startPath: '/shop'
  },
  {
    id: 'report-order-charge',
    audience: 'shopper',
    title: 'Report a duplicate charge on order SB-8014',
    exampleInputs: { orderId: 'SB-8014', reason: 'Charged twice' },
    startPath: '/order/SB-8014'
  }
]

/** The default site profile: Saltbreak at the configured target URL. */
export function saltbreakProfile(url: string): SiteProfile {
  return { id: TARGET.id, name: TARGET.name, url, starterTasks: SALTBREAK_STARTER_TASKS }
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
 * unchanged); every other origin derives its id from its hostname. A URL
 * that matches the configured Saltbreak host and port but differs only by
 * scheme (e.g. a mistyped https://localhost:3000) folds back to the
 * configured URL — the local server speaks plain HTTP, and anything else
 * would strand the target on a failing TLS handshake.
 */
export function siteProfileForUrl(rawUrl: string, saltbreakUrl?: string): SiteProfile {
  const url = normalizeTargetUrl(rawUrl)
  if (saltbreakUrl !== undefined) {
    const configured = saltbreakUrl.replace(/\/$/, '')
    if (url === configured) {
      return saltbreakProfile(url)
    }
    if (sameHostAndPort(url, configured)) {
      return saltbreakProfile(configured)
    }
  }
  const hostname = new URL(url).hostname
  return { id: slugifyHostname(hostname), name: hostname, url }
}

/** True when both URLs share a hostname and effective port. Never throws. */
function sameHostAndPort(a: string, b: string): boolean {
  try {
    const x = new URL(a)
    const y = new URL(b)
    if (x.hostname.toLowerCase() !== y.hostname.toLowerCase()) return false
    return effectivePort(x) === effectivePort(y)
  } catch {
    return false
  }
}

/** Explicit port, or the scheme default when implicit. */
function effectivePort(url: URL): string {
  if (url.port !== '') return url.port
  return url.protocol === 'https:' ? '443' : '80'
}
