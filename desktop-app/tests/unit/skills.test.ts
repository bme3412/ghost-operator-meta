import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getActiveVersion, getSkill, listSkills, publishSkill, saveDraft, updateDraft } from '../../src/main/skills/index'
import { resetStoreCache } from '../../src/main/store/index'
import type { SkillRecipe } from '../../src/shared/schemas'

function recipe(): SkillRecipe {
  return {
    schemaVersion: 1,
    id: 'resolve-support-ticket',
    version: 1,
    goal: 'Replace a damaged item',
    inputSchemaRef: 'ReplaceDamagedItemInput',
    steps: [
      {
        id: 'open-case',
        kind: 'computer_task',
        applicationId: 'saltbreak',
        goal: 'Open the case.',
        bindings: { caseId: 'inputs.caseId' },
        dataRefs: [],
        checks: []
      }
    ],
    allowedApplications: ['saltbreak'],
    allowedTools: []
  }
}

describe('skills store', () => {
  beforeEach(() => {
    process.env.GHOST_STATE_PATH = join(
      mkdtempSync(join(tmpdir(), 'ghost-skills-')),
      'state.json'
    )
    resetStoreCache()
  })

  afterEach(() => {
    delete process.env.GHOST_STATE_PATH
    resetStoreCache()
  })

  it('saves a first draft as version 1 of a new skill', () => {
    const skill = saveDraft({
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: ['rec-1'],
      providerId: 'fixture',
      unresolved: []
    })
    expect(skill.id).toBe('resolve-support-ticket')
    expect(skill.activeVersion).toBeNull()
    expect(skill.versions).toHaveLength(1)
    expect(skill.versions[0]?.status).toBe('draft')
    expect(skill.versions[0]?.instructions).toContain('Goal:')
    expect(listSkills()).toHaveLength(1)
  })

  it('appends new versions to an existing skill', () => {
    const first = saveDraft({
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: []
    })
    const second = saveDraft({
      skillId: first.id,
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: ['new doubt']
    })
    expect(second.versions.map((v) => v.version)).toEqual([1, 2])
    expect(getSkill(first.id)?.versions).toHaveLength(2)
  })

  it('edits drafts but never published versions', () => {
    const skill = saveDraft({
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: []
    })
    const edited = updateDraft({ skillId: skill.id, version: 1, instructions: 'Edited.' })
    expect(edited.versions[0]?.instructions).toBe('Edited.')
    publishSkill(skill.id, 1)
    expect(() =>
      updateDraft({ skillId: skill.id, version: 1, instructions: 'Too late.' })
    ).toThrow()
  })

  it('publishes a draft as the active version', () => {
    const skill = saveDraft({
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: []
    })
    const published = publishSkill(skill.id, 1)
    expect(published.activeVersion).toBe(1)
    expect(published.versions[0]?.status).toBe('published')
    expect(getActiveVersion(skill.id)?.version).toBe(1)
    expect(() => publishSkill(skill.id, 1)).toThrow()
  })
})
