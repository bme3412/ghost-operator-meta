import type {
  PageIdea,
  PageIdeasResult,
  PageSummary,
  ScoutForm
} from '../../shared/schemas'
import type { SiteProfile } from '../../shared/target'
import type { MetaEnv } from '../providers/meta'
import { assemblePageIdeasInput, generatePageIdeas } from '../providers/suggest'
import { normalizePageExtract, pageExtractSnippet } from '../scout/extract'
import { getWindow } from '../windows/registry'

/** Isolated world for live-page extraction; the page cannot see or spoof it. */
const PAGE_WORLD_ID = 1338

/** Ideas kept per page; the panel renders 3-6 rows. */
const MAX_IDEAS = 6
const MAX_BROWSE_IDEAS = 3
const MAX_FORM_IDEAS = 2
/** Detail-like links sharing a parent path before the page reads as a listing. */
const MIN_LISTING_GROUP = 4
/** Per-URL memory cache bound; entries are never persisted. */
const MAX_CACHE_URLS = 20

const SEARCH_FIELD = /search|query|keyword|find/i
const HUMAN_STEP = /sign\s?in|log\s?in|login|register|sign\s?up|password|checkout|check\s?out|place\s?order|payment/i
const WATCHLIST_BUTTON = /watch\s?list|save for later|favorite|favourite|bookmark/i
const BUY_BUTTON = /buy it now|add to (cart|bag|basket)|make offer|place bid/i
const CHROME_TEXT =
  /^(home|sign in|log in|login|register|sign up|cart|checkout|search|help|contact|about|account|settings|sign out)$/i
const CHROME_HINT = /help|contact us|privacy|terms|cookie|about us|sitemap/i

export interface CurrentPage {
  url: string
  path: string
  page: PageSummary
}

/**
 * Read the live target page in an isolated world, using the same snippet
 * and normalization as the scout scan. Throws when the target window is
 * missing or showing a non-http(s) page (offline page, blank document).
 */
export async function readCurrentPage(): Promise<CurrentPage> {
  const target = getWindow('target')
  if (!target || target.isDestroyed()) {
    throw new Error('Target window is not available.')
  }
  const contents = target.webContents
  const url = contents.getURL()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Target page is not readable right now.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Target page is not readable right now.')
  }
  const path = parsed.pathname || '/'
  let raw: unknown
  try {
    raw = await contents.executeJavaScriptInIsolatedWorld(PAGE_WORLD_ID, [
      { code: pageExtractSnippet() }
    ])
  } catch (error) {
    throw new Error(`Target page query failed: ${(error as Error).message}`)
  }
  // A single script resolves to its value; tolerate an array shape too.
  const value = Array.isArray(raw) ? raw[0] : raw
  return { url, path, page: normalizePageExtract(value, path) }
}

function slug(text: string, fallback: string): string {
  const slim = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slim.length > 0 ? slim : fallback
}

interface IdeaDraft {
  title: string
  why: string
  exampleInput?: string
  cites: string[]
  confidence: PageIdea['confidence']
}

function withIds(drafts: IdeaDraft[]): PageIdea[] {
  const seen = new Set<string>()
  return drafts.map((draft, index) => {
    let id = `page-${slug(draft.title, `idea-${index}`)}`
    for (let attempt = 1; seen.has(id); attempt += 1) {
      id = `page-${slug(draft.title, `idea-${index}`)}-${attempt}`
    }
    seen.add(id)
    return { id, ...draft }
  })
}

function fieldSeen(field: { name: string; label?: string; placeholder?: string }): string {
  return field.label || field.placeholder || field.name
}

function humanStepNote(texts: string[]): string {
  return texts.some((text) => HUMAN_STEP.test(text))
    ? ' Needs a human step: it touches sign-in or checkout.'
    : ''
}

function searchForm(forms: ScoutForm[]): ScoutForm | undefined {
  return forms.find((form) =>
    form.fields.some(
      (field) =>
        field.type === 'search' ||
        SEARCH_FIELD.test(field.name) ||
        SEARCH_FIELD.test(field.label ?? '') ||
        SEARCH_FIELD.test(field.placeholder ?? '')
    )
  )
}

function searchIdea(form: ScoutForm, site: SiteProfile): IdeaDraft {
  const field = form.fields.find(
    (candidate) =>
      candidate.type === 'search' ||
      SEARCH_FIELD.test(candidate.name) ||
      SEARCH_FIELD.test(candidate.label ?? '') ||
      SEARCH_FIELD.test(candidate.placeholder ?? '')
  )
  const seen = field ? fieldSeen(field) : 'search'
  const options = form.fields
    .flatMap((candidate) => candidate.options ?? [])
    .filter((option) => !/^all\b/i.test(option))
    .slice(0, 3)
  return {
    title: `Search ${site.name} for an item and collect the top results (title, price, link)`,
    why:
      `The page has a search field ("${seen}").` +
      (options.length > 0 ? ` Category filter offers: ${options.join(', ')}.` : ''),
    exampleInput: 'vintage film camera',
    cites: [`Search box "${seen}"`],
    confidence: 'high'
  }
}

function browseIdeas(page: PageSummary): IdeaDraft[] {
  const ideas: IdeaDraft[] = []
  const seen = new Set<string>()
  for (const link of page.links) {
    if (ideas.length >= MAX_BROWSE_IDEAS) break
    const text = link.text.trim()
    if (text.length < 2 || text.length > 30) continue
    // Category and nav labels are short; sentences are page content.
    if (text.split(/\s+/).length > 3) continue
    if (/\d/.test(text)) continue
    const key = text.toLowerCase()
    if (seen.has(key) || CHROME_TEXT.test(text) || CHROME_HINT.test(text)) continue
    seen.add(key)
    const href = link.href.length > 80 ? `${link.href.slice(0, 80)}…` : link.href
    ideas.push({
      title: `Browse ${text} and list new items`,
      why: `Link "${text}" on this page points at ${href}.`,
      cites: [text],
      confidence: 'medium'
    })
  }
  return ideas
}

function parentOf(href: string): string | null {
  const cut = href.split(/[?#]/)[0] ?? ''
  const slash = cut.lastIndexOf('/')
  if (slash <= 0) return null
  return cut.slice(0, slash)
}

function listingIdea(page: PageSummary): IdeaDraft | null {
  const groups = new Map<string, string[]>()
  for (const link of page.links) {
    const parent = parentOf(link.href)
    if (!parent) continue
    const group = groups.get(parent) ?? []
    if (!group.includes(link.href)) group.push(link.href)
    groups.set(parent, group)
  }
  let best: { parent: string; hrefs: string[] } | null = null
  for (const [parent, hrefs] of groups) {
    if (hrefs.length >= MIN_LISTING_GROUP && (!best || hrefs.length > best.hrefs.length)) {
      best = { parent, hrefs }
    }
  }
  if (!best) return null
  const example = best.hrefs[0] ?? ''
  const repeats = page.repeats
  const repeatNote =
    repeats && (repeats.listItems > 0 || repeats.cards > 0)
      ? ` The page shows ${repeats.listItems} list items and ${repeats.cards} card-like blocks.`
      : ''
  return {
    title: 'Open each listing and extract its details',
    why: `${best.hrefs.length} links share "${best.parent}" (e.g. "${example}").${repeatNote}`,
    cites: [best.parent],
    confidence: 'medium'
  }
}

function detailIdeas(page: PageSummary): IdeaDraft[] {
  const ideas: IdeaDraft[] = []
  const labels = page.buttons.map((button) => button.label).filter((label) => label.length > 0)
  const watch = labels.find((label) => WATCHLIST_BUTTON.test(label))
  if (watch) {
    ideas.push({
      title: 'Add this item to your watchlist',
      why: `Button "${watch}" on this item page.${humanStepNote([watch])}`,
      cites: [watch],
      confidence: 'high'
    })
  }
  const buy = labels.find((label) => BUY_BUTTON.test(label))
  if (buy) {
    ideas.push({
      title: 'Check price and shipping for an item',
      why: `Item controls ("${buy}") are on this page; record price, shipping, and availability.${humanStepNote([buy])}`,
      cites: [buy],
      confidence: 'high'
    })
  }
  // A sign-in/checkout surface with no other match still surfaces — flagged
  // as needing a person, never hidden.
  if (ideas.length === 0) {
    const gate = labels.find((label) => HUMAN_STEP.test(label))
    if (gate) {
      ideas.push({
        title: `Complete "${gate}" with human help`,
        why: `"${gate}" needs credentials only a person has — Ghost can drive to it, you complete the step.`,
        cites: [gate],
        confidence: 'low'
      })
    }
  }
  return ideas
}

function formIdeas(page: PageSummary, skip: ScoutForm | undefined): IdeaDraft[] {
  const ideas: IdeaDraft[] = []
  for (const form of page.forms) {
    if (ideas.length >= MAX_FORM_IDEAS) break
    if (skip && form === skip) continue
    const names = form.fields.map(fieldSeen).filter((name) => name.length > 0)
    const label =
      form.submitLabel || names[0] || form.action || 'form'
    ideas.push({
      title: `Fill and submit ${label}`,
      why:
        `Form${form.action ? ` (${form.action})` : ''} with fields: ${names.slice(0, 4).join(', ') || 'none'}.` +
        humanStepNote([form.submitLabel, form.action ?? '', ...names]),
      cites: form.submitLabel ? [form.submitLabel] : names.slice(0, 1),
      confidence: 'medium'
    })
  }
  return ideas
}

/**
 * Mine automatable-task ideas from one live page. Pure and total: every
 * rule reads only the given summary, and sparse pages yield few or no
 * ideas rather than invented ones.
 */
export function minePage(page: PageSummary, site: SiteProfile): PageIdea[] {
  const found = searchForm(page.forms)
  const listing = listingIdea(page)
  const drafts: IdeaDraft[] = [
    ...(found ? [searchIdea(found, site)] : []),
    ...detailIdeas(page),
    ...(listing ? [listing] : []),
    ...browseIdeas(page),
    ...formIdeas(page, found)
  ]
  return withIds(drafts.slice(0, MAX_IDEAS))
}

/** Visible texts an AI citation may reference, normalized for comparison. */
function visibleTexts(page: PageSummary): Set<string> {
  const normalize = (text: string): string =>
    text.trim().toLowerCase().replace(/^["'“”]+|["'“”]+$/g, '')
  const texts = new Set<string>()
  for (const heading of page.headings) texts.add(normalize(heading))
  for (const link of page.links) {
    if (link.text.trim()) texts.add(normalize(link.text))
  }
  for (const form of page.forms) {
    if (form.submitLabel.trim()) texts.add(normalize(form.submitLabel))
    for (const field of form.fields) {
      for (const text of [field.label, field.placeholder, ...(field.options ?? [])]) {
        if (text && text.trim()) texts.add(normalize(text))
      }
    }
  }
  for (const button of page.buttons) {
    if (button.label.trim()) texts.add(normalize(button.label))
  }
  texts.delete('')
  return texts
}

export interface PageIdeasInput {
  url: string
  path: string
  page: PageSummary
  site: SiteProfile
}

export interface PageIdeasOptions {
  /** Model credentials; defaults to the process environment. */
  env?: MetaEnv
  /** Bypass the per-URL memory cache and recompute. */
  refresh?: boolean
  /** Return the heuristic list immediately, skipping the model call. */
  fast?: boolean
}

const cache = new Map<string, PageIdeasResult>()

function cacheSet(url: string, result: PageIdeasResult): void {
  cache.set(url, result)
  while (cache.size > MAX_CACHE_URLS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** Drop the per-URL memory cache (tests; the Refresh button uses refresh). */
export function clearPageIdeasCache(): void {
  cache.clear()
}

/**
 * Ideas for the live page: heuristics always, refined by the Meta provider
 * when a key is set. Never throws for model failures — those resolve to
 * the heuristic list plus a warning, like listSuggestionsPolished. Only
 * AI and no-key results are cached; transient failures retry on the next
 * fetch. The fast path skips the model and never caches.
 */
export async function getPageIdeas(
  input: PageIdeasInput,
  options: PageIdeasOptions = {}
): Promise<PageIdeasResult> {
  const head = { url: input.url, path: input.path, title: input.page.title }
  if (!options.refresh) {
    const hit = cache.get(input.url)
    if (hit) return hit
  }
  const heuristic = minePage(input.page, input.site)
  if (options.fast) {
    return { page: head, ideas: heuristic, source: 'heuristic', warning: null }
  }
  const env = options.env ?? process.env
  if (!env.MODEL_API_KEY || env.MODEL_API_KEY.trim() === '') {
    const result: PageIdeasResult = {
      page: head,
      ideas: heuristic,
      source: 'heuristic',
      warning: 'MODEL_API_KEY is not set; showing heuristic ideas.'
    }
    cacheSet(input.url, result)
    return result
  }
  try {
    const drafts = await generatePageIdeas(
      assemblePageIdeasInput(input.page, input.url, input.site.name, heuristic),
      env
    )
    if (drafts.length === 0) {
      throw new Error('the model returned no ideas')
    }
    const known = visibleTexts(input.page)
    const normalize = (text: string): string =>
      text.trim().toLowerCase().replace(/^["'“”]+|["'“”]+$/g, '')
    const ideas = withIds(
      drafts.map((draft) => ({
        title: draft.title,
        why: draft.why,
        ...(draft.exampleInput ? { exampleInput: draft.exampleInput } : {}),
        cites: draft.cites.filter((cite) => known.has(normalize(cite))),
        confidence: draft.confidence
      }))
    )
    const result: PageIdeasResult = { page: head, ideas, source: 'ai', warning: null }
    cacheSet(input.url, result)
    return result
  } catch (error) {
    return {
      page: head,
      ideas: heuristic,
      source: 'heuristic',
      warning: `AI ideas failed (${(error as Error).message}); showing heuristic ideas.`
    }
  }
}
