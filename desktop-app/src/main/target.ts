import { TARGET } from '../shared/target'

/** Where the target window loads. Override with TARGET_URL (or SALTBREAK_URL). */
export function resolveTargetUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.TARGET_URL ?? env.SALTBREAK_URL ?? TARGET.defaultUrl
  return url.replace(/\/$/, '')
}

export function getTargetInfo(env: NodeJS.ProcessEnv = process.env): {
  id: string
  name: string
  url: string
} {
  return { id: TARGET.id, name: TARGET.name, url: resolveTargetUrl(env) }
}
