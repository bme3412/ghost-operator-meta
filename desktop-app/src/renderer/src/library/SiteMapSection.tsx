import { useCallback, useEffect, useMemo, useState } from 'react'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ScoutProgress, ScoutStatus, SiteMap } from '../../../shared/schemas'
import { scoutHrefPath } from '../../../shared/scout'
import { Button } from '../components/Button'
import { friendlyError } from '../lib/errors'

const SITE_X = 40
const SITE_COL = 300
const SITE_ROW = 120
const SITE_COLS = 3

function siteGraph(sitemap: SiteMap): {
  nodes: Array<{ id: string; position: { x: number; y: number }; data: { label: string } }>
  edges: Array<{ id: string; source: string; target: string }>
} {
  const known = new Set(sitemap.pages.map((page) => page.path))
  const nodes = sitemap.pages.map((page, index) => ({
    id: page.path,
    position: {
      x: SITE_X + (index % SITE_COLS) * SITE_COL,
      y: Math.floor(index / SITE_COLS) * SITE_ROW
    },
    data: { label: `${page.path}\n${page.title || 'untitled'}` }
  }))
  const edges: Array<{ id: string; source: string; target: string }> = []
  const seen = new Set<string>()
  for (const page of sitemap.pages) {
    for (const link of page.links) {
      const target = scoutHrefPath(link.href, page.path)
      if (!target || target === page.path || !known.has(target)) continue
      const id = `e-${page.path}-${target}`
      if (seen.has(id)) continue
      seen.add(id)
      edges.push({ id, source: page.path, target })
    }
  }
  return { nodes, edges }
}

function progressText(progress: ScoutProgress): string {
  if (progress.status !== 'running') return `Scan ${progress.status}.`
  return `Scanning ${progress.currentPath} — ${progress.pagesDone}/${progress.pagesTotal} pages`
}

/** Site mode of the Library Task map: the persisted scout page graph plus scan controls. */
export function SiteMapSection(): React.JSX.Element {
  const [status, setStatus] = useState<ScoutStatus | null>(null)
  const [siteName, setSiteName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    window.ghost.scout
      .getStatus()
      .then(setStatus)
      .catch((err: unknown) => setError(friendlyError(err)))
  }, [])

  useEffect(() => {
    refresh()
    window.ghost.target
      .getInfo()
      .then((info) => setSiteName(info.name))
      .catch((err: unknown) => setError(friendlyError(err)))
    // Progress pushes re-read status (cheap, local); library changes pick up
    // the persisted map and mined suggestions after a scan completes.
    const offProgress = window.ghost.scout.onProgress(refresh)
    const offLibrary = window.ghost.library.onChanged(refresh)
    return () => {
      offProgress()
      offLibrary()
    }
  }, [refresh])

  const rescan = (): void => {
    setError(null)
    window.ghost.scout
      .start()
      .then(setStatus)
      .catch((err: unknown) => setError(friendlyError(err)))
  }

  const cancel = (): void => {
    window.ghost.scout
      .cancel()
      .then(setStatus)
      .catch((err: unknown) => setError(friendlyError(err)))
  }

  const graph = useMemo(
    () => (status?.sitemap ? siteGraph(status.sitemap) : { nodes: [], edges: [] }),
    [status?.sitemap]
  )
  const running = status?.running ?? false

  return (
    <div>
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <span className="muted" data-testid="site-scanned-at" data-semid="site-scanned-at">
          {status?.sitemap
            ? `Site map for ${siteName || status.siteId} — scanned ${status.sitemap.scannedAt} (${status.sitemap.pages.length} pages)`
            : `No site map yet for ${siteName || 'this site'}.`}
        </span>
        <Button
          variant="primary"
          data-testid="site-rescan"
          data-semid="site-rescan"
          onClick={rescan}
          disabled={running}
        >
          {status?.sitemap ? 'Rescan' : 'Scan site'}
        </Button>
        {running && (
          <Button data-testid="site-cancel" data-semid="site-cancel" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      {running && status?.progress && (
        <p
          className="muted"
          role="progressbar"
          aria-valuenow={status.progress.pagesDone}
          aria-valuemin={0}
          aria-valuemax={Math.max(status.progress.pagesTotal, 1)}
          data-testid="site-progress"
          data-semid="site-progress"
        >
          {progressText(status.progress)}
        </p>
      )}
      {status?.sitemap && (
        <div className="flow-wrap" data-testid="site-map" data-semid="site-map">
          <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView>
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      )}
    </div>
  )
}
