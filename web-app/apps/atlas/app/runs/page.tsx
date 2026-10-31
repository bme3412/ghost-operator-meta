import Link from 'next/link';
import { listRuns } from '@atlas/data';
import { Shell } from '../shell';

export const dynamic = 'force-dynamic';

export default function RunsPage() {
  const runs = listRuns();
  return (
    <Shell
      title="Runs"
      blurb="Supervised executions. Each run records its steps, screenshots, and outcome as evidence."
    >
      {runs.length === 0 ? (
        <p className="text-sm text-neutral-600">No runs yet. Approve an opportunity to supervise one.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {runs.map((r) => (
            <li key={r.id} className="flex items-baseline gap-4 py-2">
              <Link href={`/runs/${encodeURIComponent(r.id)}`} className="flex-1 text-sm font-medium text-teal-800 hover:underline">
                {r.id}
              </Link>
              <span className="text-xs text-neutral-500">{r.skillId} v{r.skillVersion}</span>
              <span className="w-20 text-right text-xs font-medium">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
