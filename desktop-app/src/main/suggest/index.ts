import type {
  SiteMap,
  SuggestAcceptPrefill,
  SuggestPolishResult,
  Suggestion
} from '../../shared/schemas'
import type { MetaEnv } from '../providers/meta'
import {
  assembleSuggestInput,
  generateSuggestedWorkflows,
  type SuggestedWorkflow
} from '../providers/suggest'
import { loadState, saveState } from '../store'
import { getTargetInfo } from '../target'
import { suggestionIdFor } from './mine'

export { mineRecording, suggestionIdFor } from './mine'
export { mineSiteMap } from './sitemap'

function all(): Suggestion[] {
  return loadState().suggestions ?? []
}

/** List suggestions, newest last; optional site filter. */
export function listSuggestions(siteId?: string): Suggestion[] {
  const rows = all()
  return siteId === undefined ? rows : rows.filter((s) => s.siteId === siteId)
}

/**
 * Append mined suggestions, skipping ids already stored. Ids are stable
 * hashes of site + title + evidence, so re-mining never duplicates.
 * Returns the newly appended rows.
 */
export function appendMinedSuggestions(mined: Suggestion[]): Suggestion[] {
  const state = loadState()
  const existing = new Set((state.suggestions ?? []).map((s) => s.id))
  const fresh = mined.filter((s) => !existing.has(s.id))
  if (fresh.length > 0) {
    saveState({ ...state, suggestions: [...(state.suggestions ?? []), ...fresh] })
  }
  return fresh
}

function setStatus(id: string, status: Suggestion['status']): Suggestion {
  const state = loadState()
  const rows = state.suggestions ?? []
  const found = rows.find((s) => s.id === id)
  if (!found) throw new Error(`Unknown suggestion ${id}.`)
  const next: Suggestion = { ...found, status }
  saveState({ ...state, suggestions: rows.map((s) => (s.id === id ? next : s)) })
  return next
}

/** Dismiss a suggestion; it stays stored but leaves the 'new' queue. */
export function dismissSuggestion(id: string): Suggestion {
  return setStatus(id, 'dismissed')
}

/** Accept a suggestion and return the Teach-form prefill for it. */
export function acceptSuggestion(id: string): { suggestion: Suggestion; prefill: SuggestAcceptPrefill } {
  const suggestion = setStatus(id, 'accepted')
  return { suggestion, prefill: { goal: suggestion.title, siteId: suggestion.siteId } }
}

/** Persisted page graph for a site, if a scan has stored one. */
function siteMapFor(siteId: string): SiteMap | null {
  return loadState().siteMaps?.find((map) => map.siteId === siteId) ?? null
}

export interface PolishOptions {
  /** createdAt supplier; defaults to the current time. */
  now?: () => string
  /** Model credentials; defaults to the process environment. */
  env?: MetaEnv
}

/**
 * Rewrite the heuristic rows for a site through the Meta provider: merged,
 * ranked, and actionable (persisted, so Teach/Dismiss keep working).
 * Never throws: any failure — no key, transport, validation — resolves to
 * the heuristic rows unchanged plus a warning for the renderer.
 */
export async function listSuggestionsPolished(
  siteId?: string,
  options: PolishOptions = {}
): Promise<SuggestPolishResult> {
  let rows: Suggestion[]
  try {
    rows = listSuggestions(siteId)
  } catch (error) {
    return { suggestions: [], warning: `Could not load suggestions (${(error as Error).message}).` }
  }
  const env = options.env ?? process.env
  const apiKey = env.MODEL_API_KEY
  if (!apiKey || apiKey.trim() === '') {
    return { suggestions: rows, warning: 'MODEL_API_KEY is not set; showing heuristic suggestions.' }
  }
  try {
    const resolvedSite = siteId ?? getTargetInfo().id
    const input = assembleSuggestInput(resolvedSite, rows, siteMapFor(resolvedSite))
    const workflows = await generateSuggestedWorkflows(input, env)
    // Constrain evidence to pages the model was actually shown.
    const knownPages = new Set([
      ...input.pages.map((page) => page.path),
      ...input.suggestions.flatMap((suggestion) => suggestion.evidencePages)
    ])
    const now = options.now ?? (() => new Date().toISOString())
    const polished: Suggestion[] = workflows.map((workflow: SuggestedWorkflow) => {
      const evidence = {
        pages: workflow.evidencePages.filter((page) => knownPages.has(page)),
        selectors: [] as string[],
        sourceRecordingId: null as string | null
      }
      return {
        id: suggestionIdFor(resolvedSite, workflow.title, evidence),
        siteId: resolvedSite,
        title: workflow.title,
        why: `${workflow.why} (AI polish confidence: ${workflow.confidence})`,
        evidence,
        status: 'new' as const,
        createdAt: now()
      }
    })
    appendMinedSuggestions(polished)
    return { suggestions: polished, warning: null }
  } catch (error) {
    return {
      suggestions: rows,
      warning: `AI polish failed (${(error as Error).message}); showing heuristic suggestions.`
    }
  }
}
