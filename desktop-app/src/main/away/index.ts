import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { BatchRecord } from '../../shared/schemas'
import { batchHeadline, summarizeBatch } from '../runner/batch'
import { getBatch } from '../store'
import { resolveTargetUrl } from '../target'
import { renderAwayPage } from './page'

export interface AwayEnv {
  NTFY_TOPIC?: string
  NTFY_SERVER?: string
  GHOST_AWAY_HOST?: string
  GHOST_AWAY_PORT?: string
  GHOST_AWAY_SECRET?: string
}

const DEFAULT_PORT = 3200
const DEFAULT_NTFY_SERVER = 'https://ntfy.sh'

/** First non-internal IPv4 address, so a phone on the same Wi-Fi can reach us. */
export function lanAddress(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return null
}

export function awayHost(env: AwayEnv = process.env): string {
  return env.GHOST_AWAY_HOST?.trim() || lanAddress() || '127.0.0.1'
}

export function awayPort(env: AwayEnv = process.env): number {
  const port = Number(env.GHOST_AWAY_PORT)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT
}

/**
 * Links carry an HMAC of the batch id: the page shows customer messages, so
 * someone else on the network can't enumerate batches. Without
 * GHOST_AWAY_SECRET, links stay valid until the app restarts.
 */
const sessionSecret = randomBytes(32).toString('hex')

function secret(env: AwayEnv): string {
  return env.GHOST_AWAY_SECRET?.trim() || sessionSecret
}

export function awayToken(batchId: string, env: AwayEnv = process.env): string {
  return createHmac('sha256', secret(env)).update(batchId).digest('hex').slice(0, 24)
}

function tokenMatches(batchId: string, token: string, env: AwayEnv): boolean {
  const expected = Buffer.from(awayToken(batchId, env))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export function awayUrlFor(batchId: string, env: AwayEnv = process.env): string {
  return `http://${awayHost(env)}:${awayPort(env)}/away/${encodeURIComponent(batchId)}?k=${awayToken(batchId, env)}`
}

/**
 * Link to a case in the target app, rewritten so a phone on the same
 * network can open it (localhost means the laptop, not the phone).
 */
export function caseUrlFor(caseId: string, targetUrl: string, host: string): string | null {
  try {
    const url = new URL('/staff/inbox', targetUrl)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') url.hostname = host
    url.hash = caseId
    return url.toString()
  } catch {
    return null
  }
}

export interface NtfyRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/** The phone notification: headline as title, one line per case as body. */
export function buildNtfyRequest(
  batch: BatchRecord,
  opts: { server: string; topic: string; clickUrl: string }
): NtfyRequest {
  const { handled, escalated, failed } = summarizeBatch(batch)
  const lines = [
    ...escalated.map((i) => `Needs you: ${i.caseId}. ${i.reason ?? ''}`.trim()),
    ...failed.map((i) => `Didn't finish: ${i.caseId}`),
    ...handled.map((i) => `${i.choice ? i.choice.charAt(0).toUpperCase() + i.choice.slice(1) : 'Done'}: ${i.caseId}`)
  ]
  return {
    url: `${opts.server.replace(/\/$/, '')}/${encodeURIComponent(opts.topic)}`,
    headers: {
      Title: batchHeadline(batch),
      Click: opts.clickUrl,
      Tags: escalated.length + failed.length > 0 ? 'ocean,warning' : 'ocean,white_check_mark',
      Priority: escalated.length + failed.length > 0 ? 'high' : 'default'
    },
    body: lines.join('\n') || 'Nothing to report.'
  }
}

/** Push the batch summary to the owner's phone through ntfy. */
export async function notifyBatchFinished(
  batch: BatchRecord,
  env: AwayEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<{ notifiedAt?: string; notifyError?: string }> {
  const topic = env.NTFY_TOPIC?.trim()
  if (!topic) return { notifyError: 'NTFY_TOPIC is not set, so no phone notification was sent.' }
  const request = buildNtfyRequest(batch, {
    server: env.NTFY_SERVER?.trim() || DEFAULT_NTFY_SERVER,
    topic,
    clickUrl: awayUrlFor(batch.id, env)
  })
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) return { notifyError: `ntfy returned HTTP ${response.status}.` }
    return { notifiedAt: new Date().toISOString() }
  } catch (error) {
    return { notifyError: `ntfy request failed: ${(error as Error).message}` }
  }
}

let server: Server | null = null

/** Serve the away pages on the LAN. Safe to call more than once. */
export function startAwayServer(env: AwayEnv = process.env): Server {
  if (server) return server
  const host = awayHost(env)
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`)
    const match = /^\/away\/([^/]+)$/.exec(url.pathname)
    if (req.method !== 'GET' || !match) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
      return
    }
    const batchId = decodeURIComponent(match[1] ?? '')
    const batch = tokenMatches(batchId, url.searchParams.get('k') ?? '', env) ? getBatch(batchId) : null
    if (!batch) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('This link has expired.')
      return
    }
    const targetUrl = resolveTargetUrl()
    res
      .writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'X-Content-Type-Options': 'nosniff'
      })
      .end(renderAwayPage(batch, { caseUrl: (caseId) => caseUrlFor(caseId, targetUrl, host) }))
  })
  server.on('error', (error) => {
    console.warn(`[away] page server unavailable: ${(error as Error).message}`)
  })
  server.listen(awayPort(env), host)
  return server
}

export function stopAwayServer(): void {
  server?.close()
  server = null
}
