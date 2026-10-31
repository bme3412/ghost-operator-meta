import { describe, expect, it } from 'vitest'
import {
  inPageNavigateToEmit,
  nextNavigateToEmit,
  pathnameOfHttpUrl
} from '../../src/shared/capture/navigate'

describe('SPA navigate dedup', () => {
  it('emits the first observed path', () => {
    expect(nextNavigateToEmit(null, '/staff/inbox')).toBe('/staff/inbox')
  })

  it('drops a consecutive duplicate path', () => {
    expect(nextNavigateToEmit('/staff/inbox', '/staff/inbox')).toBeNull()
  })

  it('emits when the path changes, including back-navigation', () => {
    expect(nextNavigateToEmit('/staff/inbox', '/staff')).toBe('/staff')
    expect(nextNavigateToEmit('/staff', '/staff/inbox')).toBe('/staff/inbox')
  })
})

describe('in-page navigation verdict', () => {
  it('emits main-frame http(s) navigations to a new path', () => {
    expect(inPageNavigateToEmit(null, 'http://localhost:3000/staff/inbox', true)).toBe(
      '/staff/inbox'
    )
    expect(inPageNavigateToEmit('/', 'https://example.com/staff', true)).toBe('/staff')
  })

  it('stays silent for subframes, duplicates, and non-web URLs', () => {
    expect(inPageNavigateToEmit(null, 'http://localhost:3000/staff', false)).toBeNull()
    expect(inPageNavigateToEmit('/staff', 'http://localhost:3000/staff', true)).toBeNull()
    expect(inPageNavigateToEmit(null, 'file:///tmp/x.html', true)).toBeNull()
    expect(inPageNavigateToEmit(null, 'not a url', true)).toBeNull()
  })

  it('treats a post-load hydration replaceState as no movement', () => {
    // did-navigate syncs the tracker to the committed path at commit time, so
    // the hydration replaceState to that same path emits nothing at any Teach
    // timing, while a real route change still emits.
    const synced = pathnameOfHttpUrl('http://localhost:3000/')
    expect(inPageNavigateToEmit(synced, 'http://localhost:3000/', true)).toBeNull()
    expect(inPageNavigateToEmit(synced, 'http://localhost:3000/staff/inbox', true)).toBe(
      '/staff/inbox'
    )
  })
})

describe('pathnameOfHttpUrl', () => {
  it('extracts pathnames from web URLs and rejects the rest', () => {
    expect(pathnameOfHttpUrl('http://localhost:3000/staff/inbox?a=b#c')).toBe('/staff/inbox')
    expect(pathnameOfHttpUrl('https://example.com/')).toBe('/')
    expect(pathnameOfHttpUrl('file:///tmp/x.html')).toBeNull()
    expect(pathnameOfHttpUrl('about:blank')).toBeNull()
    expect(pathnameOfHttpUrl('not a url')).toBeNull()
  })
})
