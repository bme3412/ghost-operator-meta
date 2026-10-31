import type { Proposal, ProviderId, Recording } from '../../shared/schemas'
import { compileFixture } from './fixture'
import { generateMetaProposal } from './meta'

export function resolveProviderId(env: NodeJS.ProcessEnv = process.env): ProviderId {
  return env.GHOST_PROVIDER === 'meta' ? 'meta' : 'fixture'
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
