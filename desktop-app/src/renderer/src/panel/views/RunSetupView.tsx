import { useEffect, useRef, useState } from 'react'
import type { RunMode, Skill, SkillSummary } from '../../../../shared/schemas'
import { isUnfamiliarSiteId } from '../../../../shared/capture/sites'
import { recipeInputKeys } from '../../../../shared/skills/inputs'
import { countReviewItems } from '../../../../shared/skills/review'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'
import { demonstratedValue, humanizeKey } from '../../lib/humanize'
import type { OnNav } from '../nav'

const LAST_SKILL_KEY = 'ghost:lastSkillId'

/** Input keys the active version needs from the person starting the run. */
function collectInputs(skill: Skill | null): string[] {
  if (!skill || skill.activeVersion === null) return []
  const record = skill.versions.find((v) => v.version === skill.activeVersion)
  return record ? recipeInputKeys(record.recipe) : []
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
  const [scope, setScope] = useState<'one' | 'many'>('one')
  const [caseList, setCaseList] = useState('')
  const [finding, setFinding] = useState(false)
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
  // "Run on many" binds each case id to the case input; ticket skills say so.
  const caseKey = needed.includes('ticketId') ? 'ticketId' : (needed[0] ?? null)
  const many = scope === 'many' && caseKey !== null
  const caseIds = caseList
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => id !== '')
  // Start requires the loaded skill: without it `needed` is empty and every
  // input trivially "passes", which would start a doomed run.
  const ready =
    selectedId !== '' &&
    skill !== null &&
    !skillLoading &&
    (many
      ? caseIds.length > 0 &&
        needed.every((key) => key === caseKey || (inputs[key] ?? '').trim() !== '')
      : needed.every((key) => (inputs[key] ?? '').trim() !== ''))

  const findOpenCases = (): void => {
    setFinding(true)
    setError(null)
    window.ghost.batches
      .openCases()
      .then((ids) => {
        if (ids.length === 0) setError('No open cases on this page. Open the support inbox first.')
        else setCaseList(ids.join(', '))
      })
      .catch((err: unknown) => setError(friendlyError(err)))
      .finally(() => setFinding(false))
  }

  const start = (): void => {
    if (!ready) return
    setBusy(true)
    setError(null)
    const failed = (err: unknown): void => {
      setError(friendlyError(err))
      setBusy(false)
    }
    if (many && caseKey !== null) {
      const sharedInputs = Object.fromEntries(
        Object.entries(inputs).filter(([key]) => key !== caseKey && needed.includes(key))
      )
      window.ghost.batches
        .start({ skillId: selectedId, inputKey: caseKey, caseIds, sharedInputs })
        .catch(failed)
      return
    }
    window.ghost.runs.start({ skillId: selectedId, mode: effectiveMode, inputs }).catch(failed)
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
            {caseKey !== null && (
              <fieldset className="mode-options">
                <legend>Which cases?</legend>
                <label className="mode-option">
                  <input
                    type="radio"
                    name="run-scope"
                    data-semid="scope-one"
                    checked={scope === 'one'}
                    onChange={() => setScope('one')}
                  />
                  <span>
                    <strong>One case</strong>
                  </span>
                </label>
                <label className="mode-option">
                  <input
                    type="radio"
                    name="run-scope"
                    data-semid="scope-many"
                    checked={scope === 'many'}
                    onChange={() => setScope('many')}
                  />
                  <span>
                    <strong>Run on many</strong>
                    <span className="muted">
                      {' '}
                      — Ghost works through each case on its own and tells you how it went.
                    </span>
                  </span>
                </label>
              </fieldset>
            )}
            {many && (
              <div className="field">
                <label htmlFor="run-case-list">{humanizeKey(caseKey)}s</label>
                <textarea
                  id="run-case-list"
                  data-semid="run-case-list"
                  rows={3}
                  value={caseList}
                  placeholder="e.g. T-202, T-203"
                  onChange={(event) => setCaseList(event.target.value)}
                />
                <Button data-semid="find-open-cases" disabled={finding} onClick={findOpenCases}>
                  {finding ? 'Looking…' : 'Find open cases on this page'}
                </Button>
                {caseIds.length > 0 && (
                  <p className="muted" data-semid="run-case-count">
                    {caseIds.length} case{caseIds.length === 1 ? '' : 's'}. Ghost runs each one in “Do
                    it for me” mode and hands back anything your rules don’t cover.
                  </p>
                )}
              </div>
            )}
            {needed
              .filter((key) => !(many && key === caseKey))
              .map((key) => (
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
            {!many && (
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
            )}
            <div className="field">
              <Button
                variant="primary"
                data-testid="run-start"
                data-semid="run-start"
                disabled={busy || !ready}
                onClick={start}
              >
                {busy ? 'Starting…' : many ? `Run on ${caseIds.length || 'all'} cases` : 'Start run'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
