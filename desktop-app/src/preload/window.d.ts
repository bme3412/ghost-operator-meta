import type { GhostApi } from './index'

declare global {
  interface Window {
    ghost: GhostApi
  }
}

export {}
