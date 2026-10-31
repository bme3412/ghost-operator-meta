import type { Recording, RecordingEvent, Suggestion, SuggestionEvidence } from '../../shared/schemas'

/** Demonstrated values are evidence, not secrets to echo: keep the head only. */
const VALUE_HEAD = 40

function redact(value: string): string {
  return value.length > VALUE_HEAD ? `${value.slice(0, VALUE_HEAD)}…` : value
}

/** FNV-1a over UTF-16 code units. Deterministic across runs and platforms. */
function hash32(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Stable suggestion id from site + title + evidence. Re-mining the same
 * recording yields the same ids, so refinish never duplicates suggestions.
 */
export function suggestionIdFor(
  siteId: string,
  title: string,
  evidence: SuggestionEvidence
): string {
  const basis = JSON.stringify({
    siteId,
    title,
    pages: [...evidence.pages].sort(),
    selectors: [...evidence.selectors].sort(),
    sourceRecordingId: evidence.sourceRecordingId
  })
  return `sug-${hash32(basis)}`
}

export interface MineOptions {
  /** createdAt supplier; defaults to the current time. */
  now?: () => string
  /**
   * Open review items for the recording. Defaults to a runtime `unresolved`
   * array on the recording when present (forward-compat; the Recording
   * schema itself carries no unresolved field).
   */
  unresolved?: string[]
}

function unresolvedFor(recording: Recording, options: MineOptions): string[] {
  if (options.unresolved) return options.unresolved
  const extra = (recording as Recording & { unresolved?: unknown }).unresolved
  return Array.isArray(extra) && extra.every((item): item is string => typeof item === 'string')
    ? extra
    : []
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => !!v))]
}

/** Pages touched by the recording (navigate values), for evidence. */
function pagesFor(events: RecordingEvent[]): string[] {
  return unique(events.filter((e) => e.type === 'navigate').map((e) => e.value))
}

function seqList(events: RecordingEvent[]): string {
  return events.map((e) => `#${e.sequence}`).join(', ')
}

interface Draft {
  title: string
  why: string
  selectors: string[]
}

/** Same record touched twice or more: the case-specific value wants a parameter. */
function parameterizeDrafts(events: RecordingEvent[]): Draft[] {
  const byIdentity = new Map<string, RecordingEvent[]>()
  for (const event of events) {
    if (!event.recordIdentity) continue
    const group = byIdentity.get(event.recordIdentity) ?? []
    group.push(event)
    byIdentity.set(event.recordIdentity, group)
  }
  const drafts: Draft[] = []
  for (const [identity, group] of byIdentity) {
    if (group.length < 2) continue
    drafts.push({
      title: `Parameterize ${identity} into a reusable skill`,
      why:
        `Record ${identity} appears in ${group.length} events (${seqList(group)}); ` +
        `teach it once with the record as an input instead of re-demonstrating per case.`,
      selectors: unique(group.map((e) => e.selector))
    })
  }
  return drafts
}

/** Committed field values followed by a submit: the whole submission is automatable. */
function submissionDraft(events: RecordingEvent[]): Draft | null {
  const fills = events.filter((e) => e.type === 'input_commit' || e.type === 'select')
  const submits = events.filter((e) => e.type === 'submit')
  if (fills.length === 0 || submits.length === 0) return null
  const shown = fills
    .slice(0, 3)
    .map((e) => `"${redact(e.value ?? e.targetLabel ?? e.semanticId ?? 'value')}"`)
    .join(', ')
  return {
    title: 'Automate this form submission',
    why:
      `${fills.length} field value(s) (${seqList(fills)}) flow into a submit ` +
      `(${seqList(submits)}), e.g. ${shown}; a skill could fill and submit from inputs.`,
    selectors: unique([...fills, ...submits].map((e) => e.selector))
  }
}

/** Three or more clicks in one demonstration: the flow wants a macro. */
function macroDraft(events: RecordingEvent[]): Draft | null {
  const clicks = events.filter((e) => e.type === 'click')
  if (clicks.length < 3) return null
  const labels = unique(clicks.map((e) => e.targetLabel ?? e.semanticId)).slice(0, 4)
  return {
    title: 'Turn this click flow into a macro',
    why:
      `${clicks.length} clicks (${seqList(clicks)})` +
      (labels.length > 0 ? ` across ${labels.map((l) => `"${redact(l)}"`).join(', ')}` : '') +
      `; replaying them beats re-clicking every case.`,
    selectors: unique(clicks.map((e) => e.selector))
  }
}

function unresolvedDraft(items: string[]): Draft | null {
  if (items.length === 0) return null
  const shown = items
    .slice(0, 3)
    .map((item) => `"${redact(item)}"`)
    .join('; ')
  return {
    title: `Resolve ${items.length} open item${items.length === 1 ? '' : 's'} from this recording`,
    why: `The recording still has open review items (${shown}${items.length > 3 ? '; …' : ''}); clearing them unblocks a clean skill.`,
    selectors: []
  }
}

/**
 * Pure heuristic miner: one Recording in, zero or more suggestions out.
 * DOM-free and deterministic (except `createdAt`, injectable via options).
 */
export function mineRecording(recording: Recording, options: MineOptions = {}): Suggestion[] {
  const now = options.now ?? (() => new Date().toISOString())
  const siteId = recording.applicationScope
  const pages = pagesFor(recording.events)
  const drafts: Draft[] = [...parameterizeDrafts(recording.events)]
  for (const maybe of [
    submissionDraft(recording.events),
    macroDraft(recording.events),
    unresolvedDraft(unresolvedFor(recording, options))
  ]) {
    if (maybe) drafts.push(maybe)
  }
  return drafts.map((draft) => {
    const evidence: SuggestionEvidence = {
      pages,
      selectors: draft.selectors,
      sourceRecordingId: recording.id
    }
    return {
      id: suggestionIdFor(siteId, draft.title, evidence),
      siteId,
      title: draft.title,
      why: draft.why,
      evidence,
      status: 'new',
      createdAt: now()
    }
  })
}
