import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { MapSection } from './MapSection'
import { RecordingsSection } from './RecordingsSection'
import { RunsSection } from './RunsSection'
import { SkillsSection } from './SkillsSection'

type Section = 'recordings' | 'skills' | 'runs' | 'map'

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'recordings', label: 'Recordings' },
  { id: 'skills', label: 'Skills' },
  { id: 'runs', label: 'Runs' },
  { id: 'map', label: 'Task map' }
]

function StudioApp(): React.JSX.Element {
  const [section, setSection] = useState<Section>('recordings')
  const [focusRecording, setFocusRecording] = useState<string | null>(null)
  const [focusSkill, setFocusSkill] = useState<string | null>(null)
  const [focusRun, setFocusRun] = useState<string | null>(null)

  useEffect(() => {
    return window.ghost.studio.onShow((payload) => {
      if (
        payload.section === 'recordings' ||
        payload.section === 'skills' ||
        payload.section === 'runs'
      ) {
        setSection(payload.section as Section)
      }
      if (payload.recordingId) setFocusRecording(payload.recordingId)
      if (payload.runId) setFocusRun(payload.runId)
    })
  }, [])

  return (
    <main className="page wide">
      <header className="app-header">
        <h1 data-testid="studio-heading" data-semid="studio-title">
          Studio
        </h1>
      </header>
      <nav className="section-nav" aria-label="Studio sections">
        {SECTIONS.map((entry) => (
          <button
            key={entry.id}
            className={`tab${section === entry.id ? ' selected' : ''}`}
            data-semid={`studio-section-${entry.id}`}
            onClick={() => setSection(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {section === 'recordings' && (
        <RecordingsSection
          focusId={focusRecording}
          onSkillSaved={(skillId) => {
            setFocusSkill(skillId)
            setSection('skills')
          }}
        />
      )}
      {section === 'skills' && <SkillsSection focusId={focusSkill} />}
      {section === 'runs' && <RunsSection focusId={focusRun} />}
      {section === 'map' && <MapSection />}
    </main>
  )
}

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <StudioApp />
    </StrictMode>
  )
}
