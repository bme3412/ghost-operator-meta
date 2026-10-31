import type { Proposal, Recording, RecordingEvent, SkillStep } from '../../shared/schemas'
import { orderedAttemptSelectors } from '../../shared/capture/selectors'
import { TARGET } from '../../shared/target'

interface StepEvidence {
  step: SkillStep
  afterSeq: number
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'taught-procedure'
  )
}

function demonstratedIdentity(events: RecordingEvent[]): string | null {
  for (const event of events) {
    if (event.recordIdentity) return event.recordIdentity
  }
  return null
}

/**
 * Deterministic offline proposal generator.
 * Maps demonstrated DOM events to replayable target-window steps and
 * parameterizes the demonstrated record identity as a run input.
 */
export function compileFixture(recording: Recording): Proposal {
  const events = recording.events
  // The site the demonstration ran on; Saltbreak recordings emit exactly the
  // historical output (applicationId/allowedApplications "saltbreak").
  const scope = recording.applicationScope
  const scopeName = scope === TARGET.id ? TARGET.name : scope
  const identity = demonstratedIdentity(events)
  const inputName = identity && /^T-\d+$/.test(identity) ? 'ticketId' : 'recordId'
  const substitute = (template: string): string =>
    identity ? template.split(identity).join(`{{inputs.${inputName}}}`) : template

  /**
   * Replay chain for a step: the substituted primary plus the event's
   * substituted fallbacks. Undefined when the event carries no chain, so
   * recordings without candidates compile exactly as before.
   */
  const stepCandidates = (event: RecordingEvent, primary: string): string[] | undefined => {
    if (!event.selectorCandidates || event.selectorCandidates.length === 0) return undefined
    const ordered = orderedAttemptSelectors(
      primary,
      event.selectorCandidates.map(substitute)
    )
    const extras = ordered.slice(1)
    return extras.length > 0 ? extras : undefined
  }

  const steps: StepEvidence[] = []
  const unresolved: string[] = []
  const usedIds = new Set<string>()
  const seenPaths = new Set<string>()

  const push = (step: SkillStep, afterSeq: number): void => {
    let id = step.id
    let suffix = 2
    while (usedIds.has(id)) {
      id = `${step.id}-${suffix}`
      suffix += 1
    }
    usedIds.add(id)
    steps.push({ step: { ...step, id }, afterSeq })
  }

  const lastClickBefore = (index: number): RecordingEvent | null => {
    for (let i = index - 1; i >= 0 && i >= index - 2; i--) {
      if (events[i]?.type === 'click') return events[i] ?? null
    }
    return null
  }

  events.forEach((event, index) => {
    switch (event.type) {
      case 'navigate': {
        const path = event.value ?? '/'
        if (seenPaths.has(path)) return
        seenPaths.add(path)
        push(
          {
            id: path === '/' ? 'goto-home' : `goto-${slug(path)}`,
            kind: 'computer_task',
            applicationId: scope,
            goal: `Open ${path} in ${scopeName}.`,
            why: 'Every run starts from the demonstrated page.',
            expected: 'The page is loaded.',
            bindings: { action: 'goto', value: path },
            dataRefs: [],
            checks: []
          },
          event.sequence
        )
        return
      }
      case 'click': {
        if (!event.selector) {
          unresolved.push(
            `A click on "${event.targetLabel ?? event.targetRole ?? 'an element'}" has no stable selector; it became a review step.`
          )
          push(
            {
              id: 'review-click',
              kind: 'review',
              applicationId: scope,
              goal: `Reproduce the click on "${event.targetLabel ?? 'the demonstrated element'}".`,
              bindings: {},
              dataRefs: [],
              checks: []
            },
            event.sequence
          )
          return
        }
        const semid = event.semanticId ?? 'element'
        const clickSelector = substitute(event.selector)
        const clickCandidates = stepCandidates(event, clickSelector)
        push(
          {
            id: `click-${slug(semid)}`,
            kind: 'computer_task',
            applicationId: scope,
            goal: `Click ${semid}.`,
            why: 'This click was part of the demonstration.',
            expected: 'The target responds as demonstrated.',
            ...(clickCandidates ? { selectorCandidates: clickCandidates } : {}),
            bindings: { action: 'click', selector: clickSelector },
            dataRefs: [],
            checks: []
          },
          event.sequence
        )
        const resolveMatch = /^ticket-resolve-(.+)$/.exec(semid)
        if (resolveMatch && identity) {
          push(
            {
              id: 'verify-ticket-resolved',
              kind: 'verify',
              goal: 'Verify the ticket shows as resolved.',
              why: 'A click is not proof; the persisted ticket state must show it.',
              expected: 'The ticket status reads resolved.',
              bindings: {},
              dataRefs: [],
              checks: [
                {
                  name: 'text_contains',
                  selector: `[data-semid="ticket-status-{{inputs.${inputName}}}"]`,
                  expected: 'resolved'
                }
              ]
            },
            event.sequence
          )
        }
        return
      }
      case 'input_commit':
      case 'select': {
        if (!event.selector) {
          unresolved.push('An input without a stable selector became a review step.')
          push(
            {
              id: 'review-input',
              kind: 'review',
              applicationId: scope,
              goal: `Reproduce the demonstrated input${event.value ? ` ("${event.value}")` : ''}.`,
              bindings: {},
              dataRefs: [],
              checks: []
            },
            event.sequence
          )
          return
        }
        const semid = event.semanticId ?? 'field'
        const fillSelector = substitute(event.selector)
        const fillCandidates = stepCandidates(event, fillSelector)
        push(
          {
            id: `fill-${slug(semid)}`,
            kind: 'computer_task',
            applicationId: scope,
            goal: `Fill ${semid}.`,
            ...(fillCandidates ? { selectorCandidates: fillCandidates } : {}),
            bindings: { action: 'fill', selector: fillSelector, value: event.value ?? '' },
            dataRefs: [],
            checks: []
          },
          event.sequence
        )
        if (event.value) {
          unresolved.push(
            `Fill replays the demonstrated value "${event.value}"; edit the binding to parameterize it.`
          )
        }
        return
      }
      case 'submit': {
        // A submit right after a click on the same record is the click's
        // consequence (e.g. a server-action POST), not a second action.
        const prior = lastClickBefore(index)
        if (prior && prior.recordIdentity && prior.recordIdentity === event.recordIdentity) return
        if (!event.selector) {
          unresolved.push('A submit without a stable hook was skipped.')
          return
        }
        const submitSelector = substitute(event.selector)
        const submitCandidates = stepCandidates(event, submitSelector)
        push(
          {
            id: `submit-${slug(event.semanticId ?? 'form')}`,
            kind: 'computer_task',
            applicationId: scope,
            goal: `Submit ${event.semanticId ?? 'the form'}.`,
            ...(submitCandidates ? { selectorCandidates: submitCandidates } : {}),
            bindings: { action: 'submit', selector: submitSelector },
            dataRefs: [],
            checks: []
          },
          event.sequence
        )
        return
      }
      default:
        return
    }
  })

  const gapCount = events.filter((e) => e.type === 'gap').length
  if (gapCount > 0) {
    unresolved.push(`The demonstration has ${gapCount} pause gap(s); review the steps around them.`)
  }
  if (steps.length === 0) {
    unresolved.push('No replayable actions were demonstrated.')
  }

  for (const note of recording.notes) {
    let target: StepEvidence | null = null
    for (const candidate of steps) {
      if (candidate.afterSeq <= note.sequence) target = candidate
    }
    if (target) {
      const prior = target.step.why ? `${target.step.why} ` : ''
      target.step.why = `${prior}Demonstrator note: ${note.text}`
    }
  }

  return {
    recipe: {
      schemaVersion: 1,
      id: slug(recording.goal),
      version: 1,
      goal: recording.goal,
      inputSchemaRef: 'TargetProcedureInput',
      steps: steps.map((s) => s.step),
      allowedApplications: [scope],
      allowedTools: []
    },
    unresolved,
    demonstrated: identity
      ? { [`Ticket "${identity}"`]: `inputs.${inputName}` }
      : {},
    notes: recording.notes.map((n) => n.text)
  }
}
