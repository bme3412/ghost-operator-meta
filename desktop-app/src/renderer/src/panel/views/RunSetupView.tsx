import { useEffect, useRef, useState } from 'react'
import type { RunMode, Skill, SkillSummary } from '../../../../shared/schemas'
import { isUnfamiliarSiteId } from '../../../../shared/capture/sites'
import { countReviewItems } from '../../../../shared/skills/review'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'
import { demonstratedValue, humanizeKey } from '../../lib/humanize'
import type { OnNav } from '../nav'

const LAST_SKILL_KEY = 'ghost:lastSkillId'

/** Input keys a recipe needs, scanned from {{inputs.*}} placeholders. */
function collectInputs(skill: Skill | null): string[] {
  if (!skill || skill.activeVersion === null) return []
  const record = skill.versions.find((v) => v.version === skill.activeVersion)
  if (!record) return []
  const haystack = JSON.stringify({
    bindings: record.recipe.steps.map((s) => s.bindings),
    checks: record.recipe.steps.map((s) => s.checks)
  })
  const keys = new Set<string>()
  for (const match of haystack.matchAll(/\{\{\s*(?:inputs\.)?([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (match[1]) keys.add(match[1])
  }
  return [...keys]
}

export function RunSetupView({
  onNav,
  skillId,
  demonstrated
}: {
  onNav: OnNav
  skillId?: string
  demonstrated?: Record<string, string>
}): React.JSX.Element {
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [listsLoaded, setListsLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState(skillId ?? '')
  const [skill, setSkill] = useState<Skill | null>(null)
  const [skillLoading, setSkillLoading] = useState(false)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<RunMode | null>(null)
  const [modeTouched, setModeTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [siteId, setSiteId] = useState<string | undefined>(undefined)
  const initialSkillApplied = useRef(false)

  useEffect(() => {
    const load = (): void => {
      window.ghost.skills
        .list()
        .then((rows) => {
          const published = rows.filter((row) => row.activeVersion !== null)
          setListsLoaded(true)
          setSkills(published)
          setSelectedId((current) => {
            if (current && published.some((row) => row.id === current)) return current
            if (!initialSkillApplied.current) {
              initialSkillApplied.current = true
              const last = window.localStorage.getItem(LAST_SKILL_KEY)
              if (last && published.some((row) => row.id === last)) return last
            }
            return published[0]?.id || ''
          })
        })
        .catch((err: unknown) => {
          setListsLoaded(true)
          setError(friendlyError(err))
        })
    }
    load()
    window.ghost.target
      .getInfo()
      .then((info) => setSiteId(info.id))
      // Unknown site reads as unfamiliar: guided mode is recommended rather
      // than silently defaulting to autonomous on a site we can't see.
      .catch(() => setSiteId('unreachable-site'))
    return window.ghost.library.onChanged(load)
  }, [])

  useEffect(() => {
    setSkill(null)
    setInputs({})
    if (!selectedId) return
    window.localStorage.setItem(LAST_SKILL_KEY, selectedId)
    setSkillLoading(true)
    window.ghost.skills
      .get(selectedId)
      .then(setSkill)
      .catch((err: unknown) => setError(friendlyError(err)))
      .finally(() => setSkillLoading(false))
  }, [selectedId])

  const needed = collectInputs(skill)
  const record = skill?.versions.find((v) => v.version === skill?.activeVersion) ?? null
  const reviewCount = record ? countReviewItems(record.recipe, record.unresolved) : 0
  const unfamiliar = siteId !== undefined && isUnfamiliarSiteId(siteId)
  const recommended: RunMode = reviewCount > 0 || unfamiliar ? 'guide' : 'assisted'
  const effectiveMode = modeTouched && mode !== null ? mode : recommended
  // Start requires the loaded skill: without it `needed` is empty and every
  // input trivially "passes", which would start a doomed run.
  const ready =
    selectedId !== '' &&
    skill !== null &&
    !skillLoading &&
    needed.every((key) => (inputs[key] ?? '').trim() !== '')

  const start = (): void => {
    if (!ready) return
    setBusy(true)
    setError(null)
    window.ghost.runs
      .start({ skillId: selectedId, mode: effectiveMode, inputs })
      .catch((err: unknown) => {
        setError(friendlyError(err))
        setBusy(false)
      })
    // The panel switches to the running view from the run push.
  }

  return (
    <div>
      <section className="card" aria-label="Run setup">
        <h2>Run a skill</h2>
        {error !== null && (
          <p className="alert-error" role="alert">
            {error}
          </p>
        )}
        {!listsLoaded ? (
          <p className="muted">Loading skills…</p>
        ) : skills.length === 0 ? (
          <div>
            <p className="alert-warn">No published skills yet. Teach and publish one first.</p>
            <Button
              variant="primary"
              data-semid="empty-teach"
              onClick={() => onNav({ view: 'teach' })}
            >
              Teach a task
            </Button>
          </div>
        ) : (
          <div>
            <div className="field">
              <label htmlFor="run-skill">Skill</label>
              <select
                id="run-skill"
                data-testid="run-skill"
                data-semid="run-skill-select"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {skills.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} (v{row.activeVersion}){row.siteId ? ` · ${row.siteId}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {needed.map((key) => (
              <div className="field" key={key}>
                <label htmlFor={`run-input-${key}`}>{humanizeKey(key)}</label>
                <input
                  id={`run-input-${key}`}
                  data-testid={`run-input-${key}`}
                  data-semid={`run-input-${key}`}
                  type="text"
                  value={inputs[key] ?? ''}
                  placeholder={
                    demonstrated?.[key] !== undefined
                      ? `e.g. ${demonstratedValue(demonstrated[key]!)}`
                      : `e.g. ${humanizeKey(key)}`
                  }
                  onChange={(event) =>
                    setInputs((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
              </div>
            ))}
            {(reviewCount > 0 || unfamiliar) && (
              <p className="alert-warn" role="status" data-semid="mode-recommendation">
                {reviewCount > 0
                  ? `This skill has ${reviewCount} open review item${reviewCount === 1 ? '' : 's'} — guided mode is recommended.`
                  : 'This site is unfamiliar — guided mode is recommended: you confirm each step.'}
              </p>
            )}
            <fieldset className="mode-options">
              <legend>How should Ghost run it?</legend>
              <label className="mode-option">
                <input
                  type="radio"
                  name="run-mode"
                  data-testid="mode-guide"
                  data-semid="mode-guide"
                  checked={effectiveMode === 'guide'}
                  onChange={() => {
                    setMode('guide')
                    setModeTouched(true)
                  }}
                />
                <span>
                  <strong>Guide me</strong>
                  <span className="muted"> — you click, Ghost checks each step.</span>
                  {recommended === 'guide' && <span className="muted"> (Recommended)</span>}
                </span>
              </label>
              <label className="mode-option">
                <input
                  type="radio"
                  name="run-mode"
                  data-testid="mode-assisted"
                  data-semid="mode-assisted"
                  checked={effectiveMode === 'assisted'}
                  onChange={() => {
                    setMode('assisted')
                    setModeTouched(true)
                  }}
                />
                <span>
                  <strong>Do it for me</strong>
                  <span className="muted"> — Ghost acts on its own.</span>
                  {recommended === 'assisted' && <span className="muted"> (Recommended)</span>}
                </span>
              </label>
            </fieldset>
            <div className="field">
              <Button
                variant="primary"
                data-testid="run-start"
                data-semid="run-start"
                disabled={busy || !ready}
                onClick={start}
              >
                {busy ? 'Starting…' : 'Start run'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
