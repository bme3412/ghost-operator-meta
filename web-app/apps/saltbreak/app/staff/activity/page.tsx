import { listEvents } from '@saltbreak/data';
import { Shell } from '../../shell';

export const dynamic = 'force-dynamic';

export default function ActivityPage() {
  const events = listEvents(50);
  return (
    <Shell
      title="Activity"
      blurb="Append-only business event log. Every subsystem writes here; Atlas reads this log to find automation opportunities."
    >
      {events.length === 0 ? (
        <p className="text-sm text-neutral-600">No events yet. Place an order or publish a draft to generate some.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {events.map((e) => (
            <li key={e.id} className="flex items-baseline gap-4 py-2">
              <span className="w-40 shrink-0 text-sm font-medium">{e.type}</span>
              <span className="w-32 shrink-0 text-xs text-neutral-500">
                {e.entity}:{e.entityId}
              </span>
              <span className="flex-1 truncate text-xs text-neutral-500">{JSON.stringify(e.data)}</span>
              <span className="shrink-0 text-xs text-neutral-400">{e.createdAt}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
