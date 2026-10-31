import { z } from 'zod'

/** Validated payload for the scaffold echo channel. Establishes the IPC pattern. */
export const EchoRequest = z.object({
  message: z.string().min(1).max(500)
})
export type EchoRequest = z.infer<typeof EchoRequest>

export const EchoResponse = z.object({
  message: z.string()
})
export type EchoResponse = z.infer<typeof EchoResponse>
