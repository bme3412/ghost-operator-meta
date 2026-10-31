import type { GhostApi } from './index'

declare global {
  // First-party app windows expose the full bridge. The target window
  // (untrusted remote content) exposes the minimal GhostTargetApi subset.
  interface Window {
    ghost: GhostApi
  }
}

export {}
