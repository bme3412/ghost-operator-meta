import { useEffect, useRef, useState } from 'react'
import { friendlyError } from '../lib/errors'
import { Button } from './Button'

const MAX_CLIP_MS = 120_000

type Phase = 'idle' | 'listening' | 'transcribing'

function pickMimeType(): string {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

/**
 * Click to talk, click again to stop. The clip is transcribed in the main
 * process and handed to `onTranscript`; nothing is saved until the person
 * saves the note.
 */
export function MicButton({
  onTranscript,
  onError
}: {
  onTranscript: (text: string, source: 'live' | 'canned') => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)

  const release = (): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(
    () => () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      release()
    },
    []
  )

  const start = async (): Promise<void> => {
    try {
      const granted = await window.ghost.recorder.requestMic()
      if (!granted) {
        onError('Microphone access is off. Allow Ghost Operator in System Settings → Privacy → Microphone, or type the note.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        release()
        setPhase('transcribing')
        const type = recorder.mimeType || mimeType || 'audio/webm'
        new Blob(chunks, { type })
          .arrayBuffer()
          .then((buffer) => window.ghost.recorder.transcribe(new Uint8Array(buffer), type))
          .then((result) => onTranscript(result.text, result.source))
          .catch((err: unknown) => onError(friendlyError(err)))
          .finally(() => setPhase('idle'))
      }
      recorderRef.current = recorder
      recorder.start()
      setPhase('listening')
      timerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, MAX_CLIP_MS)
    } catch (err) {
      release()
      setPhase('idle')
      onError(friendlyError(err))
    }
  }

  const stop = (): void => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  return (
    <Button
      className={phase === 'listening' ? 'btn mic-button recording' : 'btn mic-button'}
      data-testid="note-mic"
      data-semid="note-mic"
      aria-pressed={phase === 'listening'}
      disabled={phase === 'transcribing'}
      onClick={() => {
        if (phase === 'listening') stop()
        else if (phase === 'idle') void start()
      }}
    >
      {phase === 'listening' ? 'Stop listening' : phase === 'transcribing' ? 'Transcribing…' : 'Say it'}
    </Button>
  )
}
