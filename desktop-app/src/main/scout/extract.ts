/**
 * Pure scout helpers: crawl budgets, in-page extraction, and crawl planning.
 * Electron-free so unit tests can exercise every helper with DOM-free
 * fixtures (raw extraction payloads shaped like executeJavaScript results).
 */
import {
  PageSummary,
  type PageSummary as PageSummaryType,
  type ScoutButton,
  type ScoutForm,
  type ScoutLink
} from '../../shared/schemas'
import { isTargetNavigationAllowed } from '../windows/guards'

/** Upper bound on pages crawled per scan. */
export const SCOUT_MAX_PAGES = 25
/** Upper bound on one page's load plus extraction. */
export const SCOUT_PAGE_TIMEOUT_MS = 10_000
/** Upper bound on the whole scan; the partial map is kept on expiry. */
export const SCOUT_TOTAL_TIMEOUT_MS = 90_000

/** Caps re-enforced on the main side (the snippet truncates first). */
const MAX_HEADINGS = 100
const MAX_LINKS = 500
const MAX_FORMS = 50
const MAX_FIELDS = 100
const MAX_BUTTONS = 200
const MAX_TITLE = 300
const MAX_TEXT = 200
const MAX_HREF = 2000
const MAX_NAME = 120
const MAX_TYPE = 50
const MAX_LABEL = 120
const MAX_SEMID = 200
const MAX_OPTIONS = 12
const MAX_OPTION = 60
const MAX_REPEAT_COUNT = 500

/**
 * Origin lock for scout loads: the scan may only load its own site origin
 * (plus the initial blank document). Delegates to the target navigation
 * check so the scout window and the target window share one allowlist.
 */
export function isScoutNavigationAllowed(rawUrl: string, siteUrl: string): boolean {
  return isTargetNavigationAllowed(rawUrl, siteUrl)
}

/**
 * DOM extraction IIFE run in the scout window via executeJavaScript (and in
 * the live target window for page ideas, in an isolated world).
 * Self-contained (no page globals beyond document), truncates page-provided
 * strings, and skips password fields and submit controls as form fields.
 * Fields also carry placeholders and select options; `repeats` counts
 * list/card-like structure as a rough "many similar things" signal.
 */
export function pageExtractSnippet(): string {
  return `(() => {
const clip = (s, n) => String(s || '').trim().replace(/\\s+/g, ' ').slice(0, n);
const headings = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3'), 0, 100)
  .map((h) => clip(h.textContent, 200)).filter((h) => h.length > 0);
const links = Array.prototype.slice.call(document.querySelectorAll('a[href]'), 0, 500)
  .map((a) => ({ text: clip(a.textContent, 200), href: String(a.getAttribute('href') || '').slice(0, 2000) }))
  .filter((l) => l.href.length > 0);
const labelFor = (el, form) => {
  const aria = el.getAttribute && el.getAttribute('aria-label');
  if (aria) return clip(aria, 120);
  const id = el.getAttribute && el.getAttribute('id');
  if (id && form) {
    const lab = form.querySelector('label[for="' + String(id).replace(/"/g, '') + '"]');
    if (lab) return clip(lab.textContent, 120);
  }
  return '';
};
const forms = Array.prototype.slice.call(document.querySelectorAll('form'), 0, 50).map((form) => {
  const fields = Array.prototype.slice.call(form.querySelectorAll('input,select,textarea'), 0, 100).map((el) => {
    const tag = el.tagName.toLowerCase();
    const kind = String(el.getAttribute('type') || tag).toLowerCase();
    if (tag === 'input' && kind === 'password') return null;
    if (tag === 'input' && ['submit', 'button', 'reset', 'image'].indexOf(kind) >= 0) return null;
    const out = { name: String(el.getAttribute('name') || el.getAttribute('id') || '').slice(0, 120), type: kind.slice(0, 50) };
    const label = labelFor(el, form);
    if (label) out.label = label;
    const placeholder = el.getAttribute && el.getAttribute('placeholder');
    if (placeholder) out.placeholder = clip(placeholder, 120);
    if (tag === 'select' && el.options) {
      const options = Array.prototype.slice.call(el.options, 0, 12)
        .map((o) => clip(o.textContent, 60)).filter((o) => o.length > 0);
      if (options.length > 0) out.options = options;
    }
    return out;
  }).filter(Boolean);
  const submit = form.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
  const out = { fields: fields, submitLabel: submit ? clip(submit.textContent || submit.value, 120) : '' };
  const action = form.getAttribute('action');
  if (action) out.action = String(action).slice(0, 2000);
  return out;
});
const buttons = Array.prototype.slice.call(document.querySelectorAll('button,a[role="button"],input[type="submit"],input[type="button"]'), 0, 200)
  .map((b) => {
    const out = { label: clip(b.textContent || b.value, 120) };
    const semid = b.getAttribute && b.getAttribute('data-semid');
    if (semid) out.semid = String(semid).slice(0, 200);
    return out;
  }).filter((b) => b.label.length > 0 || b.semid);
const repeats = {
  listItems: Math.min(document.querySelectorAll('li').length, 500),
  cards: Math.min(document.querySelectorAll('[class*="card"],[class*="tile"],[class*="listing"],[class*="-item"]').length, 500)
};
return { title: clip(document.title, 300), headings: headings, links: links, forms: forms, buttons: buttons, repeats: repeats };
})()`
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function clampCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(MAX_REPEAT_COUNT, Math.floor(value)))
}

/**
 * Validate and clamp a raw extraction payload into a PageSummary.
 * Never throws: hostile page shapes degrade to an empty page at `path`.
 */
export function normalizePageExtract(raw: unknown, path: string): PageSummaryType {
  const root = asRecord(raw)
  const links: ScoutLink[] = []
  for (const entry of asArray(root.links).slice(0, MAX_LINKS)) {
    const item = asRecord(entry)
    const href = asString(item.href, MAX_HREF)
    if (!href) continue
    links.push({ text: asString(item.text, MAX_TEXT), href })
  }
  const forms: ScoutForm[] = []
  for (const entry of asArray(root.forms).slice(0, MAX_FORMS)) {
    const item = asRecord(entry)
    const fields = asArray(item.fields)
      .slice(0, MAX_FIELDS)
      .map((field) => {
        const record = asRecord(field)
        const name = asString(record.name, MAX_NAME)
        if (!name) return null
        const label = asString(record.label, MAX_LABEL)
        const placeholder = asString(record.placeholder, MAX_LABEL)
        const options = asArray(record.options)
          .slice(0, MAX_OPTIONS)
          .map((option) => asString(option, MAX_OPTION))
          .filter((option) => option.length > 0)
        return {
          name,
          type: asString(record.type, MAX_TYPE) || 'text',
          ...(label ? { label } : {}),
          ...(placeholder ? { placeholder } : {}),
          ...(options.length > 0 ? { options } : {})
        }
      })
      .filter(
        (
          field
        ): field is {
          name: string
          type: string
          label?: string
          placeholder?: string
          options?: string[]
        } => field !== null
      )
    const action = asString(item.action, MAX_HREF)
    forms.push({
      ...(action ? { action } : {}),
      fields,
      submitLabel: asString(item.submitLabel, MAX_LABEL)
    })
  }
  const buttons: ScoutButton[] = []
  for (const entry of asArray(root.buttons).slice(0, MAX_BUTTONS)) {
    const item = asRecord(entry)
    const label = asString(item.label, MAX_LABEL)
    const semid = asString(item.semid, MAX_SEMID)
    if (!label && !semid) continue
    buttons.push({ label, ...(semid ? { semid } : {}) })
  }
  const repeatsRaw = asRecord(root.repeats)
  const repeats =
    typeof repeatsRaw.listItems === 'number' || typeof repeatsRaw.cards === 'number'
      ? {
          listItems: clampCount(repeatsRaw.listItems),
          cards: clampCount(repeatsRaw.cards)
        }
      : undefined
  const candidate = {
    path,
    title: asString(root.title, MAX_TITLE),
    headings: asArray(root.headings)
      .slice(0, MAX_HEADINGS)
      .map((heading) => asString(heading, MAX_TEXT))
      .filter((heading) => heading.length > 0),
    links,
    forms,
    buttons,
    ...(repeats ? { repeats } : {})
  }
  const parsed = PageSummary.safeParse(candidate)
  if (parsed.success) return parsed.data
  return { path, title: '', headings: [], links: [], forms: [], buttons: [] }
}

export interface CrawlPlanArgs {
  /** Raw links extracted from the current page. */
  links: ReadonlyArray<{ href: string }>
  /** Scan origin; only same-origin http(s) targets are kept. */
  siteUrl: string
  /** Path of the page the links were extracted from (resolves relatives). */
  currentPath: string
  /** Paths already visited or queued; never re-planned. */
  seen: ReadonlySet<string> | ReadonlyArray<string>
  /** Remaining crawl budget; at most this many paths are returned. */
  limit: number
}

/**
 * Plan the next crawl paths from extracted links: same-origin http(s) only,
 * deduped against `seen` and within the batch, capped at `limit`.
 * Pure; query strings and fragments collapse to the pathname.
 */
export function planNextPaths({
  links,
  siteUrl,
  currentPath,
  seen,
  limit
}: CrawlPlanArgs): string[] {
  if (limit <= 0) return []
  let origin: string
  try {
    origin = new URL(siteUrl).origin
  } catch {
    return []
  }
  const known = seen instanceof Set ? seen : new Set(seen)
  const planned: string[] = []
  const base = `${siteUrl}${currentPath.startsWith('/') ? currentPath : `/${currentPath}`}`
  for (const link of links) {
    if (planned.length >= limit) break
    const href = link.href.trim()
    if (!href || href.startsWith('#')) continue
    let parsed: URL
    try {
      parsed = new URL(href, base)
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    if (parsed.origin !== origin) continue
    const path = parsed.pathname || '/'
    if (known.has(path) || planned.includes(path)) continue
    planned.push(path)
  }
  return planned
}
