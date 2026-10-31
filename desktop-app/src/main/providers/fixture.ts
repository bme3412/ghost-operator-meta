import type { Proposal, Recording, RecordingEvent, SkillStep } from '../../shared/schemas'
import { orderedAttemptSelectors } from '../../shared/capture/selectors'
import { TARGET } from '../../shared/target'

/**
 * Curated tap-to-run demo scripts for the Saltbreak starter tasks. Each is a
 * hand-authored recipe: deterministic steps automate the mechanical path and
 * `review` steps pause where a person must judge, approve, or pay. Run on a
 * fresh reset; the scripts assume the seeded demo data.
 */

function gotoStep(id: string, goal: string, path: string): SkillStep {
  return {
    id,
    kind: 'computer_task',
    applicationId: TARGET.id,
    goal,
    bindings: { action: 'goto', value: path },
    dataRefs: [],
    checks: []
  }
}

function clickStep(id: string, goal: string, selector: string, why?: string): SkillStep {
  return {
    id,
    kind: 'computer_task',
    applicationId: TARGET.id,
    goal,
    ...(why ? { why } : {}),
    bindings: { action: 'click', selector },
    dataRefs: [],
    checks: []
  }
}

function fillStep(id: string, goal: string, selector: string, value: string): SkillStep {
  return {
    id,
    kind: 'computer_task',
    applicationId: TARGET.id,
    goal,
    bindings: { action: 'fill', selector, value },
    dataRefs: [],
    checks: []
  }
}

function submitStep(id: string, goal: string, selector: string): SkillStep {
  return {
    id,
    kind: 'computer_task',
    applicationId: TARGET.id,
    goal,
    bindings: { action: 'submit', selector },
    dataRefs: [],
    checks: []
  }
}

function reviewStep(id: string, goal: string): SkillStep {
  return { id, kind: 'review', applicationId: TARGET.id, goal, bindings: {}, dataRefs: [], checks: [] }
}

function verifyTextStep(id: string, goal: string, selector: string, expected: string): SkillStep {
  return {
    id,
    kind: 'verify',
    goal,
    expected: `The page shows "${expected}".`,
    bindings: {},
    dataRefs: [],
    checks: [{ name: 'text_contains', selector, expected }]
  }
}

const T101_ANSWER =
  'The Drift 8\'0" foamie (96 x 22 x 3 in, about 80 L of volume) floats riders up to around 200 lb, so it is a great first board for you. Want help picking a leash to go with it?'

const T106_REPLY =
  'You were right — TidePay charged the $45.00 towel twice on SB-8014. I refunded the duplicate; it should land back within a few days. Sorry for the trouble!'

function scriptedRecipe(id: string, goal: string, steps: SkillStep[]): Proposal['recipe'] {
  return {
    schemaVersion: 1,
    id,
    version: 1,
    goal,
    inputSchemaRef: 'TargetProcedureInput',
    steps,
    allowedApplications: [TARGET.id],
    allowedTools: []
  }
}

function reconcilePayout(): Proposal {
  return {
    recipe: scriptedRecipe('reconcile-payout', 'Reconcile payout {{inputs.payoutId}} in Books.', [
      gotoStep('goto-payments', 'Open Staff, then Payments.', '/staff/payments'),
      clickStep('open-payout', 'Open the payout.', '[data-semid="payout-row-{{inputs.payoutId}}"] a'),
      clickStep('send-to-books', 'Send the payout to Books.', '[data-semid="send-books"]'),
      fillStep('filter-mismatches', 'Filter the Match column to mismatches.', '[data-semid="match-filter"]', 'No'),
      reviewStep(
        'gate-mismatch',
        'Continue only if exactly one row shows Match No for order SB-8014. Anything else (for example PO-1044\u2019s clean sheet, whose missing T-104 refund needs a ticket cross-check instead) means a different problem — stop and report it.'
      ),
      fillStep('note-action', 'Note the resolution on the mismatched row.', '[data-semid="cell-I9"]', 'Duplicate charge, refunded'),
      gotoStep('back-to-payout', 'Go back to the payout.', '/staff/payments/{{inputs.payoutId}}'),
      reviewStep(
        'do-refund',
        'Refund the duplicate $45.00 charge on SB-8014 (either of the two identical lines), then approve.'
      ),
      gotoStep('open-books', 'Open Books.', '/staff/books'),
      clickStep(
        'open-sheet',
        'Open the reconciliation sheet.',
        '[data-semid^="sheet-row-"] a',
        'On a fresh reset the payout sheet is the first one.'
      ),
      verifyTextStep('verify-variance', 'Confirm the variance reads zero.', '[data-semid="cell-value-B1"]', '0'),
      gotoStep('open-inbox', 'Open the support inbox.', '/staff/inbox'),
      fillStep('reply-t106', 'Reply to T-106 about the refund.', '[data-semid="ticket-reply-T-106"]', T106_REPLY),
      submitStep('send-reply', 'Send the reply.', '[data-semid="ticket-reply-form-T-106"]'),
      clickStep('resolve-t106', 'Resolve T-106.', '[data-semid="ticket-resolve-T-106"]'),
      verifyTextStep(
        'verify-ticket-resolved',
        'Verify the ticket shows as resolved.',
        '[data-semid="ticket-status-T-106"]',
        'resolved'
      )
    ]),
    unresolved: ['Run this on a fresh reset: it opens the first Books sheet and assumes the seeded payout data.'],
    demonstrated: { 'Payout "PO-1043"': 'inputs.payoutId' },
    notes: []
  }
}

function answerTicket(): Proposal {
  return {
    recipe: scriptedRecipe('answer-ticket', 'Answer ticket {{inputs.ticketId}} from product facts.', [
      reviewStep(
        'gate-known-question',
        'Continue only if the ticket asks about the Drift board\u2019s float (T-101). T-109\u2019s tote dimensions are not in the catalog — stop this run instead of guessing an answer.'
      ),
      gotoStep('open-inbox', 'Open the support inbox.', '/staff/inbox'),
      gotoStep('open-product', 'Open the board and read its facts.', '/product/SB-BOARD-001'),
      gotoStep('back-to-inbox', 'Go back to the inbox.', '/staff/inbox'),
      fillStep(
        'write-reply',
        'Write the reply from the product facts.',
        '[data-semid="ticket-reply-{{inputs.ticketId}}"]',
        T101_ANSWER
      ),
      submitStep('send-reply', 'Send the reply.', '[data-semid="ticket-reply-form-{{inputs.ticketId}}"]'),
      clickStep('resolve-ticket', 'Resolve the ticket.', '[data-semid="ticket-resolve-{{inputs.ticketId}}"]'),
      verifyTextStep(
        'verify-ticket-resolved',
        'Verify the ticket shows as resolved.',
        '[data-semid="ticket-status-{{inputs.ticketId}}"]',
        'resolved'
      )
    ]),
    unresolved: ['The reply text is curated for T-101; other tickets stop at the first review step.'],
    demonstrated: { 'Ticket "T-101"': 'inputs.ticketId' },
    notes: []
  }
}

function shopUnderBudget(): Proposal {
  return {
    recipe: scriptedRecipe('shop-under-budget', 'Find an in-stock beginner board under ${{inputs.maxDollars}} and add it to the cart.', [
      gotoStep(
        'open-shop-filtered',
        'Open the shop filtered to Surfboards under budget, cheapest first.',
        '/shop?category=Surfboards&max={{inputs.maxDollars}}&sort=price-asc'
      ),
      reviewStep(
        'pick-board',
        'Confirm SB-BOARD-001 (Drift 8\u20190") is in stock and the best fit; stop if nothing in stock fits the budget.'
      ),
      clickStep('open-board', 'Open the best match.', '[data-semid="product-card-SB-BOARD-001"]'),
      clickStep('add-to-cart', 'Add it to the cart.', '[data-semid="add-to-cart"]'),
      gotoStep('open-cart', 'Open the cart.', '/cart'),
      fillStep('enter-promo', 'Enter the active promo code.', '[data-semid="cart-promo-code"]', 'HARBOR10'),
      clickStep('apply-promo', 'Apply the promo code.', '[data-semid="cart-promo-apply"]'),
      verifyTextStep('verify-promo', 'Verify the promo applied.', '[data-semid="cart-promo-status"]', 'applied'),
      reviewStep('pay-yourself', 'Checkout needs a person: pay for the order yourself, then approve.')
    ]),
    unresolved: ['Run this on a fresh reset: it assumes the seeded catalog, stock, and HARBOR10 promo.'],
    demonstrated: { 'Budget "500"': 'inputs.maxDollars' },
    notes: []
  }
}

function reportOrderCharge(): Proposal {
  return {
    recipe: scriptedRecipe('report-order-charge', 'Report a billing problem on order {{inputs.orderId}}.', [
      gotoStep('open-order', 'Open the order.', '/order/{{inputs.orderId}}'),
      fillStep('pick-reason', 'Pick the help reason.', '[data-semid="order-help-reason"]', '{{inputs.reason}}'),
      fillStep(
        'write-message',
        'Describe the problem.',
        '[data-semid="order-help-message"]',
        'Order {{inputs.orderId}}: {{inputs.reason}}. Please advise.'
      ),
      submitStep('submit-request', 'Submit the help request.', '[data-semid="order-help-form"]'),
      verifyTextStep(
        'verify-ticket-created',
        'Verify the confirmation that a ticket was created.',
        '[data-semid="order-help-confirm"]',
        'created'
      )
    ]),
    unresolved: [],
    demonstrated: { 'Order "SB-8014"': 'inputs.orderId', 'Reason "Charged twice"': 'inputs.reason' },
    notes: []
  }
}

const SCRIPTED: Record<string, () => Proposal> = {
  'reconcile-payout': reconcilePayout,
  'answer-ticket': answerTicket,
  'shop-under-budget': shopUnderBudget,
  'report-order-charge': reportOrderCharge
}

/** Scripted ids with canned fixture proposals, for the Saltbreak starter tasks. */
export function scriptedIds(): string[] {
  return Object.keys(SCRIPTED)
}

/**
 * Canned offline proposal for a starter task id, or null when unknown. Lets
 * the demo run end to end with the fixture provider and no demonstration.
 */
export function scriptedProposal(id: string): Proposal | null {
  const build = SCRIPTED[id]
  return build ? build() : null
}

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

const ELEMENT_LABELS: Array<[RegExp, string]> = [
  [/^ticket-resolve-/, 'Resolved for the ticket'],
  [/^nav-staff-inbox$/, 'the support inbox'],
  [/^nav-staff$/, 'Staff']
]

/**
 * Plain-language label for a demonstrated element ("ticket-resolve-t-101" →
 * "Resolved for the ticket"). Trailing record-identity segments are dropped
 * so the label reads the same on every run.
 */
function elementLabel(semid: string): string {
  for (const [pattern, label] of ELEMENT_LABELS) {
    if (pattern.test(semid)) return label
  }
  const words = semid.split('-').filter((word) => word.length > 1 && !/^\d+$/.test(word))
  const label = (words.length > 0 ? words : [semid]).join(' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
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
            `A click on "${event.targetLabel ?? event.targetRole ?? 'an element'}" couldn't be matched reliably, so it needs your review before each run.`
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
            goal: `Click ${elementLabel(semid)}.`,
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
          unresolved.push(
            "An input couldn't be matched reliably, so it needs your review before each run."
          )
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
            goal: `Fill ${elementLabel(semid)}.`,
            ...(fillCandidates ? { selectorCandidates: fillCandidates } : {}),
            bindings: { action: 'fill', selector: fillSelector, value: event.value ?? '' },
            dataRefs: [],
            checks: []
          },
          event.sequence
        )
        if (event.value) {
          unresolved.push(
            `This step reuses "${event.value}" exactly as demonstrated — it won't adapt to each case yet.`
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
          unresolved.push("A form submission couldn't be matched reliably, so it was skipped.")
          return
        }
        const submitSelector = substitute(event.selector)
        const submitCandidates = stepCandidates(event, submitSelector)
        push(
          {
            id: `submit-${slug(event.semanticId ?? 'form')}`,
            kind: 'computer_task',
            applicationId: scope,
            goal: `Submit ${event.semanticId ? elementLabel(event.semanticId) : 'the form'}.`,
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
    unresolved.push(
      `You paused ${gapCount} time${gapCount === 1 ? '' : 's'} during the demonstration; check the steps around each pause.`
    )
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
