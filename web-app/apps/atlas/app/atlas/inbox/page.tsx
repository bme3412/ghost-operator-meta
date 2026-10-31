import Link from 'next/link';
import { listOpportunities } from '@atlas/data';
import { Shell } from '../../shell';

export const dynamic = 'force-dynamic';

export default function InboxPage() {
  const opportunities = listOpportunities();
  return (
    <Shell
      title="Opportunity inbox"
      blurb="Detected automation opportunities, each backed by observed business evidence. Approve one to supervise its execution."
    >
      {opportunities.length === 0 ? (
        <p className="text-sm text-neutral-600">No opportunities detected yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {opportunities.map((o) => (
            <li key={o.id} className="py-3">
              <div className="flex items-baseline gap-4">
                <Link href={`/atlas/opportunities/${o.id}`} className="flex-1 text-sm font-medium text-teal-800 hover:underline">
                  {o.title}
                </Link>
                <span className="text-xs text-neutral-500">{o.kind}</span>
                <span className="w-20 text-right text-xs font-medium">{o.state}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{o.impact}</p>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
