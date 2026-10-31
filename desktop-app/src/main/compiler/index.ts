import {
  CompileResult,
  type CompileRequest,
  type SkillRecipe
} from '../../shared/schemas'
import { CHECK_PARAMS, isKnownCheck, isKnownTool } from '../../shared/policy/checks'
import { TARGET } from '../../shared/target'
import { generateProposal } from '../providers'
import { loadState } from '../store'

const DOM_ACTIONS = new Set(['click', 'fill', 'submit', 'goto'])

/** Validate a recipe against registered capabilities. Returns blocking errors. */
export function validateRecipe(recipe: SkillRecipe): string[] {
  const errors: string[] = []
  if (!recipe.allowedApplications.includes(TARGET.id)) {
    errors.push(`Recipe must allow the "${TARGET.id}" application.`)
  }
  for (const step of recipe.steps) {
    if (step.kind === 'tool') {
      if (!step.toolId) {
        errors.push(`Step "${step.id}" is a tool step without a toolId.`)
      } else if (!isKnownTool(step.toolId)) {
        errors.push(`Step "${step.id}" uses unregistered tool "${step.toolId}".`)
      }
    }
    if (step.kind === 'computer_task') {
      const action = step.bindings['action']
      if (!action || !DOM_ACTIONS.has(action)) {
        errors.push(
          `Step "${step.id}" needs bindings.action as one of ${[...DOM_ACTIONS].join(', ')}.`
        )
      } else if (action === 'goto' && !step.bindings['value']) {
        errors.push(`Step "${step.id}" is a goto step without bindings.value (path).`)
      } else if (action !== 'goto' && !step.bindings['selector']) {
        errors.push(`Step "${step.id}" needs bindings.selector for action "${action}".`)
      }
      if (action === 'fill' && step.bindings['value'] === undefined) {
        errors.push(`Step "${step.id}" is a fill step without bindings.value.`)
      }
    }
    for (const check of step.checks) {
      if (!isKnownCheck(check.name)) {
        errors.push(`Step "${step.id}" uses unknown check "${check.name}".`)
        continue
      }
      const params = CHECK_PARAMS[check.name]
      if (params?.selector && !check.selector) {
        errors.push(`Step "${step.id}" check "${check.name}" needs a selector.`)
      }
      if (params?.expected && check.expected === undefined) {
        errors.push(`Step "${step.id}" check "${check.name}" needs an expected value.`)
      }
    }
  }
  return errors
}

/** Compile a recording into a reviewed proposal. Nothing is persisted. */
export async function compileRecording(request: CompileRequest): Promise<CompileResult> {
  const state = loadState()
  const recording = state.recordings.find((r) => r.id === request.recordingId)
  if (!recording) {
    return { ok: false, errors: [`Unknown recording ${request.recordingId}.`] }
  }
  try {
    const proposal = await generateProposal(recording, request.providerId)
    const errors = validateRecipe(proposal.recipe)
    if (errors.length > 0) {
      return { ok: false, errors }
    }
    return { ok: true, proposal, providerId: request.providerId }
  } catch (error) {
    return { ok: false, errors: [(error as Error).message] }
  }
}
