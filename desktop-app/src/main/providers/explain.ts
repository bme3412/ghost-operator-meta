import type { ProviderId, RunStepView } from '../../shared/schemas'

export interface ExplainEnv {
  META_BASE_URL?: string
  MODEL_API_KEY?: string
  SPARK_MODEL?: string
}

/** Deterministic offline step explanation. */
export function explainFixture(step: RunStepView, skillGoal: string): string {
  const bindings = Object.entries(step.bindings)
  const lines = [
    `Step "${step.id}" (${step.kind}) is part of "${skillGoal}".`,
    step.goal ? `Do: ${step.goal}` : 'No detailed goal was recorded for this step.',
    step.why ? `Why it matters: ${step.why}` : '',
    bindings.length > 0
      ? `Inputs: ${bindings.map(([name, view]) => `${name} = ${view.value} (${view.path})`).join('; ')}.`
      : 'Inputs: none bound.',
    step.checks.length > 0
      ? `It is done when these checks pass: ${step.checks.join(', ')}.`
      : 'No automatic checks; confirm the outcome yourself.',
    step.expected ? `Expected result: ${step.expected}` : ''
  ].filter((line) => line !== '')
  return lines.join(' ')
}

/** Meta-backed step explanation. Throws on transport failures. */
export async function explainMeta(
  step: RunStepView,
  skillGoal: string,
  inputs: Record<string, string>,
  env: ExplainEnv = process.env
): Promise<string> {
  const apiKey = env.MODEL_API_KEY
  if (!apiKey) {
    throw new Error('MODEL_API_KEY is not set; cannot use the Meta provider.')
  }
  const baseUrl = (env.META_BASE_URL ?? 'https://api.meta.ai/v1').replace(/\/$/, '')
  const model = env.SPARK_MODEL ?? 'muse-spark-1.3'
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Explain one procedure step in two or three plain sentences: what to do, why it matters, and how to confirm it. No preamble, no markdown.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            procedure: skillGoal,
            step: {
              id: step.id,
              kind: step.kind,
              goal: step.goal ?? null,
              why: step.why ?? null,
              expected: step.expected ?? null,
              bindings: step.bindings,
              checks: step.checks
            },
            inputs
          })
        }
      ]
    }),
    signal: AbortSignal.timeout(60_000)
  })
  if (!response.ok) {
    throw new Error(`Meta provider returned HTTP ${response.status}.`)
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = body.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('Meta provider returned no explanation.')
  }
  return content
}

export async function explainStep(
  step: RunStepView,
  skillGoal: string,
  inputs: Record<string, string>,
  providerId: ProviderId,
  env: ExplainEnv = process.env
): Promise<{ explanation: string; providerId: ProviderId }> {
  if (providerId === 'meta') {
    return { explanation: await explainMeta(step, skillGoal, inputs, env), providerId }
  }
  return { explanation: explainFixture(step, skillGoal), providerId }
}
