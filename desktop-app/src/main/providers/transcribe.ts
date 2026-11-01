export interface TranscribeEnv {
  TRANSCRIBE_BASE_URL?: string
  TRANSCRIBE_API_KEY?: string
  TRANSCRIBE_MODEL?: string
}

export interface Transcript {
  text: string
  /** "live" from the transcription endpoint; "canned" for offline rehearsal. */
  source: 'live' | 'canned'
}

/** Offline stand-in so the spoken-rules beat rehearses without a key. */
export const CANNED_TRANSCRIPT =
  'Damaged in shipping means refund. Wrong size means exchange. Anything else, ask me.'

/** Upper bound on one recorded clip (about two minutes of Opus audio). */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav'
}

function fileName(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  return `note.${EXTENSIONS[base] ?? 'webm'}`
}

/**
 * Turn a short spoken clip into note text through any OpenAI-compatible
 * /audio/transcriptions endpoint. Without a key, returns the canned
 * transcript so the demo flow still works offline.
 */
export async function transcribe(
  audio: Uint8Array,
  mimeType: string,
  env: TranscribeEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<Transcript> {
  if (audio.byteLength === 0) throw new Error('No audio was recorded.')
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error('That clip is too long; keep notes under two minutes.')
  const apiKey = env.TRANSCRIBE_API_KEY?.trim()
  if (!apiKey) return { text: CANNED_TRANSCRIPT, source: 'canned' }
  const baseUrl = (env.TRANSCRIBE_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')
  const form = new FormData()
  const bytes = new Uint8Array(audio.byteLength)
  bytes.set(audio)
  form.append('file', new Blob([bytes], { type: mimeType }), fileName(mimeType))
  form.append('model', env.TRANSCRIBE_MODEL?.trim() || 'whisper-1')
  form.append('response_format', 'json')
  let response: Response
  try {
    response = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000)
    })
  } catch (error) {
    throw new Error(`Transcription request failed: ${(error as Error).message}`)
  }
  if (!response.ok) throw new Error(`Transcription returned HTTP ${response.status}.`)
  const body = (await response.json()) as { text?: unknown }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) throw new Error('Transcription came back empty. Try again or type the note.')
  return { text: text.slice(0, 2000), source: 'live' }
}
