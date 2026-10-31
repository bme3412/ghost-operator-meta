import { renderInstructions } from '../../shared/skills/format'
import type {
  SaveDraftRequest,
  Skill,
  SkillSummary,
  SkillVersionRecord,
  UpdateDraftRequest
} from '../../shared/schemas'
import { loadState, saveState } from '../store'

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'skill'
  )
}

export function listSkills(): SkillSummary[] {
  return loadState().skills.map((skill) => {
    const latest = skill.versions[skill.versions.length - 1]
    if (!latest) throw new Error(`Skill ${skill.id} has no versions.`)
    return {
      id: skill.id,
      name: skill.name,
      activeVersion: skill.activeVersion,
      latestVersion: latest.version,
      latestStatus: latest.status
    }
  })
}

export function getSkill(skillId: string): Skill | null {
  return loadState().skills.find((s) => s.id === skillId) ?? null
}

/** Save a reviewed proposal as a new draft version (new skill or new version). */
export function saveDraft(request: SaveDraftRequest, nowMs: number = Date.now()): Skill {
  const state = loadState()
  const createdAt = new Date(nowMs).toISOString()
  const existing = request.skillId ? (getSkill(request.skillId) ?? null) : null

  if (existing) {
    const version = Math.max(...existing.versions.map((v) => v.version)) + 1
    const record: SkillVersionRecord = {
      version,
      recipe: { ...request.recipe, id: existing.id, version },
      instructions: renderInstructions(request.recipe),
      status: 'draft',
      recordingIds: request.recordingIds,
      providerId: request.providerId,
      unresolved: request.unresolved,
      createdAt
    }
    const updated: Skill = { ...existing, versions: [...existing.versions, record] }
    saveState({
      ...state,
      skills: state.skills.map((s) => (s.id === existing.id ? updated : s))
    })
    return updated
  }

  const base = slugify(request.name)
  let id = base
  let suffix = 2
  while (state.skills.some((s) => s.id === id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  const skill: Skill = {
    id,
    name: request.name,
    activeVersion: null,
    versions: [
      {
        version: 1,
        recipe: { ...request.recipe, id, version: 1 },
        instructions: renderInstructions(request.recipe),
        status: 'draft',
        recordingIds: request.recordingIds,
        providerId: request.providerId,
        unresolved: request.unresolved,
        createdAt
      }
    ]
  }
  saveState({ ...state, skills: [...state.skills, skill] })
  return skill
}

/** Edit a draft version. Published versions are immutable. */
export function updateDraft(request: UpdateDraftRequest): Skill {
  const state = loadState()
  const skill = getSkill(request.skillId)
  if (!skill) throw new Error(`Unknown skill ${request.skillId}.`)
  const record = skill.versions.find((v) => v.version === request.version)
  if (!record) throw new Error(`Unknown version ${request.version}.`)
  if (record.status !== 'draft') throw new Error('Published versions are immutable.')
  const updated: Skill = {
    ...skill,
    versions: skill.versions.map((v) =>
      v.version === request.version
        ? {
            ...v,
            recipe: request.recipe
              ? { ...request.recipe, id: skill.id, version: v.version }
              : v.recipe,
            instructions: request.instructions ?? v.instructions
          }
        : v
    )
  }
  saveState({ ...state, skills: state.skills.map((s) => (s.id === skill.id ? updated : s)) })
  return updated
}

/** Publish a draft version, making it the active version. */
export function publishSkill(skillId: string, version: number): Skill {
  const state = loadState()
  const skill = getSkill(skillId)
  if (!skill) throw new Error(`Unknown skill ${skillId}.`)
  const record = skill.versions.find((v) => v.version === version)
  if (!record) throw new Error(`Unknown version ${version}.`)
  if (record.status !== 'draft') throw new Error('Only drafts can be published.')
  const updated: Skill = {
    ...skill,
    activeVersion: version,
    versions: skill.versions.map((v) =>
      v.version === version ? { ...v, status: 'published' as const } : v
    )
  }
  saveState({ ...state, skills: state.skills.map((s) => (s.id === skill.id ? updated : s)) })
  return updated
}

export function getActiveVersion(skillId: string): SkillVersionRecord | null {
  const skill = getSkill(skillId)
  if (!skill || skill.activeVersion === null) return null
  return skill.versions.find((v) => v.version === skill.activeVersion) ?? null
}
