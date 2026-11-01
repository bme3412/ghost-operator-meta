import type { SkillSummary } from '../../../shared/schemas'
import type { StarterTask } from '../../../shared/target'

/**
 * The published skill a starter card should reuse instead of re-teaching it,
 * matched by exact title (the seeded/taught skill keeps the starter's name).
 * Null when nothing published carries that name yet.
 */
export function publishedSkillForStarter(
  skills: readonly SkillSummary[],
  task: StarterTask
): SkillSummary | null {
  return skills.find((row) => row.name === task.title && row.activeVersion !== null) ?? null
}
