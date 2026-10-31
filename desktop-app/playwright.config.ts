import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Isolated Saltbreak database for e2e. globalSetup seeds it before the server boots. */
export const E2E_DB_PATH = join(tmpdir(), 'ghost-e2e-saltbreak.db')
export const E2E_PORT = 3100

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  reporter: 'list',
  retries: 0,
  webServer: {
    command: `pnpm dev --port ${E2E_PORT}`,
    cwd: '../web-app/apps/saltbreak',
    url: `http://localhost:${E2E_PORT}/staff/inbox`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      SALTBREAK_DB_PATH: E2E_DB_PATH
    }
  }
})
