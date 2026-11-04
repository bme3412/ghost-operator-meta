/**
 * Carries "revise this playbook" identity from Playbook through Teaching to
 * Review, so saving updates the same playbook instead of creating a copy.
 * In-memory only: it never outlives the panel session.
 */
let pendingUpdateSkillId: string | null = null

export function setPendingUpdateSkillId(skillId: string | null): void {
  pendingUpdateSkillId = skillId
}

export function takePendingUpdateSkillId(): string | null {
  const value = pendingUpdateSkillId
  pendingUpdateSkillId = null
  return value
}

export function peekPendingUpdateSkillId(): string | null {
  return pendingUpdateSkillId
}
