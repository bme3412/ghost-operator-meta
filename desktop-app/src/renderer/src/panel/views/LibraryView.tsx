import { useEffect, useState } from 'react'
import { MapSection } from '../../library/MapSection'
import { RecordingsSection } from '../../library/RecordingsSection'
import { RunsSection } from '../../library/RunsSection'
import { SkillsSection } from '../../library/SkillsSection'
import type { LibraryTab } from '../nav'

const TABS: Array<{ id: LibraryTab; label: string }> = [
  { id: 'skills', label: 'Skills' },
  { id: 'runs', label: 'Runs' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'map', label: 'Task map' }
]

export function LibraryView({
  tab,
  focusId
}: {
  tab: LibraryTab
  focusId?: string
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
        <SkillsSection focusId={focusSkill} onNavigate={() => setActive('recordings')} />
      )}
      {active === 'runs' && <RunsSection focusId={focusRun} />}
      {active === 'recordings' && (
        <RecordingsSection
          focusId={focusRecording}
          onSkillSaved={(skillId) => {
            setFocusSkill(skillId)
            setActive('skills')
          }}
        />
      )}
      {active === 'map' && <MapSection />}
    </div>
  )
}
