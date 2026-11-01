import type {
  ActivityFeedback,
  ActivityItem,
  Opportunity,
  StoredActivityEvent
} from '../../shared/schemas'

export type TicketCategory = 'damaged' | 'wrong-size' | 'chargeback' | 'other'

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  damaged: 'damaged-shipment',
  'wrong-size': 'wrong-size',
  chargeback: 'bank chargeback',
  other: 'uncategorized'
}

/**
 * Deterministic ticket classification, shared by cluster building and rule
 * coverage so fixture and meta modes classify identically. Chargeback wins
 * first: money movement always needs the owner.
 */
export function classifyTicketText(text: string): TicketCategory {
  const value = text.toLowerCase()
  if (/chargeback|disput|bank/.test(value)) return 'chargeback'
  if (/damag|ding|crushed|cracked|torn|delaminat|broken/.test(value)) return 'damaged'
  if (/too small|too big|too short|too long|wrong size|size/.test(value)) return 'wrong-size'
  return 'other'
}

/** A published skill's decide-rule coverage, derived in the service. */
export interface SkillCoverage {
  skillId: string
  skillName: string
  /** Category → the owner's rule text covering it. */
  rulesByCategory: Partial<Record<TicketCategory, string>>
}

function isOpenTicketEvent(event: StoredActivityEvent, closed: Set<string>): boolean {
  return (
    event.entity === 'ticket' &&
    (event.type === 'ticket_opened' || event.type === 'ticket_created') &&
    (event.status === undefined || event.status === 'open') &&
    !closed.has(event.entityId)
  )
}

/** Tickets closed by any later event (stored snapshots can be stale). */
function closedTicketIds(events: StoredActivityEvent[]): Set<string> {
  const closed = new Set<string>()
  for (const event of events) {
    if (event.entity !== 'ticket') continue
    if (event.type === 'ticket_resolved') closed.add(event.entityId)
    if (event.type === 'ticket_status' && event.status === 'resolved') closed.add(event.entityId)
  }
  return closed
}

/**
 * Build the Now feed's opportunities from stored Saltbreak events.
 * Deterministic: cluster open tickets by category, match clusters to
 * published decide-rule skills, cite precedent from resolved events, and
 * drop clusters the owner dismissed (same signature = same membership).
 */
export function buildOpportunities(
  events: StoredActivityEvent[],
  coverage: SkillCoverage[],
  feedback: ActivityFeedback[]
): { needsYou: Opportunity[]; ready: Opportunity[] } {
  const dismissed = new Set(
    feedback.filter((f) => f.action === 'dismissed').map((f) => f.signature)
  )
  const closed = closedTicketIds(events)
  const groups = new Map<TicketCategory, string[]>()
  for (const event of events) {
    if (!isOpenTicketEvent(event, closed)) continue
    const category = classifyTicketText(`${event.subject ?? ''}`)
    const ids = groups.get(category) ?? []
    if (!ids.includes(event.entityId)) ids.push(event.entityId)
    groups.set(category, ids)
  }

  const resolved = events.filter(
    (event) => event.entity === 'ticket' && event.type === 'ticket_resolved'
  )
  const opportunities: Opportunity[] = []
  for (const [category, caseIds] of groups) {
    const sorted = [...caseIds].sort()
    const id = `${category}:${sorted.join(',')}`
    if (dismissed.has(id)) continue
    const skill = coverage.find((entry) => entry.rulesByCategory[category] !== undefined)
    const precedent = resolved.filter(
      (event) => classifyTicketText(`${event.subject ?? ''}`) === category
    )
    const rule = skill?.rulesByCategory[category]
    let because: string
    if (precedent.length > 0) {
      const latest = precedent[precedent.length - 1]
      because = `You resolved ${precedent.length} similar case${precedent.length === 1 ? '' : 's'} before — most recently ${latest?.entityId}${latest?.resolution ? ` (${latest.resolution})` : ''}.`
    } else if (rule) {
      because = `Your rules cover this: "${rule}"`
    } else if (category === 'chargeback') {
      because = 'No rule covers bank chargebacks, and money movement needs your judgment.'
    } else {
      because = 'No rule or skill covers this yet.'
    }
    opportunities.push({
      id,
      state: skill ? 'ready' : 'needs-you',
      title: `${sorted.length} ${CATEGORY_LABEL[category]} ticket${sorted.length === 1 ? '' : 's'}`,
      because,
      category,
      caseIds: sorted,
      ...(skill ? { skillId: skill.skillId, skillName: skill.skillName } : {})
    })
  }

  const ready = opportunities
    .filter((o) => o.state === 'ready')
    .sort((a, b) => b.caseIds.length - a.caseIds.length)
  const needsYou = opportunities
    .filter((o) => o.state !== 'ready')
    .sort((a, b) => {
      if (a.category === 'chargeback' && b.category !== 'chargeback') return -1
      if (b.category === 'chargeback' && a.category !== 'chargeback') return 1
      return b.caseIds.length - a.caseIds.length
    })
  return { needsYou, ready }
}

/** Recent-activity titles for Saltbreak events (newest last in, first out). */
export function saltbreakRecentItems(events: StoredActivityEvent[], limit = 8): ActivityItem[] {
  return [...events]
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map((event) => {
      const subject = event.subject ? ` — ${event.subject}` : ''
      let title: string
      if (event.type === 'ticket_resolved') {
        title = `${event.entityId} resolved${event.resolution ? ` (${event.resolution})` : ''}${subject}`
      } else if (event.type === 'ticket_opened' || event.type === 'ticket_created') {
        title = `${event.entityId} opened${subject}`
      } else if (event.type === 'order_placed') {
        title = `Order placed${subject}`
      } else {
        title = `${event.entity} ${event.type.replaceAll('_', ' ')}`
      }
      return {
        id: `sb-${event.id}`,
        source: 'saltbreak' as const,
        kind: event.type,
        title,
        entityId: event.entityId,
        at: event.at
      }
    })
}
