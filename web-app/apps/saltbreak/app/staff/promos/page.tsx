import { listPromos } from '@saltbreak/data';
import { Shell } from '../../shell';

export const dynamic = 'force-dynamic';

export default function PromosPage() {
  const promos = listPromos();
  return (
    <Shell title="Promos" blurb="Discount campaigns and their windows. Status derives from dates; ended promos stay for the record.">
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {promos.map((p) => (
          <li key={p.id} className="flex items-baseline gap-4 py-2">
            <span className="w-28 shrink-0 text-sm font-medium">{p.code}</span>
            <span className="flex-1 text-sm">{p.label}</span>
            <span className="text-xs text-neutral-500">
              {p.startsAt.slice(0, 10)} → {p.endsAt.slice(0, 10)}
            </span>
            <span className="w-20 text-right text-xs font-medium">{p.status}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
