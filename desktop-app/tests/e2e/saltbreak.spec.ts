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
    const panel = await windowByTitle(app, 'Ghost Operator')
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
    // Starters seed by site profile, not reachability, so they are listed
    // even while the target is down (the empty-state hint stays hidden).
    await expect(panel.locator('[data-semid="home-skills"]')).toContainText(
      'Reconcile payout PO-1043 in Books'
    )

    // Teach and Settings stay reachable while the target is down.
    await panel.getByTestId('panel-teach').click()
    await expect(panel.getByTestId('teach-goal')).toBeVisible()
    await panel.getByTestId('panel-back').click()
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
    const panel = await windowByTitle(app, 'Ghost Operator')

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

    // 9. Home lists the published skill with a Run button (alongside the
    // pre-seeded starters, so scope the button to the taught skill's row).
    await panel.getByTestId('panel-back').click()
    const card = panel.locator('[data-semid="home-skills"]')
    await expect(card).toContainText('Resolve a support ticket')
    await card
      .locator('li', { hasText: 'Resolve a support ticket' })
      .getByRole('button', { name: 'Run' })
      .click()
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

    // 13. The Library shows the saved runs under the skill name.
    await panel.getByTestId('panel-library').click()
    await panel.getByTestId('library-tab-runs').click()
    await panel.getByRole('option').first().click()
    await expect(panel.locator('[data-semid="run-heading"]')).toContainText(
      'Resolve a support ticket'
    )
    await expect(panel.locator('[data-semid="run-verification"]')).toContainText('text_contains')

    // 14. Discover: the teach flow mined a ticket-resolve follow-up.
    await panel.getByTestId('library-tab-map').click()
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

test('home page idea opens Teach with the goal prefilled', async () => {
  const app = await launch()
  try {
    await targetWindow(app)
    const panel = await windowByTitle(app, 'Ghost Operator')
    await expect(panel.locator('[data-semid="page-ideas"]')).toBeVisible({ timeout: 30_000 })
    const teachButtons = panel.locator('[data-semid^="page-idea-teach-"]')
    await expect(teachButtons.first()).toBeVisible()
    await teachButtons.first().click()
    await expect(panel.getByTestId('panel-title')).toContainText('Teach a task')
    await expect(panel.getByTestId('teach-goal')).not.toHaveValue('')
  } finally {
    await app.close()
  }
})

test('teach-view page idea prefills the goal and example', async () => {
  const app = await launch()
  try {
    await targetWindow(app)
    const panel = await windowByTitle(app, 'Ghost Operator')
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
    const panel = await windowByTitle(app, 'Ghost Operator')
    // Owner cards render once the panel sees a /staff/* page.
    await target.goto(`${TARGET_URL}/staff/inbox`)
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
  const panel = await windowByTitle(app, 'Ghost Operator')
  // Starter cards are area-first: land the target in the card's area so the
  // panel's page push deterministically shows it.
  await target.goto(`${TARGET_URL}${startPath}`)
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
    const panel = await windowByTitle(app, 'Ghost Operator')

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
      'Ghost resolved 6 tickets. 1 needs you.',
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
    const panel = await windowByTitle(app, 'Ghost Operator')

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
