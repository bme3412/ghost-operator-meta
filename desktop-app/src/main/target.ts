import { TARGET, saltbreakProfile, siteProfileForUrl, type SiteProfile } from '../shared/target'
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
  if (stored) return { ...stored }
  return saltbreakProfile(envTargetUrl(env))
}

/**
 * Point the target window at a new site. Validates the URL (absolute
 * http(s) only), persists the derived site profile, and loads it in the
 * target window. Throws on invalid URLs; the stored site is untouched.
 */
export function setTargetUrl(rawUrl: string, env: NodeJS.ProcessEnv = process.env): SiteProfile {
  const profile = siteProfileForUrl(rawUrl, envTargetUrl(env))
  const state = loadState()
  saveState({ ...state, currentSite: profile })
  const target = getWindow('target')
  if (target && !target.isDestroyed()) {
    target.setTitle(profile.name)
    target.loadURL(profile.url).catch(() => undefined)
  }
  return { ...profile }
}
