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
      GHOST_PROVIDER: 'fixture'
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
    await expect(panel.locator('[data-semid="home-checklist"]')).toBeVisible()

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

    // 9. Home lists the published skill with a Run button.
    await panel.getByTestId('panel-back').click()
    const card = panel.locator('[data-semid="home-skills"]')
    await expect(card).toContainText('Resolve a support ticket')
    await card.getByRole('button', { name: 'Run' }).click()
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
