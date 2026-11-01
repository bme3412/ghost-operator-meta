import { z } from 'zod'
import type {
  PageIdea,
  PageSummary,
  SiteMap,
  Suggestion
} from '../../shared/schemas'
import type { MetaEnv } from './meta'

const DEFAULT_BASE_URL = 'https://api.meta.ai/v1'
const DEFAULT_MODEL = 'muse-spark-1.3'

/** Heuristic suggestions forwarded to the model. */
export const SUGGEST_POLISH_MAX_SUGGESTIONS = 10
/** Scanned pages forwarded to the model. */
export const SUGGEST_POLISH_MAX_PAGES = 12
/** Per-page field caps so one huge page cannot crowd out the rest. */
export const SUGGEST_POLISH_MAX_HEADINGS = 8
export const SUGGEST_POLISH_MAX_LINKS = 10
export const SUGGEST_POLISH_MAX_FORMS = 4
export const SUGGEST_POLISH_MAX_FIELDS = 8
export const SUGGEST_POLISH_MAX_TITLE_CHARS = 160
export const SUGGEST_POLISH_MAX_WHY_CHARS = 500
/** Polished workflows kept from a model response. */
export const SUGGEST_POLISH_MAX_RESULTS = 10

/**
 * Site-agnostic system prompt for suggestion polish. It carries no
 * assumptions about which site was scanned: the site id, heuristic
 * suggestions, and page summaries arrive in the user message and are the
 * only allowed grounding. Anything uncertain becomes low confidence.
 */
export const META_SUGGEST_PROMPT = `You polish heuristic workflow suggestions for an arbitrary website into a ranked work list.
Output JSON only, matching this shape:
{"workflows": [{"title": string, "why": string, "evidencePages": string[], "confidence": one of high|medium|low}]}
Rules: merge suggestions that describe the same work into one entry; rank the rest by how automatable they are (concrete repeated flows first, vague reviews last).
Keep titles short, actionable verb phrases naming the outcome.
Only reference site ids, pages, and selectors that appear in the provided input; never invent pages, selectors, quantities, or identifiers.
Prefer marking an entry low confidence over guessing: when the evidence is thin, a page was never scanned, or the flow is unclear, keep the entry but set confidence to low and say what is missing in "why".`

export const SuggestedWorkflow = z.object({
  title: z.string().min(1),
  why: z.string().min(1),
  evidencePages: z.array(z.string()).default([]),
  confidence: z.enum(['high', 'medium', 'low'])
})
export type SuggestedWorkflow = z.infer<typeof SuggestedWorkflow>

export const SuggestedWorkflows = z.array(SuggestedWorkflow)
export type SuggestedWorkflows = z.infer<typeof SuggestedWorkflows>

/** Model envelope: chat JSON mode always yields an object, never a bare array. */
const SuggestedWorkflowsResponse = z.object({
  workflows: SuggestedWorkflows.default([])
})

/** One scanned page, slimmed to the fields the polish prompt consumes. */
export interface SuggestPolishPage {
  path: string
  title: string
  headings: string[]
  links: string[]
  forms: Array<{ fields: string[] }>
  buttons: number
}

export interface SuggestPolishSuggestion {
  title: string
  why: string
  evidencePages: string[]
}

export interface SuggestPolishInput {
  siteId: string
  suggestions: SuggestPolishSuggestion[]
  pages: SuggestPolishPage[]
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function summarizePage(page: PageSummary): SuggestPolishPage {
  return {
    path: page.path,
    title: truncate(page.title, SUGGEST_POLISH_MAX_TITLE_CHARS),
    headings: page.headings
      .slice(0, SUGGEST_POLISH_MAX_HEADINGS)
      .map((heading) => truncate(heading, SUGGEST_POLISH_MAX_TITLE_CHARS)),
    links: page.links.slice(0, SUGGEST_POLISH_MAX_LINKS).map((link) => link.href),
    forms: page.forms
      .slice(0, SUGGEST_POLISH_MAX_FORMS)
      .map((form) => ({
        fields: form.fields
          .slice(0, SUGGEST_POLISH_MAX_FIELDS)
          .map((field) => `${field.name} (${field.type})`)
      })),
    buttons: page.buttons.length
  }
}

/**
 * Pure input assembly: heuristic suggestions plus page summaries for one
 * site, each capped so the prompt stays bounded. Never throws on hostile
 * shapes — callers pass schema-parsed store rows.
 */
export function assembleSuggestInput(
  siteId: string,
  suggestions: Suggestion[],
  sitemap: SiteMap | null
): SuggestPolishInput {
  return {
    siteId,
    suggestions: suggestions
      .slice(0, SUGGEST_POLISH_MAX_SUGGESTIONS)
      .map((suggestion) => ({
        title: truncate(suggestion.title, SUGGEST_POLISH_MAX_TITLE_CHARS),
        why: truncate(suggestion.why, SUGGEST_POLISH_MAX_WHY_CHARS),
        evidencePages: [...suggestion.evidence.pages]
      })),
    pages: (sitemap?.pages ?? []).slice(0, SUGGEST_POLISH_MAX_PAGES).map(summarizePage)
  }
}

/** Render the assembled input as the chat user message. Pure. */
export function buildSuggestUserMessage(input: SuggestPolishInput): string {
  return [
    `Site id: ${input.siteId} (only reference this site id)`,
    'Heuristic suggestions:',
    ...input.suggestions.map(
      (suggestion, index) =>
        `${index + 1}. ${suggestion.title} — ${suggestion.why} ` +
        `[pages: ${suggestion.evidencePages.join(', ') || 'none'}]`
    ),
    'Scanned pages (path, title, structure):',
    ...input.pages.map((page) => JSON.stringify(page))
  ].join('\n')
}

/**
 * Meta provider adapter for suggestion polish. Uses the same
 * OpenAI-compatible chat endpoint, timeout, and error semantics as
 * generateMetaProposal; validates every response against the local
 * SuggestedWorkflows schema. Throws on transport or validation failures —
 * callers fall back to the heuristic list.
 */
export async function generateSuggestedWorkflows(
  input: SuggestPolishInput,
  env: MetaEnv = process.env
): Promise<SuggestedWorkflows> {
  const apiKey = env.MODEL_API_KEY
  if (!apiKey) {
    throw new Error('MODEL_API_KEY is not set; cannot polish suggestions with the Meta provider.')
  }
  const baseUrl = (env.META_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  const model = env.SPARK_MODEL ?? DEFAULT_MODEL

  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: META_SUGGEST_PROMPT },
          { role: 'user', content: buildSuggestUserMessage(input) }
        ]
      }),
      signal: AbortSignal.timeout(90_000)
    })
  } catch (error) {
    throw new Error(`Meta suggestion request failed: ${(error as Error).message}`)
  }
  if (!response.ok) {
    throw new Error(`Meta suggestion endpoint returned HTTP ${response.status}.`)
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = body.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Meta suggestion endpoint returned no message content.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Meta suggestion endpoint returned content that is not JSON.')
  }
  return SuggestedWorkflowsResponse.parse(parsed)
    .workflows.slice(0, SUGGEST_POLISH_MAX_RESULTS)
}

/** Page-idea caps so one huge page cannot crowd out the prompt. */
export const PAGE_IDEAS_MAX_HEADINGS = 10
export const PAGE_IDEAS_MAX_LINKS = 20
export const PAGE_IDEAS_MAX_FORMS = 4
export const PAGE_IDEAS_MAX_FIELDS = 8
export const PAGE_IDEAS_MAX_BUTTONS = 15
export const PAGE_IDEAS_MAX_HEURISTICS = 6
export const PAGE_IDEAS_MAX_RESULTS = 6
export const PAGE_IDEAS_MAX_TEXT_CHARS = 120

/**
 * Site-agnostic system prompt for page ideas. The page summary and the
 * heuristic ideas arrive in the user message and are the only allowed
 * grounding; citations must be exact visible texts from that input.
 */
export const META_PAGE_IDEAS_PROMPT = `You propose repeatable tasks a user would want automated on the current page of an arbitrary website.
Output JSON only, matching this shape:
{"ideas": [{"title": string, "why": string, "exampleInput": string or null, "cites": string[], "confidence": one of high|medium|low}]}
Rules: propose 3-6 concrete tasks; keep titles short, actionable verb phrases naming the outcome.
Cite only visible elements from the provided page summary, using their exact text; never invent elements, quantities, or identifiers.
Give a concrete exampleInput whenever the task takes one (a search term, an item name); otherwise use null.
Prefer marking an entry low confidence over guessing: when the evidence is thin or the flow needs a person (sign-in, payment), keep the entry but set confidence to low and say what is missing in "why".`

/** One model-proposed idea; the main process mints the stable id. */
export const PageIdeaDraft = z.object({
  title: z.string().min(1),
  why: z.string().min(1),
  exampleInput: z.string().min(1).nullable().default(null),
  cites: z.array(z.string()).default([]),
  confidence: z.enum(['high', 'medium', 'low'])
})
export type PageIdeaDraft = z.infer<typeof PageIdeaDraft>

/** Model envelope: chat JSON mode always yields an object, never a bare array. */
const PageIdeaDraftsResponse = z.object({
  ideas: z.array(PageIdeaDraft).default([])
})

/** One page form, slimmed to the fields the ideas prompt consumes. */
export interface PageIdeasForm {
  submit: string
  fields: string[]
}

export interface PageIdeasHeuristic {
  title: string
  why: string
}

export interface PageIdeasInput {
  siteName: string
  url: string
  path: string
  title: string
  headings: string[]
  links: string[]
  forms: PageIdeasForm[]
  buttons: string[]
  listItems: number
  cards: number
  heuristics: PageIdeasHeuristic[]
}

function describeField(field: {
  name: string
  type: string
  label?: string
  placeholder?: string
  options?: string[]
}): string {
  const seen = [field.label, field.placeholder, field.name].find((text) => text && text.length > 0)
  const base = `${seen ?? field.name} (${field.type})`
  if (!field.options || field.options.length === 0) return base
  return `${base} [options: ${field.options.join(' | ')}]`
}

/**
 * Pure input assembly: one live page plus the heuristic ideas mined from
 * it, each capped so the prompt stays bounded. Never throws on hostile
 * shapes — callers pass schema-parsed summaries.
 */
export function assemblePageIdeasInput(
  page: PageSummary,
  url: string,
  siteName: string,
  heuristics: PageIdea[]
): PageIdeasInput {
  return {
    siteName: truncate(siteName, PAGE_IDEAS_MAX_TEXT_CHARS),
    url: truncate(url, PAGE_IDEAS_MAX_TEXT_CHARS),
    path: page.path,
    title: truncate(page.title, PAGE_IDEAS_MAX_TEXT_CHARS),
    headings: page.headings
      .slice(0, PAGE_IDEAS_MAX_HEADINGS)
      .map((heading) => truncate(heading, PAGE_IDEAS_MAX_TEXT_CHARS)),
    links: page.links.slice(0, PAGE_IDEAS_MAX_LINKS).map((link) => {
      const text = truncate(link.text || '(no text)', PAGE_IDEAS_MAX_TEXT_CHARS)
      return `${text} -> ${truncate(link.href, PAGE_IDEAS_MAX_TEXT_CHARS)}`
    }),
    forms: page.forms.slice(0, PAGE_IDEAS_MAX_FORMS).map((form) => ({
      submit: truncate(form.submitLabel || '(no submit)', PAGE_IDEAS_MAX_TEXT_CHARS),
      fields: form.fields.slice(0, PAGE_IDEAS_MAX_FIELDS).map((field) => describeField(field))
    })),
    buttons: page.buttons
      .slice(0, PAGE_IDEAS_MAX_BUTTONS)
      .map((button) => truncate(button.label || button.semid || '(no label)', PAGE_IDEAS_MAX_TEXT_CHARS)),
    listItems: page.repeats?.listItems ?? 0,
    cards: page.repeats?.cards ?? 0,
    heuristics: heuristics.slice(0, PAGE_IDEAS_MAX_HEURISTICS).map((idea) => ({
      title: truncate(idea.title, PAGE_IDEAS_MAX_TEXT_CHARS),
      why: truncate(idea.why, SUGGEST_POLISH_MAX_WHY_CHARS)
    }))
  }
}

/** Render the assembled input as the chat user message. Pure. */
export function buildPageIdeasUserMessage(input: PageIdeasInput): string {
  return [
    `Site: ${input.siteName} (only reference this site)`,
    `Page: ${input.url} (path ${input.path}, title "${input.title}")`,
    `Headings: ${input.headings.join(' | ') || 'none'}`,
    `Links (text -> href): ${input.links.join(' | ') || 'none'}`,
    `Forms: ${input.forms.map((form) => `[submit: ${form.submit}; fields: ${form.fields.join(', ')}]`).join(' | ') || 'none'}`,
    `Buttons: ${input.buttons.join(' | ') || 'none'}`,
    `Repeated structure: ${input.listItems} list items, ${input.cards} card-like blocks.`,
    'Heuristic ideas (refine, merge, or replace these):',
    ...input.heuristics.map((idea, index) => `${index + 1}. ${idea.title} — ${idea.why}`)
  ].join('\n')
}

/**
 * Meta provider adapter for page ideas. Uses the same OpenAI-compatible
 * chat endpoint, timeout, and error semantics as generateSuggestedWorkflows;
 * validates every response against the local PageIdeaDraft schema. Throws
 * on transport or validation failures — callers fall back to the heuristic
 * list.
 */
export async function generatePageIdeas(
  input: PageIdeasInput,
  env: MetaEnv = process.env
): Promise<PageIdeaDraft[]> {
  const apiKey = env.MODEL_API_KEY
  if (!apiKey) {
    throw new Error('MODEL_API_KEY is not set; cannot generate page ideas with the Meta provider.')
  }
  const baseUrl = (env.META_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  const model = env.SPARK_MODEL ?? DEFAULT_MODEL

  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: META_PAGE_IDEAS_PROMPT },
          { role: 'user', content: buildPageIdeasUserMessage(input) }
        ]
      }),
      signal: AbortSignal.timeout(90_000)
    })
  } catch (error) {
    throw new Error(`Meta page-ideas request failed: ${(error as Error).message}`)
  }
  if (!response.ok) {
    throw new Error(`Meta page-ideas endpoint returned HTTP ${response.status}.`)
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = body.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Meta page-ideas endpoint returned no message content.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Meta page-ideas endpoint returned content that is not JSON.')
  }
  return PageIdeaDraftsResponse.parse(parsed).ideas.slice(0, PAGE_IDEAS_MAX_RESULTS)
}

export const META_RANK_PROMPT = `You rank business-work opportunities for a small-business owner.
Output JSON only, matching this shape:
{"ranked": [{"id": string, "because": string}]}
Rules: return every provided id exactly once, ordered by urgency and actionability (exceptions needing the owner and large covered batches first).
Rewrite "because" in one short sentence citing only the precedent provided; never invent cases, quantities, or rules, and never propose executing anything yourself.`

const OpportunityRankResponse = z.object({
  ranked: z.array(z.object({ id: z.string().min(1), because: z.string().min(1) })).default([])
})

export interface OpportunityRankEntry {
  id: string
  because: string
}

/**
 * Meta adapter for Now-feed ranking: reorder opportunities and rephrase
 * their precedent lines. Throws on any failure — the caller keeps the
 * deterministic order. The model never starts runs.
 */
export async function rankOpportunities(
  opportunities: Array<{ id: string; title: string; because: string; state: string; caseIds: string[] }>,
  env: MetaEnv = process.env
): Promise<OpportunityRankEntry[]> {
  const apiKey = env.MODEL_API_KEY
  if (!apiKey) {
    throw new Error('MODEL_API_KEY is not set; cannot rank opportunities with the Meta provider.')
  }
  const baseUrl = (env.META_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  const model = env.SPARK_MODEL ?? DEFAULT_MODEL
  const userMessage = opportunities
    .map(
      (o, index) =>
        `${index + 1}. id=${o.id} state=${o.state} cases=${o.caseIds.join(',')} title="${o.title}" because="${o.because}"`
    )
    .join('\n')

  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: META_RANK_PROMPT },
          { role: 'user', content: userMessage }
        ]
      }),
      signal: AbortSignal.timeout(90_000)
    })
  } catch (error) {
    throw new Error(`Meta ranking request failed: ${(error as Error).message}`)
  }
  if (!response.ok) {
    throw new Error(`Meta ranking endpoint returned HTTP ${response.status}.`)
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = body.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Meta ranking endpoint returned no message content.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Meta ranking endpoint returned content that is not JSON.')
  }
  return OpportunityRankResponse.parse(parsed).ranked
}
