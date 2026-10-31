import { describe, expect, it } from 'vitest'
import { createRecorder } from '../../src/main/recorder/index'
import type { Recording, RecorderStatePush } from '../../src/shared/schemas'

function harness() {
  let now = 1_000_000
  const pushes: RecorderStatePush[] = []
  const persisted: Recording[] = []
  const captures: Array<{ recordingId: string; sequence: number }> = []
  const recorder = createRecorder({
    now: () => now,
    captureScreenshot: async (recordingId, sequence) => {
      captures.push({ recordingId, sequence })
      return `screenshots/${recordingId}-${sequence}.png`
    },
    persistRecording: (recording) => {
      persisted.push(recording)
    },
    onStateChange: (push) => {
      pushes.push(push)
    }
  })
  return {
    recorder,
    pushes,
    persisted,
    captures,
    advance: (ms: number): void => {
      now += ms
    }
  }
}

describe('recorder state machine', () => {
  it('starts idle and starts a recording', () => {
    const { recorder } = harness()
    expect(recorder.getPush().status).toBe('idle')
    const push = recorder.start('Replace a damaged item', 'case-001')
    expect(push.status).toBe('recording')
    expect(push.goal).toBe('Replace a damaged item')
    expect(push.caseId).toBe('case-001')
    expect(push.recordingId).toMatch(/^rec-/)
  })

  it('rejects a second concurrent recording', () => {
    const { recorder } = harness()
    recorder.start('Goal', null)
    expect(() => recorder.start('Other', null)).toThrow()
  })

  it('sequences appended events and screenshots transitions', async () => {
    const { recorder, captures } = harness()
    recorder.start('Goal', 'case-001')
    const appended = await recorder.appendEvents([
      { type: 'navigate', semanticId: 'view-case-case-001', atMs: 1_000_001 },
      { type: 'click', semanticId: 'create-replacement', atMs: 1_000_002 }
    ])
    expect(appended).toBe(2)
    expect(captures).toHaveLength(1)
    expect(captures[0]?.sequence).toBe(0)
    const recording = await recorder.finish()
    expect(recording.events.map((e) => e.sequence)).toEqual([0, 1, 2])
    expect(recording.events[0]?.screenshotRef).toContain('screenshots/')
    expect(recording.events[1]?.screenshotRef).toBeUndefined()
    expect(recording.endedAt).toBeDefined()
  })

  it('drops events while idle or paused', async () => {
    const { recorder } = harness()
    expect(await recorder.appendEvents([{ type: 'click', atMs: 1 }])).toBe(0)
    recorder.start('Goal', null)
    recorder.pause()
    expect(await recorder.appendEvents([{ type: 'click', atMs: 2 }])).toBe(0)
  })

  it('records a gap on pause and a snapshot on resume', async () => {
    const { recorder, advance } = harness()
    recorder.start('Goal', null)
    await recorder.appendEvents([{ type: 'click', atMs: 1_000_001 }])
    recorder.pause()
    advance(30_000)
    await recorder.resume()
    const recording = await recorder.finish()
    const types = recording.events.map((e) => e.type)
    expect(types).toEqual(['click', 'gap', 'state_snapshot', 'state_snapshot'])
    expect(recording.events[2]?.screenshotRef).toContain('screenshots/')
  })

  it('excludes paused time from elapsed time', async () => {
    const { recorder, advance } = harness()
    recorder.start('Goal', null)
    advance(10_000)
    const paused = recorder.pause()
    expect(paused.elapsedMs).toBe(10_000)
    advance(20_000)
    const resumed = await recorder.resume()
    expect(resumed.elapsedMs).toBe(10_000)
  })

  it('attaches notes as events and note entries', () => {
    const { recorder } = harness()
    recorder.start('Goal', null)
    recorder.addNote('Qty comes from the case request.')
    expect(recorder.getPush().eventCount).toBe(1)
    expect(() => recorder.addNote('  ')).toThrow()
  })

  it('persists on finish and resets to idle', async () => {
    const { recorder, persisted, pushes } = harness()
    recorder.start('Goal', 'case-001')
    const recording = await recorder.finish()
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.id).toBe(recording.id)
    expect(recording.applicationScope).toBe('saltbreak')
    expect(recorder.getPush().status).toBe('idle')
    expect(pushes[pushes.length - 1]?.status).toBe('idle')
  })

  it('discards on cancel without persisting', () => {
    const { recorder, persisted } = harness()
    recorder.start('Goal', null)
    recorder.addNote('will be discarded')
    recorder.cancel()
    expect(persisted).toHaveLength(0)
    expect(recorder.getPush().status).toBe('idle')
  })

  it('rejects invalid lifecycle transitions', async () => {
    const { recorder } = harness()
    expect(() => recorder.pause()).toThrow()
    await expect(recorder.resume()).rejects.toThrow()
    await expect(recorder.finish()).rejects.toThrow()
    expect(() => recorder.cancel()).toThrow()
  })

  it('updates context only while a session is active', () => {
    const { recorder } = harness()
    recorder.setContext('case-001')
    expect(recorder.getPush().caseId).toBeNull()
    recorder.start('Goal', null)
    recorder.setContext('case-002')
    expect(recorder.getPush().caseId).toBe('case-002')
  })
})
