import { describe, expect, it } from 'vitest'
import { createRecorder } from '../../src/main/recorder/index'
import { RecorderStatePush } from '../../src/shared/schemas'
import type { Recording, RecorderStatePush as RecorderStatePushType } from '../../src/shared/schemas'

function harness() {
  let now = 1_000_000
  const pushes: RecorderStatePushType[] = []
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

describe('recorder lastEvent tracking', () => {
  it('omits lastEvent while idle and on start', () => {
    const { recorder } = harness()
    expect(recorder.getPush().lastEvent).toBeUndefined()
    const push = recorder.start('Goal', null)
    expect(push.lastEvent).toBeUndefined()
  })

  it('summarizes appended events in the push', async () => {
    const { recorder, pushes } = harness()
    recorder.start('Goal', null)
    await recorder.appendEvents([
      { type: 'click', targetLabel: 'Resolve', semanticId: 'ticket-resolve', atMs: 1_000_001 }
    ])
    expect(recorder.getPush().lastEvent).toEqual({
      type: 'click',
      label: 'Clicked Resolve',
      atMs: 1_000_001
    })
    expect(pushes[pushes.length - 1]?.lastEvent?.label).toBe('Clicked Resolve')
  })

  it('tracks the last event of a batch', async () => {
    const { recorder } = harness()
    recorder.start('Goal', null)
    await recorder.appendEvents([
      { type: 'navigate', value: '/staff/inbox', atMs: 1_000_001 },
      { type: 'input_commit', targetLabel: 'Quantity', atMs: 1_000_002 }
    ])
    expect(recorder.getPush().lastEvent).toEqual({
      type: 'input_commit',
      label: 'Filled Quantity',
      atMs: 1_000_002
    })
  })

  it('summarizes selects and navigations', async () => {
    const { recorder } = harness()
    recorder.start('Goal', null)
    await recorder.appendEvents([{ type: 'select', semanticId: 'refund-reason', atMs: 1_000_001 }])
    expect(recorder.getPush().lastEvent?.label).toBe('Selected refund-reason')
    await recorder.appendEvents([{ type: 'navigate', value: '/staff/inbox', atMs: 1_000_002 }])
    expect(recorder.getPush().lastEvent).toEqual({
      type: 'navigate',
      label: 'Opened /staff/inbox',
      atMs: 1_000_002
    })
  })

  it('summarizes notes', () => {
    const { recorder, advance } = harness()
    recorder.start('Goal', null)
    advance(5_000)
    recorder.addNote('Qty comes from the case request.')
    expect(recorder.getPush().lastEvent).toEqual({
      type: 'note',
      label: 'Note Qty comes from the case request.',
      atMs: 1_005_000
    })
  })

  it('keeps the last append/note summary across pause and resume', async () => {
    const { recorder } = harness()
    recorder.start('Goal', null)
    await recorder.appendEvents([{ type: 'click', targetLabel: 'Resolve', atMs: 1_000_001 }])
    const paused = recorder.pause()
    expect(paused.lastEvent?.label).toBe('Clicked Resolve')
    const resumed = await recorder.resume()
    expect(resumed.lastEvent?.label).toBe('Clicked Resolve')
  })

  it('clears lastEvent on finish and cancel', async () => {
    const { recorder } = harness()
    recorder.start('Goal', null)
    await recorder.appendEvents([{ type: 'click', atMs: 1_000_001 }])
    await recorder.finish()
    expect(recorder.getPush().lastEvent).toBeUndefined()
    recorder.start('Goal', null)
    await recorder.appendEvents([{ type: 'click', atMs: 1_000_002 }])
    recorder.cancel()
    expect(recorder.getPush().lastEvent).toBeUndefined()
  })
})

describe('recorder push schema compat', () => {
  it('parses legacy pushes that omit lastEvent', () => {
    const legacy = {
      status: 'recording',
      recordingId: 'rec-1',
      goal: 'Goal',
      caseId: null,
      startedAt: new Date(1_000_000).toISOString(),
      eventCount: 2,
      elapsedMs: 500
    }
    expect(RecorderStatePush.parse(legacy).lastEvent).toBeUndefined()
  })

  it('parses new pushes carrying lastEvent', () => {
    const next = {
      status: 'recording',
      recordingId: 'rec-1',
      goal: 'Goal',
      caseId: null,
      startedAt: new Date(1_000_000).toISOString(),
      eventCount: 2,
      elapsedMs: 500,
      lastEvent: { type: 'click', label: 'Clicked Resolve', atMs: 1_000_001 }
    }
    expect(RecorderStatePush.parse(next).lastEvent?.label).toBe('Clicked Resolve')
  })

  it('lets legacy-shaped readers strip the new field', () => {
    const legacyShape = RecorderStatePush.omit({ lastEvent: true })
    const parsed = legacyShape.parse({
      status: 'recording',
      recordingId: 'rec-1',
      goal: 'Goal',
      caseId: null,
      startedAt: new Date(1_000_000).toISOString(),
      eventCount: 2,
      elapsedMs: 500,
      lastEvent: { type: 'click', label: 'Clicked Resolve', atMs: 1_000_001 }
    })
    expect('lastEvent' in parsed).toBe(false)
  })
})
