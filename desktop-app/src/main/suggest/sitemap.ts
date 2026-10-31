/**
 * Site-mode miner: one SiteMap in, zero or more suggestions out.
 * Pure and deterministic (except `createdAt`, injectable via options).
 */
import { scoutHrefPath } from '../../shared/scout'
import type {
  SiteMap,
  Suggestion,
  SuggestionEvidence
} from '../../shared/schemas'
import { suggestionIdFor, type MineOptions } from './mine'

/** Parent segments that smell like a record queue (tickets, orders, ...). */
const LIST_SEGMENT = /(ticket|order|case|inbox|item|product|user|customer|lead|issue)s?$/i

/** Values safe to interpolate into a [name="..."] / [data-semid="..."] selector. */
const SAFE_SELECTOR_VALUE = /^[A-Za-z0-9_.:|#-]+$/

function parentOf(path: string): string {
  const trimmed = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path
  const index = trimmed.lastIndexOf('/')
  return index <= 0 ? '/' : trimmed.slice(0, index)
}

function leafOf(path: string): string {
  const trimmed = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path
  const index = trimmed.lastIndexOf('/')
  return index < 0 ? trimmed : trimmed.slice(index + 1)
}

function lastSegment(path: string): string {
  return leafOf(path)
}

function fieldSelector(name: string): string | null {
  return SAFE_SELECTOR_VALUE.test(name) ? `[name="${name}"]` : null
}

function semidSelector(semid: string): string | null {
  return SAFE_SELECTOR_VALUE.test(semid) ? `[data-semid="${semid}"]` : null
}

interface Draft {
  title: string
  why: string
  pages: string[]
  selectors: string[]
}

/** Every page exposing a form is a submission-automation candidate. */
function formDrafts(sitemap: SiteMap): Draft[] {
  const drafts: Draft[] = []
  for (const page of sitemap.pages) {
    if (page.forms.length === 0) continue
    const fields = page.forms.flatMap((form) => form.fields)
    const selectors: string[] = []
    for (const field of fields) {
      const selector = fieldSelector(field.name)
      if (selector && !selectors.includes(selector)) selectors.push(selector)
    }
    for (const button of page.buttons) {
      if (!button.semid) continue
      const selector = semidSelector(button.semid)
      if (selector && !selectors.includes(selector)) selectors.push(selector)
    }
    const shown = fields
      .slice(0, 4)
      .map((field) => `${field.name} (${field.type})`)
      .join(', ')
    const formNoun = page.forms.length === 1 ? 'form' : 'forms'
    const fieldNoun = fields.length === 1 ? 'field' : 'fields'
    drafts.push({
      title: `Automate submission on ${page.path}`,
      why:
        `Page ${page.path}${page.title ? ` ("${page.title}")` : ''} exposes ` +
        `${page.forms.length} ${formNoun} with ${fields.length} ${fieldNoun}` +
        (shown ? ` (${shown}${fields.length > 4 ? '; …' : ''})` : '') +
        `; a skill could fill and submit from inputs.`,
      pages: [page.path],
      selectors
    })
  }
  return drafts
}

/** A list page linking several record-like detail pages wants a review flow. */
function listDrafts(sitemap: SiteMap): Draft[] {
  const byParent = new Map<string, { lists: string[]; details: string[] }>()
  for (const page of sitemap.pages) {
    for (const link of page.links) {
      const target = scoutHrefPath(link.href, page.path)
      if (!target || target === page.path) continue
      const leaf = leafOf(target)
      if (!leaf) continue
      const parent = parentOf(target)
      const group = byParent.get(parent) ?? { lists: [], details: [] }
      if (!group.lists.includes(page.path)) group.lists.push(page.path)
      if (!group.details.includes(target)) group.details.push(target)
      byParent.set(parent, group)
    }
  }
  const drafts: Draft[] = []
  for (const [parent, group] of byParent) {
    const strongList = LIST_SEGMENT.test(lastSegment(parent)) && group.details.length >= 2
    const genericList =
      group.details.length >= 3 && group.details.every((detail) => /\d/.test(leafOf(detail)))
    if (!strongList && !genericList) continue
    const sample = group.details[0] as string
    const listNoun = group.lists.length === 1 ? 'page links' : 'pages link'
    drafts.push({
      title: `Review the ${parent} list end to end`,
      why:
        `${group.lists.length} list ${listNoun} ${group.details.length} records under ` +
        `${parent} (e.g. ${sample}, from ${group.lists[0]}); ` +
        `a skill could walk the queue instead of opening each record by hand.`,
      pages: [group.lists[0] as string, ...group.details.slice(0, 3)],
      selectors: []
    })
  }
  return drafts
}

export function mineSiteMap(sitemap: SiteMap, options: MineOptions = {}): Suggestion[] {
  const now = options.now ?? (() => new Date().toISOString())
  const drafts: Draft[] = [...formDrafts(sitemap), ...listDrafts(sitemap)]
  return drafts.map((draft) => {
    const evidence: SuggestionEvidence = {
      pages: draft.pages,
      selectors: draft.selectors,
      sourceRecordingId: null
    }
    return {
      id: suggestionIdFor(sitemap.siteId, draft.title, evidence),
      siteId: sitemap.siteId,
      title: draft.title,
      why: draft.why,
      evidence,
      status: 'new',
      createdAt: now()
    }
  })
}
