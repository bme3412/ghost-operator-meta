/** Maximum length of a friendly error message. */
const MAX_LENGTH = 300

interface ZodIssueLike {
  message?: unknown
  path?: unknown
}

/**
 * One readable line for a failure. Strips the Electron IPC prefix
 * ("Error invoking remote method ..."), the "Error:" prefix, and Zod's JSON
 * issue arrays (condensed to "path: message" fragments).
 */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const stripped = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/, '')
    .trim()
  const zod = condenseZod(stripped)
  const message = zod ?? stripped
  return message.length > MAX_LENGTH ? `${message.slice(0, MAX_LENGTH - 1)}…` : message
}

function condenseZod(text: string): string | null {
  if (!text.startsWith('[')) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const fragments: string[] = []
  for (const issue of parsed as ZodIssueLike[]) {
    if (typeof issue?.message !== 'string') continue
    const path = Array.isArray(issue.path) ? issue.path.join('.') : ''
    fragments.push(path ? `${path}: ${issue.message}` : issue.message)
    if (fragments.length >= 3) break
  }
  if (fragments.length === 0) return null
  const suffix = (parsed as unknown[]).length > fragments.length ? '; …' : ''
  return fragments.join('; ') + suffix
}
