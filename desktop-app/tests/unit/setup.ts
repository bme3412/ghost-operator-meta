import { vi } from 'vitest'

/** Unit tests exercise main-process logic without the Electron runtime. */
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: (): string => process.cwd(),
    getPath: (): string => process.cwd()
  },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: vi.fn(),
  screen: { getDisplayMatching: vi.fn() }
}))
