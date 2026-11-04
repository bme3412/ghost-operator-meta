import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getActiveVersion, getSkill, listSkills, publishSkill, saveDraft, seedStarterSkills, updateDraft } from '../../src/main/skills/index'
import { loadState, resetStoreCache, saveState } from '../../src/main/store/index'
import type { SkillRecipe } from '../../src/shared/schemas'
import { siteProfileForUrl } from '../../src/shared/target'

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
        bindings: {
          action: 'click',
          selector: '[data-semid="case-open"]',
          caseId: 'inputs.caseId'
        },
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
    // Updating never creates a second playbook.
    expect(listSkills()).toHaveLength(1)
    expect(second.id).toBe(first.id)
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

  it('rejects new drafts with unknown actions, checks, or tools', () => {
    const badAction = recipe()
    badAction.steps[0] = {
      ...badAction.steps[0]!,
      bindings: { action: 'teleport', selector: '[data-semid="x"]' }
    }
    expect(() =>
      saveDraft({
        name: 'Bad action',
        recipe: badAction,
        recordingIds: [],
        providerId: 'fixture',
        unresolved: []
      })
    ).toThrow(/bindings\.action/)

    const badCheck = recipe()
    badCheck.steps[0] = { ...badCheck.steps[0]!, checks: [{ name: 'vibes_ok' }] }
    expect(() =>
      saveDraft({
        name: 'Bad check',
        recipe: badCheck,
        recordingIds: [],
        providerId: 'fixture',
        unresolved: []
      })
    ).toThrow(/unknown check/)

    const badTool = recipe()
    badTool.steps[0] = { ...badTool.steps[0]!, kind: 'tool', toolId: 'mystery-tool' }
    expect(() =>
      saveDraft({
        name: 'Bad tool',
        recipe: badTool,
        recordingIds: [],
        providerId: 'fixture',
        unresolved: []
      })
    ).toThrow(/unregistered tool/)

    expect(listSkills()).toHaveLength(0)
  })

  it('rejects appended versions with invalid recipes', () => {
    const first = saveDraft({
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: []
    })
    const bad = recipe()
    bad.steps[0] = { ...bad.steps[0]!, checks: [{ name: 'vibes_ok' }] }
    expect(() =>
      saveDraft({
        skillId: first.id,
        name: 'Resolve support ticket',
        recipe: bad,
        recordingIds: [],
        providerId: 'fixture',
        unresolved: []
      })
    ).toThrow(/Recipe is invalid/)
    expect(getSkill(first.id)?.versions).toHaveLength(1)
  })

  it('re-pins the creating site on draft edits, dropping client extras', () => {
    const skill = saveDraft({
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: []
    })
    const widened = recipe()
    widened.allowedApplications = ['saltbreak', 'evil-site']
    const edited = updateDraft({ skillId: skill.id, version: 1, recipe: widened })
    expect(edited.versions[0]?.recipe.allowedApplications).toEqual(['saltbreak'])
  })

  it('rejects draft edits that break the recipe', () => {
    const skill = saveDraft({
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: []
    })
    const bad = recipe()
    bad.steps[0] = { ...bad.steps[0]!, bindings: { action: 'click' } }
    expect(() => updateDraft({ skillId: skill.id, version: 1, recipe: bad })).toThrow(
      /bindings\.selector/
    )
    expect(getSkill(skill.id)?.versions[0]?.recipe.steps[0]?.bindings['selector']).toBe(
      '[data-semid="case-open"]'
    )
  })

  it('rejects publishing a draft that became invalid', () => {
    const skill = saveDraft({
      name: 'Resolve support ticket',
      recipe: recipe(),
      recordingIds: [],
      providerId: 'fixture',
      unresolved: []
    })
    const state = loadState()
    const stored = state.skills.find((s) => s.id === skill.id)
    expect(stored?.versions[0]).toBeDefined()
    stored!.versions[0]!.recipe.steps[0]!.checks = [{ name: 'vibes_ok' }]
    saveState({ ...state })
    expect(() => publishSkill(skill.id, 1)).toThrow(/unknown check/)
    expect(getSkill(skill.id)?.activeVersion).toBeNull()
    expect(getSkill(skill.id)?.versions[0]?.status).toBe('draft')
  })
})

describe('seedStarterSkills', () => {
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

  it('seeds the three Saltbreak starters as published skills', () => {
    seedStarterSkills()
    const skills = listSkills()
    expect(skills.map((s) => s.name)).toEqual([
      'Handle after-hours support tickets',
      'Reconcile payout PO-1043 in Books',
      'Answer ticket T-101 from product facts'
    ])
    for (const skill of skills) {
      expect(skill.activeVersion).toBe(1)
      expect(getActiveVersion(skill.id)?.recordingIds).toEqual([])
    }
    expect(loadState().seededStarters).toBe(true)
  })

  it('is a no-op on the second call', () => {
    seedStarterSkills()
    seedStarterSkills()
    expect(listSkills()).toHaveLength(3)
  })

  it('does not resurrect a starter the user deleted', () => {
    seedStarterSkills()
    const state = loadState()
    saveState({
      ...state,
      skills: state.skills.filter((s) => s.id !== 'answer-ticket-t-101-from-product-facts')
    })
    seedStarterSkills()
    expect(listSkills().map((s) => s.id)).not.toContain('answer-ticket-t-101-from-product-facts')
    expect(listSkills()).toHaveLength(2)
  })

  it('does nothing for a non-Saltbreak target', () => {
    const state = loadState()
    saveState({ ...state, currentSite: siteProfileForUrl('https://www.ebay.com') })
    seedStarterSkills()
    expect(listSkills()).toHaveLength(0)
    expect(loadState().seededStarters).toBeUndefined()
  })
})
