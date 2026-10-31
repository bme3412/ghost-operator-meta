import { TARGET } from '../target'

export const ALLOWED_SCOPES: readonly string[] = [TARGET.id]

export function isAllowedScope(scope: string): boolean {
  return (ALLOWED_SCOPES as readonly string[]).includes(scope)
}
