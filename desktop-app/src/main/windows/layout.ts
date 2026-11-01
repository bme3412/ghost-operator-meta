/** Pure window-geometry for the panel's docked/expanded layouts. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Gap between the target and panel windows, in both layouts. */
export const LAYOUT_GAP = 8

/** Target share of the work area when the panel is expanded. */
export const EXPANDED_TARGET_SHARE = 0.58

/**
 * Expanded layout: the two windows share the work area side by side —
 * target left (~58%), panel right (~42%), same top, full height, no overlap.
 */
export function expandedSplit(area: Rect): { target: Rect; panel: Rect } {
  const targetWidth = Math.floor((area.width - LAYOUT_GAP) * EXPANDED_TARGET_SHARE)
  return {
    target: { x: area.x, y: area.y, width: targetWidth, height: area.height },
    panel: {
      x: area.x + targetWidth + LAYOUT_GAP,
      y: area.y,
      width: area.width - targetWidth - LAYOUT_GAP,
      height: area.height
    }
  }
}

/**
 * Docked layout: the panel sits right of the target at its docked width,
 * keeping its current height (clamped to the work area). Null when the
 * panel would not fit beside the target.
 */
export function dockedPanelRect(target: Rect, area: Rect, dockedWidth: number, height: number): Rect | null {
  const x = target.x + target.width + LAYOUT_GAP
  if (x + dockedWidth > area.x + area.width) return null
  return { x, y: target.y, width: dockedWidth, height: Math.min(height, area.height) }
}
