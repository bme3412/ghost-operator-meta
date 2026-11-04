import { z } from 'zod'
import type { ProviderId } from '../../shared/schemas'
import { ESCALATE } from '../../shared/schemas/run'

export interface DecideRequest {
  goal: string
  /** The demonstrator's rules, verbatim. */
  rules: string[]
  /** Allowed choices; escalation is always allowed on top of these. */
  options: string[]
  /** The case as read from the live page. */
  text: string
}

export interface Decision {
  choice: string
  /** The rule applied, quoted verbatim from the request; null when escalating. */
  rule: string | null
  reason: string
}

export interface DecideEnv {
  META_BASE_URL?: string
  MODEL_API_KEY?: string
  SPARK_MODEL?: string
}

/** Words that mark a case as outside any routine rule, whatever else it says. */
const RED_FLAGS = [
  'chargeback',
  'dispute',
  'disputing',
  'fraud',
  'lawyer',
  'attorney',
  'do not recognize',
  "don't recognize",
  'unauthorized'
]

/** Plain-language conditions widened to the words customers actually use. */
const SYNONYMS: Array<[RegExp, string[]]> = [
  [
    /damag|broke|shipping|transit|arriv/,
    [
      'damaged',
      'damage',
      'ding',
      'crack',
      'torn',
      'ripped',
      'broken',
      'broke',
      'delaminat',
      'dent',
      'crushed',
      'in transit',
      'in shipping'
    ]
  ],
  [
    /size|fit|small|big|short|long/,
    [
      'wrong size',
      'too small',
      'too big',
      'too large',
      'too short',
      'too long',
      "doesn't fit",
      'does not fit',
      'smaller size',
      'larger size',
      'swap it for a'
    ]
  ]
]

const RULE_SHAPE = /^(.*?)\s+(?:means|=|->|→|gets|should get|is an?)\s+(?:an?\s+)?([a-z][a-z0-9_-]*)\b/i

export interface ParsedRule {
  rule: string
  condition: string
  choice: string
}

/**
 * Split free-form notes into individual rules ("Damaged in shipping means
 * refund. Wrong size means exchange. Anything else, ask me.").
 */
export function splitRules(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function isEscalationRule(sentence: string): boolean {
  return /\b(anything else|otherwise|everything else|if (?:you'?re )?(?:not sure|unsure)|when in doubt)\b.*\b(ask|check with|escalate|flag|leave|send)\b/i.test(
    sentence
  )
}

/** Parse "X means Y". With `options` null, any single-word choice is accepted. */
export function parseRule(sentence: string, options: string[] | null): ParsedRule | null {
  const match = RULE_SHAPE.exec(sentence.trim())
  if (!match) return null
  const condition = (match[1] ?? '').replace(/^(if|when)\s+/i, '').trim()
  const choice = (match[2] ?? '').toLowerCase()
  if (!condition || (options !== null && !options.includes(choice))) return null
  return { rule: sentence.trim(), condition, choice }
}

/**
 * Rules stated across demonstrator notes, in order: conditional rules and
 * escalation rules only, so narration ("now I click refund") is left out.
 */
export function rulesFromNotes(notes: string[]): { rules: string[]; choices: string[] } {
  const rules: string[] = []
  const choices: string[] = []
  for (const sentence of notes.flatMap(splitRules)) {
    const parsed = parseRule(sentence, null)
    if (parsed) {
      rules.push(sentence)
      if (!choices.includes(parsed.choice)) choices.push(parsed.choice)
    } else if (isEscalationRule(sentence)) {
      rules.push(sentence)
    }
  }
  return { rules, choices }
}

function conditionMatches(condition: string, text: string): boolean {
  const lowered = text.toLowerCase()
  const cond = condition.toLowerCase()
  if (lowered.includes(cond)) return true
  for (const [trigger, words] of SYNONYMS) {
    if (trigger.test(cond) && words.some((word) => lowered.includes(word))) return true
  }
  return false
}

/**
 * Deterministic offline decision: keyword rules over the case text. It
 * escalates on red flags, on no match, and on ambiguous matches.
 */
export function decideFixture(request: DecideRequest): Decision {
  const lowered = request.text.toLowerCase()
  const flag = RED_FLAGS.find((word) => lowered.includes(word))
  if (flag) {
    return {
      choice: ESCALATE,
      rule: null,
      reason: `The case mentions "${flag}". None of your rules cover that, so Muse for SMB left it for you.`
    }
  }
  const parsed = request.rules
    .map((rule) => parseRule(rule, request.options))
    .filter((rule): rule is ParsedRule => rule !== null)
  const hits = parsed.filter((rule) => conditionMatches(rule.condition, request.text))
  const choices = new Set(hits.map((hit) => hit.choice))
  if (hits.length === 0) {
    return {
      choice: ESCALATE,
      rule: null,
      reason: "None of your rules match this case, so Muse for SMB didn't guess."
    }
  }
  if (choices.size > 1) {
    return {
      choice: ESCALATE,
      rule: null,
      reason: `More than one of your rules fits (${[...choices].join(' and ')}), so Muse for SMB left the call to you.`
    }
  }
  const hit = hits[0] as ParsedRule
  return {
    choice: hit.choice,
    rule: hit.rule,
    reason: `Matched your rule "${hit.rule}"`
  }
}

const MetaDecision = z.object({
  choice: z.string().min(1),
  rule: z.string().nullable().optional(),
  reason: z.string().min(1)
})

export const DECIDE_SYSTEM_PROMPT = `You apply a business owner's own rules to one customer case.
You may only choose one of the listed options, or "${ESCALATE}".
Choose an option only when exactly one of the owner's rules clearly covers the case; quote that rule verbatim in "rule".
Choose "${ESCALATE}" when no rule covers the case, when rules conflict, or when the case involves anything the rules never mention (for example a chargeback, a legal threat, or suspected fraud). Never guess.
"reason" is one short sentence addressed to the owner, in plain language.
Output JSON only: {"choice": string, "rule": string | null, "reason": string}`

/** Meta-backed decision. Throws on transport or validation failures. */
export async function decideMeta(request: DecideRequest, env: DecideEnv = process.env): Promise<Decision> {
  const apiKey = env.MODEL_API_KEY
  if (!apiKey) throw new Error('MODEL_API_KEY is not set; cannot use the Meta provider.')
  const baseUrl = (env.META_BASE_URL ?? 'https://api.meta.ai/v1').replace(/\/$/, '')
  const model = env.SPARK_MODEL ?? 'muse-spark-1.3'
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
          { role: 'system', content: DECIDE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              task: request.goal,
              ownerRules: request.rules,
              options: request.options,
              case: request.text
            })
          }
        ]
      }),
      signal: AbortSignal.timeout(60_000)
    })
  } catch (error) {
    throw new Error(`Meta provider request failed: ${(error as Error).message}`)
  }
  if (!response.ok) throw new Error(`Meta provider returned HTTP ${response.status}.`)
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new Error('Meta provider returned no message content.')
  let parsed: z.infer<typeof MetaDecision>
  try {
    parsed = MetaDecision.parse(JSON.parse(content))
  } catch {
    throw new Error('Meta provider returned an invalid decision.')
  }
  return normalizeDecision(parsed.choice, parsed.rule ?? null, parsed.reason, request)
}

/**
 * Hold a model decision to the request's contract: unknown choices
 * escalate, and the quoted rule must be one of the owner's rules.
 */
export function normalizeDecision(
  choice: string,
  rule: string | null,
  reason: string,
  request: DecideRequest
): Decision {
  const normalized = choice.trim().toLowerCase()
  if (normalized === ESCALATE) return { choice: ESCALATE, rule: null, reason }
  if (!request.options.includes(normalized)) {
    return {
      choice: ESCALATE,
      rule: null,
      reason: `Ghost's suggestion "${choice}" isn't one of your options, so it left this for you.`
    }
  }
  const quoted =
    rule === null
      ? null
      : (request.rules.find((r) => r === rule) ??
        request.rules.find((r) => r.toLowerCase().includes(rule.toLowerCase().trim())) ??
        request.rules.find((r) => rule.toLowerCase().includes(r.toLowerCase())) ??
        null)
  if (quoted === null) {
    return {
      choice: ESCALATE,
      rule: null,
      reason: `Muse for SMB leaned toward "${normalized}" but couldn't point to one of your rules, so it left this for you.`
    }
  }
  return { choice: normalized, rule: quoted, reason }
}

export async function decide(
  request: DecideRequest,
  providerId: ProviderId,
  env: DecideEnv = process.env
): Promise<Decision> {
  if (providerId === 'meta') return decideMeta(request, env)
  return decideFixture(request)
}
