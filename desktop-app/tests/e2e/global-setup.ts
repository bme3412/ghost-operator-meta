import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webApp = resolve(here, '..', '..', '..', 'web-app')
const dbPath = join(tmpdir(), 'ghost-e2e-saltbreak.db')

/** Seed a fresh isolated Saltbreak database before the webServer boots. */
export default function globalSetup(): void {
  for (const suffix of ['', '-shm', '-wal', '-journal']) {
    rmSync(`${dbPath}${suffix}`, { force: true })
  }
  execFileSync('pnpm', ['--filter', '@saltbreak/data', 'seed'], {
    cwd: webApp,
    env: { ...process.env, SALTBREAK_DB_PATH: dbPath },
    stdio: 'inherit',
    timeout: 180_000
  })
}
