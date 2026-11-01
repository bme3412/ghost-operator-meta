/** Words that keep an all-caps form when humanized. */
const ACRONYMS: ReadonlyMap<string, string> = new Map([
  ['id', 'ID'],
  ['url', 'URL'],
  ['api', 'API']
])

/**
 * Turn a code key into a label: ticketId → "Ticket ID",
 * record_id → "Record ID". Never returns an empty string.
 */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_\-\s]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
  if (words.length === 0) return key
  return words
    .map((word) => ACRONYMS.get(word.toLowerCase()) ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface LabeledStep {
  id: string
  kind: string
  goal?: string | null
}

/** Display label for a run mode: assisted → "Do it for me". */
export function runModeLabel(mode: string): string {
  switch (mode) {
    case 'assisted':
      return 'Do it for me'
    case 'guide':
      return 'Guide me'
    default:
      return humanizeKey(mode)
  }
}

/** Display label for a run status: succeeded → "Succeeded". */
export function runStatusLabel(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'Succeeded'
    case 'running':
      return 'Running'
    case 'queued':
      return 'Queued'
    case 'verifying':
      return 'Verifying'
    case 'paused':
      return 'Paused'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'escalated':
      return 'Needs you'
    default:
      return humanizeKey(status)
  }
}

/**
 * Display label for a recipe or run step: the plain-language goal, with a
 * kind-based fallback so raw step ids never reach the main flow.
 */
export function stepLabel(step: LabeledStep): string {
  const goal = step.goal?.trim()
  if (goal) return goal
  if (step.kind === 'verify') return 'Verify the result'
  if (step.kind === 'review') return 'Review this step'
  if (step.kind === 'decide') return 'Decide using your rules'
  return humanizeKey(step.id)
}

/**
 * Display label for a check: text_contains → 'Shows "resolved"'. Unknown
 * check names fall back to a humanized key so nothing renders raw.
 */
export function checkLabel(name: string, expected?: string): string {
  switch (name) {
    case 'text_contains':
      return expected ? `Shows “${expected}”` : 'Shows the expected text'
    case 'value_equals':
      return expected ? `Equals “${expected}”` : 'Has the expected value'
    case 'target_visible':
      return 'Is visible on the page'
    default:
      return humanizeKey(name)
  }
}

/** Inner value of a demonstrated label: 'Ticket "T-101"' → "T-101". */
export function demonstratedValue(shown: string): string {
  const quoted = /"([^"]+)"/.exec(shown)
  return quoted?.[1] ?? shown
}

/** Parameter key of a demonstrated path: "inputs.ticketId" → "ticketId". */
export function demonstratedKey(path: string): string {
  return path.replace(/^inputs\./, '')
}

/**
 * Plain-language review lines for a proposal's demonstrated map, e.g.
 * 'Each run will ask for Ticket ID (you used T-101)'.
 */
export function bindingSentences(demonstrated: Record<string, string>): string[] {
  return Object.entries(demonstrated).map(
    ([shown, path]) =>
      `Each run will ask for ${humanizeKey(demonstratedKey(path))} (you used ${demonstratedValue(shown)})`
  )
}

/** Demonstrated run-input values keyed by input name, for prefilled placeholders. */
export function demonstratedInputs(demonstrated: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [shown, path] of Object.entries(demonstrated)) {
    out[demonstratedKey(path)] = demonstratedValue(shown)
  }
  return out
}
