import { useEffect, useState } from 'react'
import type { RecordingSummary, Skill, SkillSummary } from '../../../../shared/schemas'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'
import { stepLabel } from '../../lib/humanize'
import { SkillsSection } from '../../library/SkillsSection'
import { MapSection } from '../../library/MapSection'
import type { OnNav } from '../nav'

/**
 * The owner's business knowledge, as simple rows. Rule rows open the one
 * underlying playbook focused on that rule — workflows are never split
 * just to match the visual grouping.
 */

interface PlaybookRow {
  key: string
  title: string
  action: string
  learned: boolean
  skillId: string
  when?: string
  ask?: string
}

/**
 * Split a saved rule in the owner's words ("Damaged in shipping means
 * refund.") into condition and outcome. No keyword invention: when the
 * rule does not parse, callers show it verbatim.
 */
export function splitRule(rule: string): { condition: string; outcome: string } | null {
  const match = /^(.+?)\s+means\s+(.+?)\.?$/i.exec(rule.trim())
  if (!match?.[1] || !match[2]) return null
  return { condition: match[1].trim().replace(/[,\s]+$/, ''), outcome: match[2].trim() }
}

export function PlaybookView({ onNav }: { onNav: OnNav }): React.JSX.Element {
  const [summaries, setSummaries] = useState<SkillSummary[]>([])
  const [skills, setSkills] = useState<Map<string, Skill>>(new Map())
  const [selected, setSelected] = useState<PlaybookRow | null>(null)
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [showTech, setShowTech] = useState(false)
  const [showHow, setShowHow] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      window.ghost.skills
        .list()
        .then(async (rows) => {
          setSummaries(rows.filter((r) => r.activeVersion !== null))
          const full = new Map<string, Skill>()
          for (const row of rows) {
            const skill = await window.ghost.skills.get(row.id)
            if (skill) full.set(row.id, skill)
          }
          setSkills(full)
        })
        .catch((err: unknown) => setError(friendlyError(err)))
    }
    load()
    return window.ghost.library.onChanged(load)
  }, [])

  const rows: PlaybookRow[] = []
  for (const summary of summaries) {
    const skill = skills.get(summary.id)
    const record = skill?.versions.find((v) => v.version === skill.activeVersion)
    const learned = (record?.recordingIds.length ?? 0) > 0
    const decideStep = record?.recipe.steps.find((s) => s.kind === 'decide' && s.rules)
    let matched = false
    if (decideStep?.rules) {
      for (const rule of decideStep.rules) {
        const split = splitRule(rule)
        if (!split) continue
        matched = true
        rows.push({
          key: `${summary.id}:${split.condition}`,
          title: split.condition,
          action: `${split.outcome.charAt(0).toUpperCase()}${split.outcome.slice(1)}`,
          learned,
          skillId: summary.id,
          when: rule,
          ask: 'When the request falls outside the rules.'
        })
      }
    }
    if (!matched) {
      rows.push({
        key: summary.id,
        title: summary.name,
        action: 'Run this process',
        learned,
        skillId: summary.id
      })
    }
  }

  const selectedSkill = selected ? skills.get(selected.skillId) : undefined
  const selectedRecord = selectedSkill?.versions.find(
    (v) => v.version === selectedSkill.activeVersion
  )

  useEffect(() => {
    setRecordings([])
    if (!selectedRecord || selectedRecord.recordingIds.length === 0) return
    window.ghost.recordings
      .list()
      .then((rows) =>
        setRecordings(rows.filter((r) => selectedRecord.recordingIds.includes(r.id)))
      )
      .catch(() => undefined)
  }, [selectedRecord?.version, selectedRecord?.recordingIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {selected === null && (
        <>
          {rows.length === 0 && (
            <p className="muted">
              No playbooks yet.{' '}
              <button type="button" className="btn-link" onClick={() => onNav({ view: 'teach' })}>
                Teach Muse
              </button>{' '}
              your first one.
            </p>
          )}
          <ul className="skill-cards" data-semid="playbook-rows">
            {rows.map((row) => (
              <li key={row.key} className="skill-card" data-semid={`playbook-row-${row.key}`}>
                <div>
                  <strong>{row.title}</strong>
                  <div className="muted">{row.action}</div>
                  <div className="muted">{row.learned ? 'Learned from you' : 'Starter'}</div>
                </div>
                <Button data-semid={`playbook-open-${row.key}`} onClick={() => setSelected(row)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selected !== null && (
        <div data-semid="playbook-detail">
          <p>
            <button type="button" className="btn-link" data-semid="playbook-back" onClick={() => setSelected(null)}>
              ‹ Playbook
            </button>
          </p>
          <h2>{selected.title}</h2>
          <dl className="playbook-facts">
            <dt>Source</dt>
            <dd data-semid="playbook-provenance">{selected.learned ? 'Learned from you' : 'Starter'}</dd>
            <dt>When this applies</dt>
            <dd>{selected.when ?? 'When you run this process.'}</dd>
            <dt>What Muse does</dt>
            <dd>{selected.action} — following the saved process, step by step, with checks.</dd>
            <dt>When Muse asks you</dt>
            <dd>{selected.ask ?? 'When a step cannot be verified, or a case falls outside the process.'}</dd>
          </dl>
          <p>
            <button
              type="button"
              className="btn-link"
              data-semid="playbook-activity"
              onClick={() =>
                onNav({ view: 'library', libraryTab: 'runs', focusSkillId: selected.skillId })
              }
            >
              See related activity
            </button>{' '}
            ·{' '}
            <button
              type="button"
              className="btn-link"
              data-semid="playbook-update"
              onClick={() =>
                onNav({
                  view: 'teach',
                  goal: selectedSkill?.name ?? selected.title,
                  updateSkillId: selected.skillId
                })
              }
            >
              Update this approach
            </button>
          </p>

          <p>
            <button
              type="button"
              className="btn-link"
              data-semid="playbook-how"
              onClick={() => setShowHow((v) => !v)}
            >
              {showHow ? 'Hide' : 'See how this works'}
            </button>
          </p>
          {showHow && (
            <ol className="steps-plain" data-semid="playbook-sequence">
              {(selectedRecord?.recipe.steps ?? []).map((step) => (
                <li key={step.id}>{stepLabel(step)}</li>
              ))}
              {(!selectedRecord || selectedRecord.recipe.steps.length === 0) && (
                <li>Process steps unavailable</li>
              )}
            </ol>
          )}

          {recordings.length > 0 && (
            <section aria-label="Demonstrations">
              <h3>Demonstrations</h3>
              <ul className="skill-cards">
                {recordings.map((rec) => (
                  <li key={rec.id} className="skill-card">
                    <span>{rec.goal}</span>
                    <span className="muted">{new Date(rec.startedAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p>
            <button
              type="button"
              className="btn-link"
              data-semid="playbook-tech"
              onClick={() => setShowTech((v) => !v)}
            >
              {showTech ? 'Hide technical details' : 'Technical details'}
            </button>
          </p>
          {showTech && (
            <div data-semid="playbook-technical">
              <SkillsSection
                focusId={selected.skillId}
                onTeach={() => onNav({ view: 'teach' })}
                onRunSkill={(skillId) => onNav({ view: 'runSetup', skillId })}
              />
              <MapSection onShowSkills={() => setShowTech(true)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
