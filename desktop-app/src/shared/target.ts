/** The web application Ghost Operator teaches, guides, and assists. */
export const TARGET = {
  id: 'saltbreak',
  name: 'Saltbreak',
  defaultUrl: 'http://localhost:3000'
} as const

export type TargetId = typeof TARGET.id

export interface TargetInfo {
  id: string
  name: string
  url: string
}
