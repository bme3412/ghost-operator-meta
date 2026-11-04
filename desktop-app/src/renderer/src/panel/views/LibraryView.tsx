import { PlaybookView } from './PlaybookView'
import { RunsSection } from '../../library/RunsSection'
import type { LibraryTab, OnNav } from '../nav'

/**
 * Playbook and Activity are first-class panel destinations (the panel tab
 * row is the only navigation). Recordings and the shop map live inside
 * playbook detail under Technical details.
 */
export function LibraryView({
  tab,
  focusId,
  focusSkillId,
  onNav
}: {
  tab: LibraryTab
  focusId?: string
  focusSkillId?: string
  onNav: OnNav
}): React.JSX.Element {
  if (tab === 'runs') {
    return (
      <RunsSection
        focusId={focusId ?? null}
        focusSkillId={focusSkillId}
        onRunSkill={() => onNav({ view: 'runSetup' })}
        onOpenBatch={(batchId) => onNav({ view: 'batch', batchId })}
      />
    )
  }
  return <PlaybookView onNav={onNav} />
}
