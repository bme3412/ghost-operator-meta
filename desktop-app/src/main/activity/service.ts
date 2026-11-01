import {
  ActivityResponse,
  type ActivityFeed,
  type ActivityItem,
  type SaltbreakEvent,
  type StoredActivityEvent
} from '../../shared/schemas'
import { parseRule } from '../providers/decide'
import { rankOpportunities } from '../providers/suggest'
import { getActiveVersion, listSkills } from '../skills'
import { listBatches, listRuns, loadState, saveState } from '../store'
import { getTargetInfo } from '../target'
import {
  buildOpportunities,
  classifyTicketText,
  saltbreakRecentItems,
  type SkillCoverage,
  type TicketCategory
} from './engine'

const MAX_STORED_EVENTS = 300

/** Test seam: replaces global fetch for the activity connector. */
let fetcher: typeof fetch = (...args) => fetch(...args)
export function setActivityFetcher(next: typeof fetch): void {
  fetcher = next
}

function toStored(event: SaltbreakEvent): StoredActivityEvent {
  return {
    id: event.id,
    type: event.type,
    entity: event.entity,
    entityId: event.entityId,
    subject: event.ticket?.subject ?? (typeof event.data.subject === 'string' ? event.data.subject : undefined),
    status:
      event.ticket?.status ??
      (event.type === 'ticket_status' && typeof event.data.to === 'string' ? event.data.to : undefined),
    resolution: event.ticket?.resolution ?? null,
    at: event.createdAt
  }
}

/**
 * Pull new events from the target's read-only /api/activity connector and
 * advance the persisted cursor. Best-effort: unreachable or non-Saltbreak
 * targets simply leave the stored events untouched.
 */
export async function refreshActivity(): Promise<number> {
  const state = loadState()
  const cursor = state.activityCursor ?? 0
  let events: SaltbreakEvent[]
  try {
    const url = `${getTargetInfo().url.replace(/\/$/, '')}/api/activity?since=${cursor}`
    const response = await fetcher(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return 0
    events = ActivityResponse.parse(await response.json()).events
  } catch {
    return 0
  }
  if (events.length === 0) return 0
  const byId = new Map((state.activityEvents ?? []).map((event) => [event.id, event]))
  for (const event of events.map(toStored)) byId.set(event.id, event)
  const stored = [...byId.values()].sort((a, b) => a.id - b.id).slice(-MAX_STORED_EVENTS)
  saveState({
    ...loadState(),
    activityEvents: stored,
    activityCursor: Math.max(cursor, ...events.map((event) => event.id))
  })
  return events.length
}

/** Decide-rule coverage per published skill, for cluster matching. */
export function skillCoverage(): SkillCoverage[] {
  const coverage: SkillCoverage[] = []
  for (const summary of listSkills()) {
    if (summary.activeVersion === null) continue
    const record = getActiveVersion(summary.id)
    if (!record) continue
    const rulesByCategory: Partial<Record<TicketCategory, string>> = {}
    for (const step of record.recipe.steps) {
      if (step.kind !== 'decide' || !step.rules) continue
      for (const rule of step.rules) {
        const parsed = parseRule(rule, step.options ?? null)
        if (!parsed) continue
        const category = classifyTicketText(parsed.condition)
        if (category !== 'other' && rulesByCategory[category] === undefined) {
          rulesByCategory[category] = rule
        }
      }
    }
    if (Object.keys(rulesByCategory).length > 0) {
      coverage.push({ skillId: summary.id, skillName: summary.name, rulesByCategory })
    }
  }
  return coverage
}

function ghostRecentItems(): ActivityItem[] {
  const names = new Map(listSkills().map((skill) => [skill.id, skill.name]))
  const items: ActivityItem[] = []
  for (const batch of listBatches()) {
    if (batch.status !== 'done') continue
    const resolved = batch.items.filter((item) => item.status === 'succeeded').length
    const needs = batch.items.filter((item) => item.status === 'escalated').length
    items.push({
      id: `batch-${batch.id}`,
      source: 'ghost',
      kind: 'batch',
      title: `${batch.skillName} batch finished — ${resolved} resolved${needs > 0 ? `, ${needs} need${needs === 1 ? 's' : ''} you` : ''}`,
      at: batch.endedAt ?? batch.startedAt
    })
  }
  for (const run of listRuns().slice(-5)) {
    items.push({
      id: `run-${run.id}`,
      source: 'ghost',
      kind: 'run',
      title: `Ran ${names.get(run.skillId) ?? 'a skill'} — ${run.status}`,
      entityId: run.inputs?.ticketId,
      at: run.startedAt
    })
  }
  return items
}

/**
 * The deterministic Now feed. When a model key is configured, Muse for SMB may
 * re-rank and rephrase the opportunities; any failure keeps the
 * deterministic feed plus a warning. The model never starts runs.
 */
export async function getActivityFeed(): Promise<ActivityFeed> {
  await refreshActivity()
  const state = loadState()
  const events = state.activityEvents ?? []
  const feedback = state.activityFeedback ?? []
  const { needsYou, ready } = buildOpportunities(events, skillCoverage(), feedback)
  const recent = [...saltbreakRecentItems(events), ...ghostRecentItems()]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 10)

  let warning: string | null = null
  const all = [...needsYou, ...ready]
  if (all.length > 0 && process.env.MODEL_API_KEY) {
    try {
      const ranked = await rankOpportunities(all)
      const byId = new Map(all.map((o) => [o.id, o]))
      const phrases = new Map(ranked.map((entry) => [entry.id, entry.because]))
      const apply = (list: typeof all): typeof all =>
        list
          .map((o) => (phrases.get(o.id) ? { ...o, because: phrases.get(o.id) ?? o.because } : o))
          .sort((a, b) => {
            const order = ranked.map((entry) => entry.id)
            return order.indexOf(a.id) - order.indexOf(b.id)
          })
      const rankedAll = apply(all).filter((o) => byId.has(o.id))
      return {
        needsYou: rankedAll.filter((o) => o.state !== 'ready'),
        ready: rankedAll.filter((o) => o.state === 'ready'),
        recent,
        warning
      }
    } catch (error) {
      warning = `AI ranking failed (${(error as Error).message}); showing the grounded order.`
    }
  }
  return { needsYou, ready, recent, warning }
}

export function dismissOpportunity(signature: string): void {
  const state = loadState()
  const feedback = (state.activityFeedback ?? []).filter((f) => f.signature !== signature)
  feedback.push({ signature, action: 'dismissed', at: new Date().toISOString() })
  saveState({ ...state, activityFeedback: feedback })
}

export function actOnOpportunity(signature: string): void {
  const state = loadState()
  const feedback = (state.activityFeedback ?? []).filter(
    (f) => !(f.signature === signature && f.action === 'dismissed')
  )
  feedback.push({ signature, action: 'acted', at: new Date().toISOString() })
  saveState({ ...state, activityFeedback: feedback })
}
