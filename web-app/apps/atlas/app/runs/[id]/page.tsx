import fs from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { getRun, listSteps, repoRoot } from '@atlas/data';
import { Shell } from '../../shell';

export const dynamic = 'force-dynamic';

function shotsFor(runId: string): string[] {
  const root = repoRoot();
  if (!root) return [];
  const dir = path.join(root, 'data', 'atlas-runs', runId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^[A-Za-z0-9-]+\.png$/.test(f)).sort();
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) notFound();
  const steps = listSteps(id);
  const shots = shotsFor(id);
  return (
    <Shell title={`Run ${run.id}`} blurb={`${run.skillId} v${run.skillVersion} · ${run.status} · started ${run.createdAt}`}>
      <h2 className="text-base font-semibold">Steps</h2>
      {steps.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">No steps recorded yet. Refresh to follow a live run.</p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
          {steps.map((s) => (
            <li key={s.stepId} className="py-2">
              <div className="flex items-baseline gap-4">
                <span className="flex-1 text-sm font-medium">{s.stepId}</span>
                <span className="text-xs text-neutral-500">{s.passed === null ? '—' : s.passed ? 'passed' : 'failed'}</span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">{s.actions.join(' · ')}</p>
              <p className="mt-0.5 text-sm text-neutral-600">{s.observedOutcome}</p>
            </li>
          ))}
        </ul>
      )}
      {shots.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-base font-semibold">Screenshots</h2>
          <div className="mt-3 grid gap-4">
            {shots.map((shot) => (
              <img
                key={shot}
                src={`/api/runs/${encodeURIComponent(id)}/shots/${encodeURIComponent(shot)}`}
                alt={shot}
                loading="lazy"
                className="w-full border border-neutral-200"
              />
            ))}
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
