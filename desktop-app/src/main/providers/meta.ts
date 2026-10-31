import { Proposal, type Recording } from '../../shared/schemas'
import { KNOWN_CHECKS } from '../../shared/policy/checks'
import { TARGET } from '../../shared/target'

const DEFAULT_BASE_URL = 'https://api.meta.ai/v1'
const DEFAULT_MODEL = 'muse-spark-1.3'

export interface MetaEnv {
  META_BASE_URL?: string
  MODEL_API_KEY?: string
  SPARK_MODEL?: string
}

const SYSTEM_PROMPT = `You turn a web-UI demonstration into a reusable procedure for the ${TARGET.name} web app.
Output JSON only, matching this shape:
{"recipe": {"schemaVersion": 1, "id": "taught-procedure", "version": 1, "goal": string,
"inputSchemaRef": "TargetProcedureInput", "steps": [...],
"allowedApplications": ["${TARGET.id}"], "allowedTools": []},
"unresolved": string[], "demonstrated": {"<shown value>": "<inputs.* path>"}, "notes": string[]}
Step shape for web actions: {"id": string, "kind": "computer_task",
"applicationId": "${TARGET.id}", "goal": string, "why": string, "expected": string,
"bindings": {"action": one of click|fill|submit|goto, "selector": "CSS selector", "value": "for fill/goto"},
"dataRefs": [], "checks": []}.
Verification steps use kind "verify" with checks: [{"name": one of ${KNOWN_CHECKS.join(', ')}, "selector": "CSS selector", "expected": "for text_contains/value_equals"}].
Rules: only use selectors that appear in the demonstrated events, preferring [data-semid="..."] hooks.
Parameterize the demonstrated record identity as {{inputs.ticketId}} inside selectors.
Never invent selectors, quantities, or identifiers; put anything uncertain in "unresolved".
Never emit "tool" steps (no tools are registered).`

function eventSummary(recording: Recording): string {
  return recording.events
    .map((e) =>
      JSON.stringify({
        seq: e.sequence,
        type: e.type,
        semid: e.semanticId ?? null,
        selector: e.selector ?? null,
        label: e.targetLabel ?? null,
        value: e.value ?? null,
        record: e.recordIdentity ?? null
      })
    )
    .join('\n')
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
          { role: 'system', content: SYSTEM_PROMPT },
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
