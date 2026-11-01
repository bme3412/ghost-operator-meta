import { describe, expect, it } from 'vitest'
import { dockedPanelRect, expandedSplit } from '../../src/main/windows/layout'

const AREA = { x: 0, y: 25, width: 1280, height: 800 }

describe('expandedSplit', () => {
  it('shares the work area side by side with no overlap', () => {
    const { target, panel } = expandedSplit(AREA)
    expect(target.x).toBe(AREA.x)
    expect(panel.x).toBe(target.x + target.width + 8)
    expect(panel.x + panel.width).toBe(AREA.x + AREA.width)
    expect(target.y).toBe(AREA.y)
    expect(panel.y).toBe(AREA.y)
    expect(target.height).toBe(AREA.height)
    expect(panel.height).toBe(AREA.height)
  })

  it('gives the target roughly 58 percent', () => {
    const { target, panel } = expandedSplit(AREA)
    expect(target.width / panel.width).toBeGreaterThan(1.3)
    expect(target.width / panel.width).toBeLessThan(1.5)
  })
})

describe('dockedPanelRect', () => {
  it('docks beside the target at the docked width', () => {
    const target = { x: 24, y: 24, width: 800, height: 700 }
    const rect = dockedPanelRect(target, AREA, 420, 700)
    expect(rect).toEqual({ x: 832, y: 24, width: 420, height: 700 })
  })

  it('returns null when the panel would not fit', () => {
    const target = { x: 24, y: 24, width: 900, height: 700 }
    expect(dockedPanelRect(target, AREA, 420, 700)).toBeNull()
  })

  it('clamps the height to the work area', () => {
    const target = { x: 24, y: 24, width: 800, height: 700 }
    expect(dockedPanelRect(target, AREA, 420, 5000)?.height).toBe(AREA.height)
  })
})
