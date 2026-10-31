import type { SkillStep } from '../schemas/skill'

/**
 * Display mirror of the runner's continuation behavior (see
 * src/main/runner/index.ts). The recipe model is linear; branching happens at
 * step outcomes: checks, approvals, and errors.
 */
export function stepOutcomes(step: SkillStep): string[] {
  switch (step.kind) {
    case 'verify':
      return [
        'all checks pass → next step',
        'any check fails → run fails (guided runs can fix and retry)'
      ]
    case 'review':
      return ['approved → next step', 'stopped → run cancelled']
    case 'tool':
      return ['tool succeeds → next step', 'tool fails → run fails with message']
    default:
      if (step.checks.length > 0) {
        return [
          'completes and checks pass → next step',
          'error or failed check → run fails with message'
        ]
      }
      return ['completes → next step', 'error → run fails with message']
  }
}
