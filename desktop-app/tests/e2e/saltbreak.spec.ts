import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { E2E_PORT } from '../../playwright.config'

type ElectronApplication = Awaited<ReturnType<typeof electron.launch>>

const TARGET_URL = `http://localhost:${E2E_PORT}`

/**
 * Focused end-to-end coverage against a booted Saltbreak server (see
 * playwright.config.ts webServer) with an isolated Ghost state file.
 * Requires a built bundle (`pnpm build`) and a display.
 */
async function launch(): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      TARGET_URL,
      GHOST_STATE_PATH: join(tmpdir(), `ghost-e2e-state-${process.pid}.json`),
      // Default to the deterministic provider; GHOST_PROVIDER=meta exercises
      // the live-model paths (page ideas, explain) with MODEL_API_KEY set.
      GHOST_PROVIDER: process.env.GHOST_PROVIDER ?? 'fixture'
    }
  })
}

async function targetWindow(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(
      async () => app.windows().filter((w) => w.url().startsWith(TARGET_URL)).length,
      { timeout: 30_000 }
    )
    .toBe(1)
  return app.windows().find((w) => w.url().startsWith(TARGET_URL)) as Page
}

async function windowByTitle(app: ElectronApplication, title: string): Promise<Page> {
  await expect
    .poll(async () => (await Promise.all(app.windows().map((w) => w.title()))).includes(title), {
      timeout: 20_000
    })
    .toBe(true)
  for (const w of app.windows()) {
    if ((await w.title()) === title) return w
  }
  throw new Error(`Window "${title}" did not open.`)
}

test('target ticket resolve flow works through the real UI', async () => {
  const app = await launch()
  try {
    const target = await targetWindow(app)
    await target.locator('[data-semid="nav-staff"]').click()
    await target.locator('[data-semid="nav-staff-inbox"]').click()
    await expect(target.locator('[data-semid="inbox-list"]')).toBeVisible()
    // The seed also carries Atlas backfill tickets (T-104+), so assert the
    // demo tickets this flow needs rather than an exact total row count.
    for (const id of ['T-101', 'T-102', 'T-103']) {
      await expect(target.locator(`[data-semid="ticket-row-${id}"]`)).toBeVisible()
    }

    await target.locator('[data-semid="ticket-resolve-T-103"]').click()
    await expect(target.locator('[data-semid="ticket-status-T-103"]')).toContainText('resolved')
  } finally {
    await app.close()
  }
})

test('target-down launch shows the offline page and panel Home', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      TARGET_URL: 'http://localhost:3999',
      GHOST_STATE_PATH: join(tmpdir(), `ghost-e2e-offline-${process.pid}.json`),
      GHOST_PROVIDER: 'fixture'
    }
  })
  try {
    await expect.poll(async () => app.windows().length, { timeout: 30_000 }).toBe(2)
    const panel = await windowByTitle(app, 'Muse')
    const target = await windowByTitle(app, 'Saltbreak unreachable')

    await expect(target.locator('#status-text')).toContainText(/Checking|Still unreachable/)
    await expect(target.locator('#commands')).toContainText('pnpm dev:saltbreak')
    await expect(panel.locator('[data-semid="home-target-status"]')).toContainText(
      /unreachable/,
      { timeout: 15_000 }
    )
    await expect(panel.locator('[data-semid="home-setup-commands"]')).toContainText(
      'pnpm dev:saltbreak'
    )
    // Starters seed by site profile, not reachability, so their playbook
    // rows are listed even while the target is down.
    await panel.getByTestId('panel-library').click()
    await expect(panel.locator('[data-semid="playbook-rows"]')).toContainText('Damaged in shipping', {
      timeout: 30_000
    })
    await panel.getByTestId('panel-back').click()

    // Teach and Settings stay reachable while the target is down.
    await panel.getByTestId('panel-teach').click()
    await expect(panel.getByTestId('teach-goal')).toBeVisible()
    await panel.getByTestId('panel-back').click()
    await panel.locator('[data-semid="nav-overflow"]').click()
    await panel.getByTestId('panel-settings').click()
    await expect(panel.getByTestId('settings-url')).toHaveValue('http://localhost:3999')
  } finally {
    await app.close()
  }
})

test('teach, publish, and assisted reuse on new tickets', async () => {
  test.setTimeout(240_000)
  const app = await launch()
  try {
    const target = await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')

    // 1. Home shows the live target connection.
    await expect(panel.locator('[data-semid="home-target-status"]')).toContainText('Connected')

    // 2-5. Teach: demonstrate resolving a ticket, with a note.
    await panel.getByTestId('panel-teach').click()
    await panel.getByTestId('teach-goal').fill('Resolve a support ticket')
    await panel.getByTestId('teach-start').click()
    await expect(panel.getByTestId('recording-pill')).toBeVisible()

    await target.locator('[data-semid="nav-staff"]').click()
    await target.locator('[data-semid="nav-staff-inbox"]').click()
    await expect(target.locator('[data-semid="inbox-list"]')).toBeVisible()
    await target.locator('[data-semid="ticket-resolve-T-101"]').click()
    await expect(target.locator('[data-semid="ticket-status-T-101"]')).toContainText('resolved')

    await panel.getByTestId('recording-note').click()
    await panel.getByTestId('note-text').fill('Resolve, do not reply.')
    await panel.getByTestId('note-save').click()

    // 6-7. Finish: the draft generates itself; the skill name comes from the goal.
    await panel.getByTestId('recording-finish').click()
    await expect(panel.locator('[data-testid="review-steps"] li')).toHaveCount(5)
    await expect(panel.locator('[data-testid="review-bindings"]')).toContainText('Ticket ID')
    await expect(panel.locator('[data-testid="review-bindings"]')).toContainText('T-101')
    await expect(panel.locator('[data-semid="skill-name"]')).toHaveValue('Resolve a support ticket')

    // 8. Save and publish moves straight to run setup for the new skill.
    await panel.getByTestId('review-save-publish').click()
    await expect(panel.getByTestId('run-skill')).toBeVisible()

    // 9. The Playbook lists the published skill; inside Technical details,
    // its Run button opens run setup with the taught skill selected.
    await panel.getByTestId('panel-back').click()
    await panel.getByTestId('panel-library').click()
    await panel
      .locator('[data-semid="playbook-rows"] li', { hasText: 'Resolve a support ticket' })
      .getByRole('button', { name: 'Open' })
      .click()
    await panel.locator('[data-semid="playbook-tech"]').click()
    await expect(panel.locator('[data-semid="skill-heading"]')).toContainText(
      'Resolve a support ticket'
    )
    await panel.locator('[data-semid="skill-run"]').click()
    await expect(panel.getByTestId('run-skill')).toBeVisible()

    // 10-11. Reuse the skill on a different ticket with an assisted run. The
    // clean Saltbreak demo preselects "Do it for me".
    await expect(panel.getByTestId('mode-assisted')).toBeChecked()
    await panel.locator('[data-semid="run-input-ticketId"]').fill('T-102')
    await panel.getByTestId('run-start').click()
    await expect(panel.locator('[data-semid="run-succeeded"]')).toBeVisible({ timeout: 60_000 })
    await expect(target.locator('[data-semid="ticket-status-T-102"]')).toContainText('resolved')

    // 12. Run on another case keeps the skill and clears the inputs.
    await panel.getByTestId('run-again').click()
    await expect(panel.locator('[data-semid="run-input-ticketId"]')).toHaveValue('')
    await panel.locator('[data-semid="run-input-ticketId"]').fill('T-103')
    await panel.getByTestId('run-start').click()
    await expect(panel.locator('[data-semid="run-succeeded"]')).toBeVisible({ timeout: 60_000 })
    await expect(target.locator('[data-semid="ticket-status-T-103"]')).toContainText('resolved')

    // 13. Activity shows the saved runs under the skill name.
    await panel.locator('[data-semid="nav-activity"]').click()
    await panel.getByRole('option').first().click()
    await expect(panel.locator('[data-semid="run-heading"]')).toContainText(
      'Resolve a support ticket'
    )
    await expect(panel.locator('[data-semid="run-verification"]')).toContainText('text_contains')

    // 14. Discover: the teach flow mined a ticket-resolve follow-up. The
    // map (and its suggestions) live in the playbook's Technical details.
    await panel.getByTestId('panel-library').click()
    await panel
      .locator('[data-semid="playbook-rows"] li', { hasText: 'Damaged in shipping' })
      .getByRole('button', { name: 'Open' })
      .click()
    await panel.locator('[data-semid="playbook-tech"]').click()
    const suggestions = panel.locator('[data-semid="suggestions-list"]')
    await expect(suggestions).toBeVisible()
    await expect(suggestions.locator('li')).not.toHaveCount(0)
    await expect(suggestions).toContainText('Parameterize T-101')
    await expect(suggestions).toContainText('Record T-101 appears in')

    // 15. Discover: scan the site; the inbox and its ticket form show up in
    // the map (heuristic mining only — no live LLM).
    await panel.getByTestId('map-mode-site').click()
    await panel.getByTestId('site-rescan').click()
    const siteMap = panel.locator('[data-semid="site-map"]')
    await expect(siteMap).toBeVisible({ timeout: 120_000 })
    await expect(siteMap).toContainText('/staff/inbox')
    await expect(suggestions).toContainText('Automate submission on /staff/inbox', {
      timeout: 30_000
    })

    // 16. Discover: accepting a suggestion opens Teach with the goal prefilled.
    await suggestions
      .locator('li', { hasText: 'Parameterize T-101' })
      .getByRole('button', { name: 'Teach this' })
      .click()
    await expect(panel.getByTestId('teach-goal')).toHaveValue(
      'Parameterize T-101 into a reusable skill'
    )
  } finally {
    await app.close()
  }
})

test('page ideas live in Teach, not on Today', async () => {
  const app = await launch()
  try {
    await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')
    // Today is the work briefing only: no generic page ideas there.
    await expect(panel.locator('[data-semid="now-feed"]')).toBeVisible({ timeout: 30_000 })
    await expect(panel.locator('[data-semid="page-ideas"]')).toHaveCount(0)
    await panel.getByTestId('panel-teach').click()
    await expect(panel.locator('[data-semid="page-ideas"]')).toBeVisible({ timeout: 30_000 })
    const teachButtons = panel.locator('[data-semid^="page-idea-teach-"]')
    await expect(teachButtons.first()).toBeVisible()
    await teachButtons.first().click()
    await expect(panel.locator('.view-title')).toContainText('Teach Muse')
    await expect(panel.getByTestId('teach-goal')).not.toHaveValue('')
  } finally {
    await app.close()
  }
})

test('teach-view page idea prefills the goal and example', async () => {
  const app = await launch()
  try {
    await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')
    await panel.getByTestId('panel-teach').click()
    await expect(panel.locator('[data-semid="page-ideas"]')).toBeVisible({ timeout: 30_000 })
    const firstTitle = await panel.locator('[data-semid="page-ideas"] strong').first().textContent()
    await panel.locator('[data-semid^="page-idea-teach-"]').first().click()
    await expect(panel.getByTestId('teach-goal')).toHaveValue(firstTitle ?? '')
    await expect(panel.getByTestId('teach-case')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('starter task opens run setup for the seeded skill', async () => {
  const app = await launch()
  try {
    const target = await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')
    // Starter cards live in Teach now (Home is the Now feed). Owner cards
    // render once the panel sees a /staff/* page.
    await target.goto(`${TARGET_URL}/staff/inbox`)
    await panel.getByTestId('panel-teach').click()
    const starter = panel.locator('[data-semid="starter-teach-reconcile-payout"]')
    await expect(starter).toBeVisible({ timeout: 30_000 })
    await starter.click()
    // The starter is pre-published at first launch, so the card goes straight
    // to run setup (no Review, no duplicate skill) with the example as hint.
    await expect(panel.getByTestId('run-skill')).toBeVisible({ timeout: 30_000 })
    await expect(panel.locator('[data-semid="run-input-payoutId"]')).toHaveAttribute(
      'placeholder',
      'e.g. PO-1043'
    )
  } finally {
    await app.close()
  }
})

/**
 * Demo scenarios A-B: each starter task opens run setup for its pre-seeded
 * skill, then runs it end to end with the fixture provider. Review steps
 * pause for approval; the test approves (and performs the one manual refund
 * in A). These run after the tests above against the same seeded database:
 * T-101 may already be resolved, which the answer-ticket script tolerates.
 */
async function openStarter(
  app: ElectronApplication,
  starterId: string,
  startPath: string
): Promise<{ target: Page; panel: Page }> {
  const target = await targetWindow(app)
  const panel = await windowByTitle(app, 'Muse')
  // Starter cards are area-first: land the target in the card's area so the
  // panel's page push deterministically shows it. They live in Teach now.
  await target.goto(`${TARGET_URL}${startPath}`)
  await panel.getByTestId('panel-teach').click()
  const starter = panel.locator(`[data-semid="starter-teach-${starterId}"]`)
  await expect(starter).toBeVisible({ timeout: 30_000 })
  await starter.click()
  await expect(panel.getByTestId('run-skill')).toBeVisible({ timeout: 30_000 })
  return { target, panel }
}

async function approveGate(panel: Page, stepText: string): Promise<void> {
  await expect(panel.getByTestId('run-current-step')).toContainText(stepText, {
    timeout: 90_000
  })
  const approve = panel.getByTestId('run-approve')
  await expect(approve).toBeVisible({ timeout: 30_000 })
  await approve.click()
}

test('scenario A: reconcile payout PO-1043 through Ghost', async () => {
  test.setTimeout(300_000)
  const app = await launch()
  try {
    const { target, panel } = await openStarter(app, 'reconcile-payout', '/staff/payments')

    // The script has review items, so guided mode is recommended; override to
    // assisted — the review gates still pause for approval.
    await panel.getByTestId('mode-assisted').click()
    await panel.locator('[data-semid="run-input-payoutId"]').fill('PO-1043')
    await panel.getByTestId('run-start').click()

    // Gate 1: exactly one mismatch row for SB-8014.
    await expect(panel.getByTestId('run-current-step')).toContainText(
      'Continue only if exactly one row',
      { timeout: 90_000 }
    )
    // Grid values live in inputs, so match on cell semids: SB-8014's mismatch
    // row (row 9) stays visible while matching rows (e.g. row 3) filter out.
    await expect(target.locator('[data-semid="cell-B9"]')).toBeVisible({ timeout: 30_000 })
    await expect(target.locator('[data-semid="cell-B3"]')).toBeHidden({ timeout: 30_000 })
    await expect(panel.getByTestId('run-approve')).toBeVisible()
    await panel.getByTestId('run-approve').click()

    // Gate 2: refund the duplicate $45 charge on the payout page, then approve.
    await expect(panel.getByTestId('run-current-step')).toContainText('Refund the duplicate', {
      timeout: 90_000
    })
    await expect(panel.getByTestId('run-approve')).toBeVisible()
    const dupRow = target.locator('[data-semid^="payline-row-"]', { hasText: 'SB-8014' }).first()
    await dupRow.locator('[data-semid^="payline-refund-"]').click()
    await expect(dupRow).toContainText('refunded', { timeout: 30_000 })
    await panel.getByTestId('run-approve').click()

    await expect(panel.locator('[data-semid="run-succeeded"]')).toBeVisible({
      timeout: 120_000
    })

    // Outcomes: T-106 resolved with the refund reply, variance back to zero.
    await expect(target.locator('[data-semid="ticket-status-T-106"]')).toContainText('resolved')
    await expect(target.locator('[data-semid="ticket-row-T-106"]')).toContainText(
      'refunded the duplicate'
    )
    await target.goto(`${TARGET_URL}/staff/books`)
    await target.locator('[data-semid^="sheet-row-"] a').first().click()
    await expect(target.locator('[data-semid="cell-value-B1"]')).toHaveText('0', {
      timeout: 30_000
    })
  } finally {
    await app.close()
  }
})

test('scenario B: answer ticket T-101 from product facts', async () => {
  test.setTimeout(300_000)
  const app = await launch()
  try {
    const { target, panel } = await openStarter(app, 'answer-ticket', '/staff/inbox')

    await panel.getByTestId('mode-assisted').click()
    await panel.locator('[data-semid="run-input-ticketId"]').fill('T-101')
    await panel.getByTestId('run-start').click()

    await approveGate(panel, 'Drift board')
    await expect(panel.locator('[data-semid="run-succeeded"]')).toBeVisible({
      timeout: 120_000
    })

    await expect(target.locator('[data-semid="ticket-status-T-101"]')).toContainText('resolved')
    await expect(target.locator('[data-semid="ticket-row-T-101"]')).toContainText('80 L')
  } finally {
    await app.close()
  }
})

test('the Vacation: teach the rules once, then Ghost works the after-hours pile', async () => {
  test.setTimeout(420_000)
  const app = await launch()
  try {
    const target = await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')

    // Thursday: Maya says her rules, then refunds one damaged board herself.
    await panel.getByTestId('panel-teach').click()
    await panel.getByTestId('teach-goal').fill('Handle after-hours support tickets')
    await panel.getByTestId('teach-start').click()
    await expect(panel.getByTestId('recording-pill')).toBeVisible()

    await target.goto(`${TARGET_URL}/staff/inbox`)
    await expect(target.locator('[data-semid="ticket-body-T-201"]')).toContainText('damaged in shipping')

    await panel.getByTestId('recording-note').click()
    await panel
      .getByTestId('note-text')
      .fill('Damaged in shipping means refund. Wrong size means exchange. Anything else, ask me.')
    await panel.getByTestId('note-save').click()

    await target.locator('[data-semid="ticket-refund-T-201"]').click()
    await expect(target.locator('[data-semid="ticket-status-T-201"]')).toContainText('resolved')

    // The draft turns the spoken rules into a decide step.
    await panel.getByTestId('recording-finish').click()
    const rules = panel.locator('[data-semid="rules-card"]')
    await expect(rules).toBeVisible({ timeout: 30_000 })
    await expect(rules).toContainText('Damaged in shipping means refund.')
    await expect(rules).toContainText('Wrong size means exchange.')
    await panel.getByTestId('review-save-publish').click()
    // If open work already matches the saved approach, Review offers its
    // review first; take the run-once path to reach run setup either way.
    const runOnce = panel.locator('[data-semid="review-run-once"]')
    await expect
      .poll(
        async () =>
          (await runOnce.isVisible().catch(() => false)) ||
          (await panel
            .getByTestId('run-skill')
            .isVisible()
            .catch(() => false)),
        { timeout: 30_000 }
      )
      .toBe(true)
    if (await runOnce.isVisible().catch(() => false)) await runOnce.click()
    await expect(panel.getByTestId('run-skill')).toBeVisible({ timeout: 30_000 })

    // Friday: run it on the rest of the pile and leave.
    await panel.locator('[data-semid="scope-many"]').check()
    await panel
      .locator('[data-semid="run-case-list"]')
      .fill('T-202, T-203, T-204, T-205, T-206, T-207, T-208')
    await expect(panel.locator('[data-semid="run-case-count"]')).toContainText('7 cases')
    await panel.getByTestId('run-start').click()

    // The beach: one honest summary. The chargeback comes back to Maya.
    await expect(panel.locator('[data-semid="batch-headline"]')).toHaveText(
      'Muse resolved 6 tickets. 1 needs your judgment.',
      { timeout: 360_000 }
    )
    await expect(panel.locator('[data-semid="batch-item-T-207"]')).toHaveAttribute(
      'data-status',
      'escalated'
    )
    await expect(panel.locator('[data-semid="batch-item-T-207"]')).toContainText('chargeback')
    await expect(panel.locator('[data-semid="batch-item-T-202"]')).toContainText(
      'Wrong size means exchange.'
    )
    // Partial completion is split honestly: the chargeback is an owner
    // decision, not a failure, and completed cases list separately.
    await expect(panel.locator('[data-semid="batch-needs-decision"]')).toContainText('T-207')
    await expect(panel.locator('[data-semid="batch-items"]')).toContainText('T-202')
    await expect(panel.locator('[data-semid="batch-playbook"]')).toContainText('version')
    // No NTFY_TOPIC in tests: the panel says so instead of pretending.
    await expect(panel.locator('[data-semid="batch-notify"]')).toContainText('NTFY_TOPIC')

    await target.goto(`${TARGET_URL}/staff/inbox`)
    for (const id of ['T-203', 'T-205', 'T-208']) {
      await expect(target.locator(`[data-semid="ticket-resolution-${id}"]`)).toContainText(/refund/i)
    }
    for (const id of ['T-202', 'T-204', 'T-206']) {
      await expect(target.locator(`[data-semid="ticket-resolution-${id}"]`)).toContainText(/exchange/i)
    }
    await expect(target.locator('[data-semid="ticket-status-T-207"]')).toContainText('open')
  } finally {
    await app.close()
  }
})

test('recorded clicks carry selector candidates', async () => {
  const app = await launch()
  try {
    const target = await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')

    // Demonstrate listing the shop from the Saltbreak home page. The link has
    // no data-semid, so capture must still record a replayable chain.
    await panel.getByTestId('panel-teach').click()
    await panel.getByTestId('teach-goal').fill('List all shop products')
    await panel.getByTestId('teach-start').click()
    await expect(panel.getByTestId('recording-pill')).toBeVisible()
    await target.getByRole('link', { name: /View all 8/ }).click()
    await expect(target.locator('[data-semid="shop-max"]')).toBeVisible({ timeout: 30_000 })

    await panel.getByTestId('recording-finish').click()
    await expect(panel.getByTestId('review-steps')).toBeVisible({ timeout: 30_000 })

    // The persisted recording is the ground truth: find the click on the
    // "View all" link and require a non-empty selector chain.
    const statePath = join(tmpdir(), `ghost-e2e-state-${process.pid}.json`)
    await expect
      .poll(
        () => {
          interface StoredEvent {
            type: string
            targetLabel?: string
            selectorCandidates?: string[]
          }
          try {
            const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
              recordings: Array<{ events: StoredEvent[] }>
            }
            const events = state.recordings.flatMap((r) => r.events)
            return events.find(
              (e) => e.type === 'click' && (e.targetLabel ?? '').includes('View all')
            )?.selectorCandidates
          } catch {
            return undefined
          }
        },
        { timeout: 30_000 }
      )
      .toEqual(expect.arrayContaining([expect.any(String)]))
  } finally {
    await app.close()
  }
})

test('now feed clusters new damage reports and runs the covered batch', async () => {
  test.setTimeout(420_000)
  const app = await launch()
  try {
    const target = await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')

    // Two new damaged-item reports arrive through the storefront help form.
    // (Runs after the Vacation: the pile itself is already worked, and the
    // refunds there are the precedent the feed cites.)
    for (const message of ['Screen cracked in the mail', 'Arrived broken in the box']) {
      await target.goto(`${TARGET_URL}/order/SB-2101`)
      await target.locator('[data-semid="order-help-reason"]').selectOption('Damaged item')
      await target.locator('[data-semid="order-help-message"]').fill(message)
      await target.locator('[data-semid="order-help-submit"]').click()
      await expect(target.locator('[data-semid="order-help-confirm"]')).toBeVisible({
        timeout: 30_000
      })
    }

    // Today clusters them as Ready, citing the earlier refunds. Opening the
    // item shows the cases and rule; nothing runs until Approve.
    const item = panel.locator('[data-semid^="feed-item-damaged:"]')
    await expect(item).toBeVisible({ timeout: 60_000 })
    await expect(item).toContainText('You resolved')
    await expect(panel.locator('[data-semid="feed-summary"]')).toContainText('ready for review')
    await item.locator('[data-semid^="feed-review-"]').click()
    await expect(panel.locator('[data-semid="work-item-rule"]')).toContainText('Damaged in shipping')
    const cases = await panel.locator('[data-semid="work-item-cases"]').textContent()
    const caseIds = [...(cases ?? '').matchAll(/T-\d+/g)].map((match) => match[0])
    expect(caseIds).toHaveLength(2)

    // Approve the batch and watch it resolve both tickets.
    await panel.locator('[data-semid="feed-run-approve"]').click()
    await expect(panel.locator('[data-semid="batch-headline"]')).toHaveText(
      'Muse resolved 2 tickets. Nothing needs your judgment.',
      { timeout: 360_000 }
    )

    // Back home: the cluster is gone and the outcome is in Recent activity.
    await panel.locator('[data-semid="batch-done"]').click()
    await expect(panel.locator('[data-semid^="feed-item-damaged:"]')).toHaveCount(0, {
      timeout: 60_000
    })
    await expect(panel.locator('[data-semid="feed-recent"]')).toContainText('batch finished', {
      timeout: 60_000
    })
  } finally {
    await app.close()
  }
})

test('open case shows the request in Saltbreak without starting automation', async () => {
  const app = await launch()
  try {
    const target = await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')

    // The chargeback has no covering rule, so Today offers the case itself.
    const item = panel.locator('[data-semid="feed-item-chargeback:T-207"]')
    await expect(item).toBeVisible({ timeout: 60_000 })
    await item.locator('[data-semid="feed-review-chargeback:T-207"]').click()
    await expect(panel.locator('[data-semid="work-item-cases"]')).toContainText('T-207')
    await expect(panel.locator('[data-semid="work-item-rule"]')).toContainText(
      'No matching rule'
    )

    await panel.locator('[data-semid="work-item-open-case"]').click()
    await expect.poll(() => target.url(), { timeout: 30_000 }).toContain('/staff/inbox')
    await expect(target.locator('[data-semid="ticket-row-T-207"]')).toBeVisible({
      timeout: 30_000
    })

    // Context only: Muse stays on the review and nothing was executed.
    await expect(panel.locator('[data-semid="work-item-open-case"]')).toBeVisible()
    await expect(panel.locator('[data-semid="batch-headline"]')).toHaveCount(0)
    await expect(target.locator('[data-semid="ticket-status-T-207"]')).toContainText('open')
  } finally {
    await app.close()
  }
})

test('playbook shows the saved rule verbatim and related activity is filtered', async () => {
  const app = await launch()
  try {
    await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')

    await panel.getByTestId('panel-library').click()
    await expect(panel.locator('.view-title')).toContainText('Playbook')
    await panel
      .locator('[data-semid="playbook-rows"] li', { hasText: 'Damaged in shipping' })
      .first()
      .getByRole('button', { name: 'Open' })
      .click()
    // The owner's rule appears word for word, not as a keyword summary.
    await expect(panel.locator('[data-semid="playbook-detail"]')).toContainText(
      'Damaged in shipping means refund.'
    )

    await panel.locator('[data-semid="playbook-activity"]').click()
    await expect(panel.locator('.view-title')).toContainText('Activity')
    await expect(panel.locator('[data-semid="activity-filter"]')).toContainText(
      'Handle after-hours support tickets'
    )
    // Every run still listed belongs to that one playbook.
    const runs = panel.getByRole('option')
    const count = await runs.count()
    for (let i = 0; i < count; i++) {
      await expect(runs.nth(i)).toContainText('Handle after-hours support tickets')
    }
  } finally {
    await app.close()
  }
})

test('an unrelated playbook has no refund-specific explanation', async () => {
  const app = await launch()
  try {
    await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')

    await panel.getByTestId('panel-library').click()
    await panel
      .locator('[data-semid="playbook-rows"] li', { hasText: 'Reconcile payout' })
      .first()
      .getByRole('button', { name: 'Open' })
      .click()
    const detail = panel.locator('[data-semid="playbook-detail"]')
    await expect(detail).toContainText('Starter')
    await panel.locator('[data-semid="playbook-how"]').click()
    const sequence = panel.locator('[data-semid="playbook-sequence"]')
    await expect(sequence).toBeVisible()
    await expect(sequence).not.toContainText(/refund or exchange/i)
    await expect(detail).not.toContainText('Your rule:')
  } finally {
    await app.close()
  }
})

test('update this approach carries the existing playbook into Teach', async () => {
  const app = await launch()
  try {
    await targetWindow(app)
    const panel = await windowByTitle(app, 'Muse')

    await panel.getByTestId('panel-library').click()
    await panel
      .locator('[data-semid="playbook-rows"] li', { hasText: 'Damaged in shipping' })
      .first()
      .getByRole('button', { name: 'Open' })
      .click()
    await panel.locator('[data-semid="playbook-update"]').click()
    await expect(panel.locator('.view-title')).toContainText('Teach Muse')
    // The existing playbook's name is carried in, so saving revises it
    // (the no-duplicate append is covered by the skills unit tests).
    await expect(panel.getByTestId('teach-goal')).toHaveValue(
      'Handle after-hours support tickets'
    )
    await panel.getByTestId('teach-cancel').click()
    await expect(panel.locator('[data-semid="now-feed"]')).toBeVisible({ timeout: 30_000 })
  } finally {
    await app.close()
  }
})
