import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Recording, RunRecord, Skill, SkillSummary } from '../../../shared/schemas'

const X_MAIN = 40
const X_SIDE = 460
const ROW = 120

function bindingLabel(bindings: Record<string, string>): string {
  const entries = Object.entries(bindings)
  if (entries.length === 0) return ''
  return entries.map(([name, path]) => `${name} ← ${path}`).join(', ')
}

export function MapSection(): React.JSX.Element {
  const [summaries, setSummaries] = useState<SkillSummary[]>([])
  const [skillId, setSkillId] = useState('')
  const [skill, setSkill] = useState<Skill | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.ghost.skills
      .list()
      .then((rows) => {
        setSummaries(rows)
        setSkillId((current) => current || rows[0]?.id || '')
      })
      .catch((err: unknown) => setError(String(err)))
    window.ghost.runs
      .list()
      .then(setRuns)
      .catch((err: unknown) => setError(String(err)))
  }, [])

  useEffect(() => {
    setSkill(null)
    if (!skillId) return
    window.ghost.skills
      .get(skillId)
      .then((next) => {
        setSkill(next)
        setVersion(next?.activeVersion ?? next?.versions[next.versions.length - 1]?.version ?? null)
      })
      .catch((err: unknown) => setError(String(err)))
  }, [skillId])

  const record = skill?.versions.find((v) => v.version === version) ?? null

  useEffect(() => {
    setRecordings([])
    if (!record) return
    Promise.all(record.recordingIds.map((id) => window.ghost.recordings.get(id)))
      .then((found) => setRecordings(found.filter((r): r is Recording => r !== null)))
      .catch((err: unknown) => setError(String(err)))
  }, [record?.version, record?.recordingIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const graph = useMemo(() => {
    if (!skill || !record) return { nodes: [], edges: [] }
    const recipe = record.recipe
    const nodes: Array<{ id: string; position: { x: number; y: number }; data: { label: string } }> = []
    const edges: Array<{ id: string; source: string; target: string; label?: string }> = []
    nodes.push({ id: 'skill', position: { x: X_MAIN, y: 0 }, data: { label: `${skill.name} v${record.version}` } })
    const inputKeys = [
      ...new Set(
        recipe.steps.flatMap((step) =>
          Object.values(step.bindings).map((path) => path.replace(/^inputs\./, ''))
        )
      )
    ]
    nodes.push({
      id: 'inputs',
      position: { x: X_MAIN, y: ROW },
      data: { label: `Inputs\n${inputKeys.join(', ') || 'none'}` }
    })
    edges.push({ id: 'e-skill-inputs', source: 'skill', target: 'inputs' })
    recipe.steps.forEach((step, index) => {
      const id = `step-${step.id}`
      nodes.push({
        id,
        position: { x: X_MAIN, y: ROW * 2 + index * ROW },
        data: { label: `${step.id}\n[${step.kind}]${step.checks.length > 0 ? `\nchecks: ${step.checks.map((c) => c.name).join(', ')}` : ''}` }
      })
      const from = index === 0 ? 'inputs' : `step-${recipe.steps[index - 1]?.id}`
      edges.push({ id: `e-${from}-${id}`, source: from, target: id, label: bindingLabel(step.bindings) })
    })
    const checks = [...new Set(recipe.steps.flatMap((step) => step.checks.map((c) => c.name)))]
    const checksY = ROW * 2 + recipe.steps.length * ROW
    nodes.push({
      id: 'checks',
      position: { x: X_MAIN, y: checksY },
      data: { label: `Verification\n${checks.join(', ') || 'none'}` }
    })
    if (recipe.steps.length > 0) {
      edges.push({
        id: 'e-last-checks',
        source: `step-${recipe.steps[recipe.steps.length - 1]?.id}`,
        target: 'checks'
      })
    }
    nodes.push({
      id: 'evidence',
      position: { x: X_SIDE, y: ROW },
      data: {
        label:
          recordings.length === 0
            ? 'Evidence\nnone linked'
            : `Evidence\n${recordings.map((r) => `${r.id} (${r.events.length} events)`).join('\n')}`
      }
    })
    edges.push({ id: 'e-skill-evidence', source: 'skill', target: 'evidence', label: 'demonstrated by' })
    const skillRuns = runs.filter((run) => run.skillId === skill.id).slice(-5)
    skillRuns.forEach((run, index) => {
      const id = `run-${run.id}`
      nodes.push({
        id,
        position: { x: X_SIDE, y: ROW * 2 + index * ROW },
        data: { label: `${run.id}\n${run.mode} · ${run.status}` }
      })
      edges.push({ id: `e-skill-${id}`, source: 'skill', target: id, label: `v${run.skillVersion}` })
    })
    return { nodes, edges }
  }, [skill, record, recordings, runs])

  return (
    <div>
      {error !== null && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {summaries.length === 0 && <p className="muted">No skills yet. Compile a recording first.</p>}
      {summaries.length > 0 && (
        <>
          <div className="field">
            <label htmlFor="map-skill">Skill</label>
            <select
              id="map-skill"
              data-semid="map-skill-select"
              value={skillId}
              onChange={(event) => setSkillId(event.target.value)}
            >
              {summaries.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <label htmlFor="map-version">Version</label>
            <select
              id="map-version"
              data-semid="map-version-select"
              value={version ?? ''}
              onChange={(event) => setVersion(Number(event.target.value))}
            >
              {(skill?.versions ?? []).map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version} ({v.status})
                </option>
              ))}
            </select>
          </div>
          {record && record.unresolved.length > 0 && (
            <p className="alert-warn" data-semid="map-unresolved">
              {record.unresolved.length} unresolved review item(s) on this version.
            </p>
          )}
          <div className="flow-wrap" data-semid="task-map">
            <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView>
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        </>
      )}
    </div>
  )
}
