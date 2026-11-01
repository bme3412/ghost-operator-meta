import { useEffect, useState } from 'react'
import type { RunRecord } from '../../../../shared/schemas'
import { Button } from '../../components/Button'
import { DecisionList } from '../../components/Decisions'
import { friendlyError } from '../../lib/errors'
import { checkLabel, humanizeKey } from '../../lib/humanize'
import type { OnNav } from '../nav'

export function ResultView({ onNav, runId }: { onNav: OnNav; runId: string }): React.JSX.Element {
  const [record, setRecord] = useState<RunRecord | null>(null)
  const [skillName, setSkillName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.ghost.runs
      .get(runId)
      .then((next) => {
        if (!next) {
          setError(`Run ${runId} was not found.`)
          return
        }
        setRecord(next)
        window.ghost.skills
          .get(next.skillId)
          .then((skill) => setSkillName(skill?.name ?? next.skillId))
          .catch(() => setSkillName(next.skillId))
      })
      .catch((err: unknown) => setError(friendlyError(err)))
  }, [runId])

  if (error !== null) {
    return (
      <p className="alert-error" role="alert">
        {error}
      </p>
    )
  }
  if (!record) {
    return <p className="muted">Loading run result…</p>
  }

  const succeeded = record.status === 'succeeded'

  return (
    <div>
      <section className="card" aria-label="Run result">
        {succeeded ? (
          <p className="alert-success" role="status" data-semid="run-succeeded">
            {skillName ?? record.skillId} ran successfully. Business state verified.
          </p>
        ) : record.status === 'escalated' ? (
          <p className="alert-warn" role="status" data-semid="run-escalated">
            Ghost handed this case back to you instead of guessing.
          </p>
        ) : (
          <p className="alert-warn" role="status" data-semid="run-ended">
            {skillName ?? record.skillId} run {record.status}.
          </p>
        )}
        {record.error && (
          <p className="alert-error" role="alert">
            {friendlyError(record.error)}
          </p>
        )}
        {Object.keys(record.inputs).length > 0 && (
          <p className="muted">
            {Object.entries(record.inputs)
              .map(([key, value]) => `${humanizeKey(key)}: ${value}`)
              .join(' · ')}
          </p>
        )}
        <DecisionList decisions={record.decisions} />
        {record.checks.length > 0 && (
          <ul data-semid="run-checks">
            {record.checks.map((check, index) => (
              <li key={`${check.check}-${index}`}>
                {check.passed ? '✓' : '✗'} {checkLabel(check.check)}{' '}
                <span className="muted">— {check.observed}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="field">
          <Button
            variant="primary"
            data-testid="run-again"
            data-semid="run-again"
            onClick={() => onNav({ view: 'runSetup', skillId: record.skillId })}
          >
            Run on another case
          </Button>
          <Button
            data-testid="run-details"
            data-semid="run-details"
            onClick={() => onNav({ view: 'library', libraryTab: 'runs', focusId: record.id })}
          >
            See details
          </Button>
        </div>
      </section>
    </div>
  )
}
