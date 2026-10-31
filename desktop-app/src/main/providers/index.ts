import type { Proposal, ProviderId, Recording } from '../../shared/schemas'
import { compileFixture } from './fixture'
import { generateMetaProposal } from './meta'

/**
 * Default provider for draft generation and explanations. An explicit
 * GHOST_PROVIDER choice always wins; otherwise the Meta provider is
 * preferred when a model key is configured, and the deterministic offline
 * fixture is the fallback.
 */
export function resolveProviderId(env: NodeJS.ProcessEnv = process.env): ProviderId {
  const override = env.GHOST_PROVIDER
  if (override === 'meta' || override === 'fixture') {
    return override
  }
  const key = env.MODEL_API_KEY
  return key !== undefined && key.trim() !== '' ? 'meta' : 'fixture'
}

/** Generate a draft procedure. The fixture provider is deterministic and offline. */
export async function generateProposal(
  recording: Recording,
  providerId: ProviderId
): Promise<Proposal> {
  if (providerId === 'meta') {
    return generateMetaProposal(recording)
  }
  return compileFixture(recording)
}
