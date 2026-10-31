/**
 * Decide whether a client-side route change should emit a navigate event.
 * Consecutive duplicates (pushState to the current path, or a load followed
 * by an SPA nav to the same path) carry no new information and are dropped.
 * Returns the pathname to emit, or null to stay silent.
 */
export function nextNavigateToEmit(
  lastEmitted: string | null,
  currentPath: string
): string | null {
  if (currentPath === lastEmitted) return null
  return currentPath
}

/** Pathname of an http(s) URL, or null for anything else. */
export function pathnameOfHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.pathname
  } catch {
    return null
  }
}

/**
 * Main-process verdict for a did-navigate-in-page event. Only main-frame
 * http(s) navigations to a new pathname produce events; subframes, non-web
 * schemes, unparseable URLs, and consecutive duplicates stay silent.
 * Returns the pathname to emit, or null.
 */
export function inPageNavigateToEmit(
  lastEmitted: string | null,
  url: string,
  isMainFrame: boolean
): string | null {
  if (!isMainFrame) return null
  const pathname = pathnameOfHttpUrl(url)
  if (!pathname) return null
  return nextNavigateToEmit(lastEmitted, pathname)
}
