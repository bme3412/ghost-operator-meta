/** Check identifiers the runner implements. The compiler rejects unknown checks. */
export const KNOWN_CHECKS: readonly string[] = ['target_visible', 'text_contains', 'value_equals']

/** Required CheckRef params per check. All selectors are CSS run in the target page. */
export const CHECK_PARAMS: Record<string, { selector: boolean; expected: boolean }> = {
  target_visible: { selector: true, expected: false },
  text_contains: { selector: true, expected: true },
  value_equals: { selector: true, expected: true }
}

/** Tool identifiers the runner implements. Empty for this release. */
export const KNOWN_TOOLS: readonly string[] = []

export function isKnownCheck(check: string): boolean {
  return (KNOWN_CHECKS as readonly string[]).includes(check)
}

export function isKnownTool(toolId: string): boolean {
  return (KNOWN_TOOLS as readonly string[]).includes(toolId)
}
