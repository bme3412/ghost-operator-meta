import {
  TARGET,
  saltbreakProfile,
  siteProfileForUrl,
  type SiteProfile,
  type TargetStatus
} from '../shared/target'
import { loadState, saveState } from './store'
import { getWindow } from './windows/registry'

/** Saltbreak URL from the environment. Override with TARGET_URL (or SALTBREAK_URL). */
function envTargetUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.TARGET_URL ?? env.SALTBREAK_URL ?? TARGET.defaultUrl
  return url.replace(/\/$/, '')
}

/** Where the target window loads: the stored site, or the Saltbreak URL. */
export function resolveTargetUrl(env: NodeJS.ProcessEnv = process.env): string {
  return loadState().currentSite?.url ?? envTargetUrl(env)
}

/** Live target site profile: the stored site, or Saltbreak by default. */
export function getTargetInfo(env: NodeJS.ProcessEnv = process.env): SiteProfile {
  const stored = loadState().currentSite
  // Stored Saltbreak profiles predate starter tasks; re-attach them live so
  // persisted state never needs a migration for curated content.
  if (stored) {
    return stored.id === TARGET.id
      ? { ...stored, starterTasks: saltbreakProfile(stored.url).starterTasks }
      : { ...stored }
  }
  return saltbreakProfile(envTargetUrl(env))
}

/**
 * True when an HTTP request to `url` gets any response (any status counts:
 * even a 404 proves something is listening). Only network failures and
 * timeouts read as unreachable. The fetcher is injectable for tests.
 */
export async function isTargetReachable(
  url: string,
  timeoutMs = 2500,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetcher(url, { method: 'GET', redirect: 'manual', signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Reachability snapshot for the live target profile. Never throws. */
export async function getTargetStatus(): Promise<TargetStatus> {
  const profile = getTargetInfo()
  let reachable = false
  try {
    reachable = await isTargetReachable(profile.url)
  } catch {
    reachable = false
  }
  return { ...profile, reachable, checkedAt: new Date().toISOString() }
}

/** True when two hostnames match, ignoring case and a lone www. prefix. */
function sameHostOrWww(a: string, b: string): boolean {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x === y || x === `www.${y}` || y === `www.${x}`
}

/**
 * Follow `url` to its canonical form: when the server redirects within the
 * same host (http→https upgrades, www consolidation), keep the final origin
 * with the caller's original path — the stored site must be the URL that
 * actually loads, or the origin lock blocks the redirect. Cross-host
 * redirects, unparseable URLs, and network failures keep the input
 * unchanged. Never throws. The fetcher is injectable for tests.
 */
export async function resolveCanonicalTargetUrl(
  url: string,
  timeoutMs = 2500,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    })
    return canonicalizeTargetUrl(url, response.url)
  } catch {
    return url
  } finally {
    clearTimeout(timer)
  }
}

function canonicalizeTargetUrl(input: string, finalUrl: string): string {
  let original: URL
  let final: URL
  try {
    original = new URL(input)
    final = new URL(finalUrl || input)
  } catch {
    return input
  }
  if (final.protocol !== 'http:' && final.protocol !== 'https:') return input
  if (!sameHostOrWww(final.hostname, original.hostname)) return input
  const canonical = `${final.origin}${original.pathname}${original.search}${original.hash}`
  // Stored-URL convention: no trailing slash on a bare origin, so the
  // Saltbreak comparison in siteProfileForUrl keeps matching.
  return canonical === `${final.origin}/` ? final.origin : canonical
}

/**
 * Point the target window at a new site. Canonicalizes the URL (following
 * same-host redirects, e.g. http→https), validates it (absolute http(s)
 * only), persists the derived site profile, and loads it in the target
 * window. Throws on invalid URLs; the stored site is untouched.
 */
export async function setTargetUrl(
  rawUrl: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<SiteProfile> {
  const profile = siteProfileForUrl(await resolveCanonicalTargetUrl(rawUrl), envTargetUrl(env))
  const state = loadState()
  saveState({ ...state, currentSite: profile })
  const target = getWindow('target')
  if (target && !target.isDestroyed()) {
    target.setTitle(profile.name)
    target.loadURL(profile.url).catch(() => undefined)
  }
  return { ...profile }
}
