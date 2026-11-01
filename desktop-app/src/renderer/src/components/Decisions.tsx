import type { DecisionRecord } from '../../../shared/schemas'
import { ESCALATE } from '../../../shared/schemas/run'
import { humanizeKey } from '../lib/humanize'

/** "refund" → "Refund"; escalation reads as a hand-back, not a choice. */
export function choiceLabel(choice: string): string {
  return choice === ESCALATE ? 'Handed back to you' : humanizeKey(choice)
}

/** The owner's rules, verbatim, as Ghost will apply them. */
export function RulesCard({
  rules,
  options
}: {
  rules: string[]
  options?: string[]
}): React.JSX.Element {
  return (
    <div className="rules-card" data-semid="rules-card">
      <strong>Your rules</strong>
      <ul>
        {rules.map((rule) => (
          <li key={rule}>“{rule}”</li>
        ))}
      </ul>
      <p className="muted">
        Ghost picks {options && options.length > 0 ? options.join(' or ') : 'a choice'} only when
        one of these clearly fits. Anything else comes back to you.
      </p>
    </div>
  )
}

/** Each judgment call, quoting the rule it applied or why it handed back. */
export function DecisionList({ decisions }: { decisions: DecisionRecord[] }): React.JSX.Element | null {
  if (decisions.length === 0) return null
  return (
    <ul className="decision-list" data-semid="run-decisions">
      {decisions.map((d, index) => (
        <li
          key={`${d.stepId}-${index}`}
          className={d.choice === ESCALATE ? 'decision escalated' : 'decision'}
          data-semid={`run-decision-${d.choice}`}
        >
          <strong>{choiceLabel(d.choice)}</strong>
          {d.rule ? (
            <span> — matched your rule “{d.rule}”</span>
          ) : (
            <span> — {d.reason}</span>
          )}
          {d.evidence && <div className="muted decision-evidence">Case: {d.evidence}</div>}
        </li>
      ))}
    </ul>
  )
}
