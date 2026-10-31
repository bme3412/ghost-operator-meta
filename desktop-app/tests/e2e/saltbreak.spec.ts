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
    await expect(target.locator('[data-semid^="ticket-row-"]')).toHaveCount(3)

    await target.locator('[data-semid="ticket-resolve-T-103"]').click()
    await expect(target.locator('[data-semid="ticket-status-T-103"]')).toContainText('resolved')
  } finally {
    await app.close()
  }
})

test('teach, publish, and assisted reuse on a new ticket', async () => {
  test.setTimeout(240_000)
  const app = await launch()
  try {
    const target = await targetWindow(app)
    const toolbar = await windowByTitle(app, 'Ghost Operator')
    const sidecar = await windowByTitle(app, 'Ghost Operator Guide')
    const studio = await windowByTitle(app, 'Ghost Operator Studio')

    // 1-5. Teach: demonstrate resolving a ticket, with a note.
    await toolbar.getByTestId('toolbar-teach').click()
    await expect(toolbar.getByTestId('toolbar-recording')).toBeVisible()

    await target.locator('[data-semid="nav-staff"]').click()
    await target.locator('[data-semid="nav-staff-inbox"]').click()
    await expect(target.locator('[data-semid="inbox-list"]')).toBeVisible()
    await target.locator('[data-semid="ticket-resolve-T-101"]').click()
    await expect(target.locator('[data-semid="ticket-status-T-101"]')).toContainText('resolved')

    await toolbar.getByTestId('toolbar-note').click()
    await toolbar.getByTestId('note-text').fill('Resolve, do not reply.')
    await toolbar.getByTestId('note-save').click()

    // 6-7. Finish, generate a draft, publish it.
    await toolbar.getByTestId('toolbar-finish').click()
    await studio.locator('[data-semid="studio-section-recordings"]').click()
    await studio.getByRole('option').first().click()
    await expect(studio.locator('[data-semid="recording-events"] tbody tr')).not.toHaveCount(0)
    await studio.locator('[data-semid="generate-draft"]').click()
    await expect(studio.locator('[data-semid="proposal-steps"] li')).toHaveCount(5)
    await expect(studio.locator('[data-semid="proposal-bindings"]')).toContainText('inputs.ticketId')
    await studio.locator('[data-semid="skill-name"]').fill('Resolve support ticket')
    await studio.locator('[data-semid="save-draft"]').click()
    await expect(studio.locator('[data-semid="skill-heading"]')).toContainText(
      'Resolve support ticket'
    )
    await studio.locator('[data-semid="skill-publish"]').click()
    await expect(studio.getByRole('status')).toContainText('published')

    // 8-11. Reuse the skill on a different ticket with an assisted run.
    await sidecar.locator('[data-semid="run-input-ticketId"]').fill('T-102')
    await sidecar.locator('[data-semid="assisted-run"]').click()
    await expect(sidecar.locator('[data-semid="run-succeeded"]')).toBeVisible({ timeout: 60_000 })

    // 12. Verify the resulting business state and the saved run record.
    await expect(target.locator('[data-semid="ticket-status-T-102"]')).toContainText('resolved')

    await studio.locator('[data-semid="studio-section-runs"]').click()
    await studio.getByRole('option').first().click()
    await expect(studio.locator('[data-semid="run-verification"]')).toContainText('text_contains')
  } finally {
    await app.close()
  }
})
