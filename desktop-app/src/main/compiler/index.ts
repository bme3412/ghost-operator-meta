import { CompileResult, type CompileRequest } from '../../shared/schemas'
import { validateRecipe } from '../../shared/policy/recipe'
import { generateProposal } from '../providers'
import { loadState } from '../store'

export { validateRecipe } from '../../shared/policy/recipe'

/** Compile a recording into a reviewed proposal. Nothing is persisted. */
export async function compileRecording(request: CompileRequest): Promise<CompileResult> {
  const state = loadState()
  const recording = state.recordings.find((r) => r.id === request.recordingId)
  if (!recording) {
    return { ok: false, errors: [`Unknown recording ${request.recordingId}.`] }
  }
  try {
    const proposal = await generateProposal(recording, request.providerId)
    const errors = validateRecipe(proposal.recipe, recording.applicationScope)
    if (errors.length > 0) {
      return { ok: false, errors }
    }
    return { ok: true, proposal, providerId: request.providerId }
  } catch (error) {
    return { ok: false, errors: [(error as Error).message] }
  }
}
