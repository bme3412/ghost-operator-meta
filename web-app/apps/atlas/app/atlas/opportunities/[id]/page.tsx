import { notFound } from 'next/navigation';
import { getOpportunity } from '@atlas/data';
import { Shell } from '../../../shell';
import { opportunityAction, startRunAction } from '../../actions';

export const dynamic = 'force-dynamic';

const SALTBREAK_URL = process.env.SALTBREAK_URL ?? 'http://localhost:3000';

const NEXT: Record<string, string[]> = {
  detected: ['proposed', 'rejected'],
  proposed: ['approved', 'rejected'],
  approved: ['running', 'rejected'],
  running: [],
  done: [],
  rejected: ['proposed'],
};

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opp = getOpportunity(id);
  if (!opp) notFound();
  const actions = NEXT[opp.state] ?? [];
  const staffRef = typeof opp.evidence.staffRef === 'string' ? opp.evidence.staffRef : null;
  return (
    <Shell title={opp.title} blurb={`${opp.kind} · ${opp.state}`}>
      <dl className="max-w-2xl divide-y divide-neutral-200 border-y border-neutral-200">
        <div className="flex gap-4 py-2">
          <dt className="w-28 shrink-0 text-sm font-medium text-neutral-700">Hypothesis</dt>
          <dd className="text-sm">{opp.hypothesis}</dd>
        </div>
        <div className="flex gap-4 py-2">
          <dt className="w-28 shrink-0 text-sm font-medium text-neutral-700">Impact</dt>
          <dd className="text-sm">{opp.impact}</dd>
        </div>
        <div className="flex gap-4 py-2">
          <dt className="w-28 shrink-0 text-sm font-medium text-neutral-700">Evidence</dt>
          <dd className="text-sm">
            <pre className="overflow-x-auto bg-neutral-50 p-2 text-xs text-neutral-700">
              {JSON.stringify(opp.evidence, null, 1)}
            </pre>
            {staffRef ? (
              <a href={`${SALTBREAK_URL}${staffRef}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-teal-800 hover:underline">
                Open in Saltbreak staff tools →
              </a>
            ) : null}
          </dd>
        </div>
      </dl>
      {actions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((s) => (
            <form key={s} action={opportunityAction}>
              <input type="hidden" name="id" value={opp.id} />
              <input type="hidden" name="state" value={s} />
              <button type="submit" className="border border-neutral-300 px-3 py-1 text-sm">
                Mark {s}
              </button>
            </form>
          ))}
          {opp.state === 'approved' && opp.kind === 'fulfillment' ? (
            <form action={startRunAction}>
              <input type="hidden" name="id" value={opp.id} />
              <button type="submit" className="bg-teal-800 px-3 py-1 text-sm font-medium text-white">
                Start supervised run
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">Terminal state — supervised execution reports here.</p>
      )}
    </Shell>
  );
}
