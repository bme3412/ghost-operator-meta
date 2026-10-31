/**
 * Shared scout helpers (renderer-safe: no Electron, no Node).
 */

/**
 * Pathname of a scanned href, resolved against the linking page's path.
 * Accepts absolute http(s) URLs as well as root- and page-relative hrefs.
 * Returns null for empty, fragment-only, unparseable, and non-http(s) hrefs.
 */
export function scoutHrefPath(href: string, basePath = '/'): string | null {
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:/i.test(trimmed)) {
    return null
  }
  const base = basePath.startsWith('/') ? basePath : `/${basePath}`
  try {
    const parsed = new URL(trimmed, `http://scout.invalid${base}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.pathname || '/'
  } catch {
    return null
  }
}
