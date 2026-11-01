import { Proposal, type Recording } from '../../shared/schemas'
import { KNOWN_CHECKS } from '../../shared/policy/checks'

const DEFAULT_BASE_URL = 'https://api.meta.ai/v1'
const DEFAULT_MODEL = 'muse-spark-1.3'

export interface MetaEnv {
  META_BASE_URL?: string
  MODEL_API_KEY?: string
  SPARK_MODEL?: string
}

/** Maximum selector candidates per event included in the model summary. */
const MAX_SUMMARY_CANDIDATES = 4

/**
 * Site-agnostic system prompt for procedure generation. It carries no
 * assumptions about which site was demonstrated: the site id arrives in the
 * user message and is the only allowed application id. Parameter inference
 * comes from demonstrator notes plus literal values repeated across events,
 * and anything uncertain becomes an unresolved entry or a review step.
 */
export const META_SYSTEM_PROMPT = `You turn a web-UI demonstration on an arbitrary website into a reusable procedure.
Output JSON only, matching this shape:
{"recipe": {"schemaVersion": 1, "id": "taught-procedure", "version": 1, "goal": string,
"inputSchemaRef": "TargetProcedureInput", "steps": [...],
"allowedApplications": ["<the site id from the user message>"], "allowedTools": []},
"unresolved": string[], "demonstrated": {"<shown value>": "<inputs.* path>"}, "notes": string[]}
Step shape for web actions: {"id": string, "kind": "computer_task",
"applicationId": "<the same site id>", "goal": string, "why": string, "expected": string,
"bindings": {"action": one of click|fill|submit|goto, "selector": "CSS selector", "value": "for fill/goto"},
"dataRefs": [], "checks": []}.
Verification steps use kind "verify" with checks: [{"name": one of ${KNOWN_CHECKS.join(', ')}, "selector": "CSS selector", "expected": "for text_contains/value_equals"}].
When an action cannot be replayed reliably, emit a review step instead: {"id": string, "kind": "review",
"applicationId": "<the same site id>", "goal": string, "bindings": {}, "dataRefs": [], "checks": []}.
Rules: only use selectors that appear in the demonstrated events, preferring the first candidate of each chain.
A "navigate" event's value is a site-relative path the demonstration moved to; it can become a "goto" step directly, with bindings {"action": "goto", "value": "<that path>"} and no selector. When a click is immediately followed by a navigate event, prefer one goto step to the navigate path over replaying the click — the navigation is the intent, and the click's selector may be fragile.
The final line may be an "end_page" entry listing stable hooks visible where the demonstration ended. When the procedure ends by navigating somewhere new, close it with a "verify" step whose check uses one of those hooks verbatim (for example a target_visible check on a container hook) instead of ending at the goto — the hook is demonstrated evidence, not an invented selector.
Infer parameters from the demonstrator notes and from literal values repeated across events (for example a record id shown in several targets); bind them as {{inputs.*}} inside selectors and values, and record each mapping in "demonstrated".
When the demonstrator notes state conditional rules (for example "Damaged in shipping means refund. Wrong size means exchange. Anything else, ask me.") and the demonstration clicked a control named for one of those choices (for example a selector containing "case-refund-C-7"), emit a judgment step right before that click:
{"id": "decide-using-your-rules", "kind": "decide", "applicationId": "<the same site id>", "goal": string, "why": string,
"bindings": {"readSelector": "CSS selector for the case text, from an end_page hook, with {{inputs.*}} placeholders"}, "rules": [each rule sentence copied verbatim from the notes, including the "anything else" rule],
"options": [the lowercase choices the rules name, e.g. "refund", "exchange"; never "escalate"], "writes": "resolution", "dataRefs": [], "checks": []}.
Then write the click's selector with the choice replaced by {{inputs.resolution}} (for example [data-semid="case-{{inputs.resolution}}-{{inputs.caseId}}"]) and give it no fallback candidates. Ghost hands any case the rules don't cover back to the owner; never add options the notes don't name.
Prefer resolving uncertainty into "unresolved" entries and review steps over guessing: when a selector looks unstable (a deep positional path, a generated class name, a single fragile hook), emit a review step and explain the doubt in "unresolved".
Never invent selectors, quantities, or identifiers; put anything uncertain in "unresolved".
Never emit "tool" steps (no tools are registered).`

export function eventSummary(recording: Recording): string {
  const lines = recording.events.map((e) =>
    JSON.stringify({
      seq: e.sequence,
      type: e.type,
      semid: e.semanticId ?? null,
      selector: e.selector ?? null,
      candidates: (e.selectorCandidates ?? []).slice(0, MAX_SUMMARY_CANDIDATES),
      accessible:
        e.accessibleRole ?? e.accessibleLabel
          ? `${e.accessibleRole ?? 'element'}${e.accessibleLabel ? ` "${e.accessibleLabel}"` : ''}`
          : null,
      label: e.targetLabel ?? null,
      value: e.value ?? null,
      record: e.recordIdentity ?? null
    })
  )
  if (recording.endPage) {
    lines.push(
      JSON.stringify({ type: 'end_page', path: recording.endPage.path, hooks: recording.endPage.hooks })
    )
  }
  return lines.join('\n')
}

/**
 * Meta provider adapter for procedure generation.
 * Uses an OpenAI-compatible chat endpoint; validates every response against
 * the local Proposal schema. Throws on transport or validation failures.
 */
export async function generateMetaProposal(
  recording: Recording,
  env: MetaEnv = process.env
): Promise<Proposal> {
  const apiKey = env.MODEL_API_KEY
  if (!apiKey) {
    throw new Error('MODEL_API_KEY is not set; cannot use the Meta provider.')
  }
  const baseUrl = (env.META_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  const model = env.SPARK_MODEL ?? DEFAULT_MODEL

  const user = [
    `Goal: ${recording.goal}`,
    `Site id: ${recording.applicationScope} (use exactly this id for allowedApplications and every applicationId)`,
    'Demonstrator notes:',
    ...recording.notes.map((n) => `- ${n.text}`),
    'Demonstration events (seq, type, target, value):',
    eventSummary(recording)
  ].join('\n')

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
          { role: 'system', content: META_SYSTEM_PROMPT },
          { role: 'user', content: user }
        ]
      }),
      signal: AbortSignal.timeout(90_000)
    })
  } catch (error) {
    throw new Error(`Meta provider request failed: ${(error as Error).message}`)
  }
  if (!response.ok) {
    throw new Error(`Meta provider returned HTTP ${response.status}.`)
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = body.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Meta provider returned no message content.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Meta provider returned content that is not JSON.')
  }
  return Proposal.parse(parsed)
}
