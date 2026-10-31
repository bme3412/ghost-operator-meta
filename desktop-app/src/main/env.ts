import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Parse KEY=VALUE lines; skips blanks/comments, strips matching quotes. */
export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice('export '.length).trim()
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    if (key) out[key] = value
  }
  return out
}

function defaultCandidates(): string[] {
  const explicit = process.env.GHOST_ENV_PATH?.trim()
  if (explicit) return [explicit]
  // Dev reads beside the project; packaged builds read beside user data.
  return app.isPackaged
    ? [join(app.getPath('userData'), '.env.local')]
    : [join(app.getAppPath(), '.env.local')]
}

/**
 * Load the first existing .env.local into target (default process.env).
 * Never overrides a variable that is already set. Returns the file used,
 * or null when none exists. Safe to call when Electron has no display.
 */
export function loadLocalEnv(
  target: Record<string, string | undefined> = process.env,
  candidates: string[] | null = null
): string | null {
  for (const file of candidates ?? defaultCandidates()) {
    if (!existsSync(file)) continue
    let parsed: Record<string, string>
    try {
      parsed = parseEnvText(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (target[key] === undefined) target[key] = value
    }
    return file
  }
  return null
}
