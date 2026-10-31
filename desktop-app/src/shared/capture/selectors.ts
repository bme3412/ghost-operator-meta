/**
 * Selector candidate chains for capture and replay. Pure and DOM-free: the
 * preload supplies a small structural snapshot (attribute values plus a
 * precomputed CSS path) and the runner supplies resolved binding strings.
 * No page-world access, no CSS global, no Electron imports.
 *
 * Convention: the ordered chain is strongest-first and `selector` (the
 * legacy single field) always equals the best entry, i.e.
 * `selector === selectorCandidates[0]` whenever candidates are present.
 * Replay tries the chain in order until one matches.
 */

/** Structural snapshot of one element, gathered by the isolated preload. */
export interface SelectorElementSnapshot {
  semid?: string | null
  id?: string | null
  testId?: string | null
  testAttr?: string | null
  name?: string | null
  /** Capped-depth CSS path (tag + nth-of-type), computed by the DOM layer. */
  cssPath?: string | null
}

/**
 * Accessible fallback descriptor. A role/label pair is not a CSS selector,
 * so it travels separately from the chain and is matched by other means.
 * Visible text already travels in targetLabel/surroundingText.
 */
export interface AccessibleDescriptor {
  role?: string
  label?: string
}

export interface AccessibleDescriptorInput {
  role?: string | null
  label?: string | null
}

/** Hard cap on chain length; stable hooks come first so the tail is expendable. */
export const MAX_SELECTOR_CANDIDATES = 6

function blankToUndefined(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? value : undefined
}

/**
 * Escape a string for a double-quoted CSS attribute value. Minimal and
 * dependency-free (the main process has no CSS global).
 */
export function escapeAttributeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ')
    .replace(/\r/g, '\\d ')
}

/**
 * Escape a string for use as a CSS identifier (e.g. after `#`). Covers the
 * cases real ids hit: leading digits, a lone leading dash, control chars,
 * and punctuation. Letters, digits, `_`, `-`, and non-ASCII pass through.
 */
export function escapeCssIdentifier(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i] as string
    const code = value.charCodeAt(i)
    if (code === 0x0000) {
      out += '�'
      continue
    }
    if ((code >= 0x0001 && code <= 0x001f) || code === 0x007f) {
      out += `\\${code.toString(16)} `
      continue
    }
    if (i === 0 && code >= 0x0030 && code <= 0x0039) {
      out += `\\${code.toString(16)} `
      continue
    }
    if (i === 0 && ch === '-' && (value.length === 1 || /[0-9]/.test(value[1] as string))) {
      out += '\\-'
      continue
    }
    if (/[a-zA-Z0-9_-]/.test(ch) || code >= 0x0080) {
      out += ch
      continue
    }
    out += `\\${ch}`
  }
  return out
}

function attributeSelector(attr: string, value: string): string {
  return `[${attr}="${escapeAttributeValue(value)}"]`
}

/**
 * Build the ordered replay chain for one element, strongest hook first:
 * data-semid, #id, data-testid, data-test, name, then the capped CSS path.
 * Empty values are skipped, duplicates dropped, length capped.
 */
export function buildSelectorCandidates(snapshot: SelectorElementSnapshot): string[] {
  const candidates: string[] = []
  const push = (value: string | undefined): void => {
    if (!value) return
    if (candidates.includes(value)) return
    if (candidates.length >= MAX_SELECTOR_CANDIDATES) return
    candidates.push(value)
  }
  const semid = blankToUndefined(snapshot.semid)
  if (semid !== undefined) push(attributeSelector('data-semid', semid))
  const id = blankToUndefined(snapshot.id)
  if (id !== undefined) push(`#${escapeCssIdentifier(id)}`)
  const testId = blankToUndefined(snapshot.testId)
  if (testId !== undefined) push(attributeSelector('data-testid', testId))
  const testAttr = blankToUndefined(snapshot.testAttr)
  if (testAttr !== undefined) push(attributeSelector('data-test', testAttr))
  const name = blankToUndefined(snapshot.name)
  if (name !== undefined) push(attributeSelector('name', name))
  const cssPath = blankToUndefined(snapshot.cssPath)
  if (cssPath !== undefined) push(cssPath.trim())
  return candidates
}

/** Best (first) chain entry, or undefined for an empty chain. */
export function selectBestSelector(candidates: readonly string[]): string | undefined {
  return candidates[0]
}

/**
 * Build the accessible fallback descriptor, or undefined when the element
 * offers neither an explicit role nor an accessible label.
 */
export function buildAccessibleDescriptor(
  input: AccessibleDescriptorInput
): AccessibleDescriptor | undefined {
  const role = blankToUndefined(input.role)
  const label = blankToUndefined(input.label)
  if (role === undefined && label === undefined) return undefined
  return {
    ...(role !== undefined ? { role } : {}),
    ...(label !== undefined ? { label } : {})
  }
}

/**
 * Ordered replay list: the primary selector first, then fallbacks.
 * Empty entries are skipped and duplicates dropped, so the stored
 * full-chain convention (`primary === candidates[0]`) collapses cleanly.
 */
export function orderedAttemptSelectors(
  primary: string | undefined,
  candidates?: readonly string[]
): string[] {
  const ordered: string[] = []
  const push = (value: string | undefined | null): void => {
    if (!value) return
    const trimmed = value.trim()
    if (!trimmed || ordered.includes(trimmed)) return
    ordered.push(trimmed)
  }
  push(primary)
  for (const candidate of candidates ?? []) push(candidate)
  return ordered
}

/**
 * Attempt action string naming the matched selector. Single-candidate
 * (legacy) attempts keep the historical `verb selector` shape; fallback
 * matches record which candidate hit.
 */
export function formatAttemptAction(
  verb: 'clicked' | 'filled' | 'submitted',
  matched: string,
  index: number,
  total: number
): string {
  if (index <= 0 || total <= 1) return `${verb} ${matched}`
  return `${verb} ${matched} (selector candidate ${index + 1} of ${total})`
}
