import type { IpcMainInvokeEvent } from 'electron'
import { roleForWebContents, type WindowRole } from '../windows/registry'

/** Trusted first-party windows. The target window loads untrusted remote content. */
export const APP_ROLES: readonly WindowRole[] = ['toolbar', 'sidecar', 'studio']

/** Every registered window, including the capture-only target window. */
export const ALL_ROLES: readonly WindowRole[] = ['target', 'toolbar', 'sidecar', 'studio']

/** Only the target window's capture preload. */
export const TARGET_ONLY: readonly WindowRole[] = ['target']

/**
 * Reject IPC from unexpected windows. Only registered app/target windows have
 * a role; popups and any other sender are denied.
 */
export function assertSenderRole(
  event: IpcMainInvokeEvent,
  channel: string,
  allowed: readonly WindowRole[]
): WindowRole {
  const role = roleForWebContents(event.sender)
  if (role === undefined || !allowed.includes(role)) {
    throw new Error(`Forbidden: "${channel}" rejected for ${role ?? 'unknown'} sender.`)
  }
  return role
}
