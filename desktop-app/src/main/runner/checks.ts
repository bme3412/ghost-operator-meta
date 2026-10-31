import type { CheckRef, CheckResult } from '../../shared/schemas'

/** Read-only view of the target page, used by every check. */
export interface DomQuery {
  visible: (selector: string) => Promise<boolean>
  text: (selector: string) => Promise<string | null>
  value: (selector: string) => Promise<string | null>
}

export interface CheckContext {
  inputs: Record<string, string>
  nowMs: number
  dom: DomQuery
}

const PLACEHOLDER = /\{\{\s*(?:inputs\.)?([A-Za-z0-9_]+)\s*\}\}/g

/** Resolve {{inputs.x}} (or {{x}}) placeholders against run inputs. */
export function resolvePlaceholders(template: string, inputs: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = inputs[key]
    if (value === undefined) {
      throw new Error(`Missing run input "${key}".`)
    }
    return value
  })
}

function result(check: string, passed: boolean, observed: string, at: string): CheckResult {
  return { check, passed, observed, at }
}

/** Every check reads the live target page. Toasts and model messages prove nothing. */
export async function evaluateCheck(ref: CheckRef, ctx: CheckContext): Promise<CheckResult> {
  const at = new Date(ctx.nowMs).toISOString()
  switch (ref.name) {
    case 'target_visible': {
      if (!ref.selector) return result(ref.name, false, 'Check has no selector.', at)
      const selector = resolvePlaceholders(ref.selector, ctx.inputs)
      const found = await ctx.dom.visible(selector)
      return result(ref.name, found, found ? `${selector} is visible.` : `${selector} not found.`, at)
    }
    case 'text_contains': {
      if (!ref.selector || ref.expected === undefined) {
        return result(ref.name, false, 'Check needs a selector and an expected value.', at)
      }
      const selector = resolvePlaceholders(ref.selector, ctx.inputs)
      const expected = resolvePlaceholders(ref.expected, ctx.inputs)
      const text = await ctx.dom.text(selector)
      if (text === null) return result(ref.name, false, `${selector} not found.`, at)
      const passed = text.includes(expected)
      return result(
        ref.name,
        passed,
        passed ? `Found "${expected}".` : `Text was "${text.slice(0, 120)}".`,
        at
      )
    }
    case 'value_equals': {
      if (!ref.selector || ref.expected === undefined) {
        return result(ref.name, false, 'Check needs a selector and an expected value.', at)
      }
      const selector = resolvePlaceholders(ref.selector, ctx.inputs)
      const expected = resolvePlaceholders(ref.expected, ctx.inputs)
      const value = await ctx.dom.value(selector)
      if (value === null) return result(ref.name, false, `${selector} not found.`, at)
      const passed = value === expected
      return result(
        ref.name,
        passed,
        passed ? `Value is "${value}".` : `Value is "${value}"; expected "${expected}".`,
        at
      )
    }
    default:
      throw new Error(`Unknown check "${ref.name}".`)
  }
}
