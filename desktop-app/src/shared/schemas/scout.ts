import { z } from 'zod'

/** A link captured from a scanned page. href is raw (absolute or relative). */
export const ScoutLink = z.object({
  text: z.string(),
  href: z.string()
})
export type ScoutLink = z.infer<typeof ScoutLink>

export const ScoutFormField = z.object({
  name: z.string(),
  type: z.string(),
  label: z.string().optional(),
  /** Visible placeholder text, when the page provides one. */
  placeholder: z.string().optional(),
  /** Visible <select> option labels, capped by the snippet. */
  options: z.array(z.string()).optional()
})
export type ScoutFormField = z.infer<typeof ScoutFormField>

export const ScoutForm = z.object({
  action: z.string().optional(),
  fields: z.array(ScoutFormField).default([]),
  submitLabel: z.string().default('')
})
export type ScoutForm = z.infer<typeof ScoutForm>

export const ScoutButton = z.object({
  label: z.string(),
  semid: z.string().optional()
})
export type ScoutButton = z.infer<typeof ScoutButton>

/**
 * Capped counts of repeated page structure: list items and card-like
 * blocks. A rough "this page lists many similar things" signal for
 * idea mining; older scans omit it.
 */
export const PageRepeats = z.object({
  listItems: z.number(),
  cards: z.number()
})
export type PageRepeats = z.infer<typeof PageRepeats>

/** One crawled page: its path plus the extracted structure. */
export const PageSummary = z.object({
  path: z.string().min(1),
  title: z.string().default(''),
  headings: z.array(z.string()).default([]),
  links: z.array(ScoutLink).default([]),
  forms: z.array(ScoutForm).default([]),
  buttons: z.array(ScoutButton).default([]),
  repeats: PageRepeats.optional()
})
export type PageSummary = z.infer<typeof PageSummary>

/** Persisted per-site page graph from one scan. */
export const SiteMap = z.object({
  siteId: z.string().min(1),
  scannedAt: z.string().min(1),
  pages: z.array(PageSummary).default([])
})
export type SiteMap = z.infer<typeof SiteMap>

/** scout:start accepts an optional site id; omitted means the current site. */
export const ScoutStartRequest = z.object({
  siteId: z.string().min(1).optional()
})
export type ScoutStartRequest = z.infer<typeof ScoutStartRequest>

export type ScoutTerminalStatus = 'done' | 'cancelled' | 'failed'

/** Payload of the ghost:scout-progress push event. */
export interface ScoutProgress {
  siteId: string
  status: 'running' | ScoutTerminalStatus
  pagesDone: number
  pagesTotal: number
  currentPath: string
  error?: string
}

/** scout:status result: live progress plus the persisted map, if any. */
export interface ScoutStatus {
  running: boolean
  siteId: string
  progress: ScoutProgress | null
  sitemap: SiteMap | null
}
