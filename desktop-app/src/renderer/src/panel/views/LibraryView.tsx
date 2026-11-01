import { useEffect, useState } from 'react'
import { MapSection } from '../../library/MapSection'
import { RecordingsSection } from '../../library/RecordingsSection'
import { RunsSection } from '../../library/RunsSection'
import { SkillsSection } from '../../library/SkillsSection'
import type { LibraryTab, OnNav } from '../nav'

/** Workflow order: demonstrate, compile, run, then inspect the map. */
const TABS: Array<{ id: LibraryTab; label: string }> = [
  { id: 'recordings', label: 'Recordings' },
  { id: 'skills', label: 'Skills' },
  { id: 'runs', label: 'Runs' },
  { id: 'map', label: 'Task map' }
]

export function LibraryView({
  tab,
  focusId,
  onNav
}: {
  tab: LibraryTab
  focusId?: string
  onNav: OnNav
}): React.JSX.Element {
  const [active, setActive] = useState<LibraryTab>(tab)
  const [focusSkill, setFocusSkill] = useState<string | null>(null)
  const [focusRecording, setFocusRecording] = useState<string | null>(null)
  const [focusRun, setFocusRun] = useState<string | null>(null)

  useEffect(() => {
    setActive(tab)
    setFocusSkill(tab === 'skills' ? (focusId ?? null) : null)
    setFocusRecording(tab === 'recordings' ? (focusId ?? null) : null)
    setFocusRun(tab === 'runs' ? (focusId ?? null) : null)
  }, [tab, focusId])

  return (
    <div>
      <nav className="section-nav" aria-label="Library tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className={`tab${active === entry.id ? ' selected' : ''}`}
            data-testid={`library-tab-${entry.id}`}
            data-semid={`library-tab-${entry.id}`}
            onClick={() => setActive(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {active === 'skills' && (
        <SkillsSection focusId={focusSkill} onTeach={() => onNav({ view: 'teach' })} />
      )}
      {active === 'runs' && (
        <RunsSection focusId={focusRun} onRunSkill={() => onNav({ view: 'runSetup' })} />
      )}
      {active === 'recordings' && (
        <RecordingsSection
          focusId={focusRecording}
          onTeach={() => onNav({ view: 'teach' })}
          onSkillSaved={(skillId) => {
            setFocusSkill(skillId)
            setActive('skills')
          }}
        />
      )}
      {active === 'map' && <MapSection onShowSkills={() => setActive('skills')} />}
    </div>
  )
}
