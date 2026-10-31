import { formatPrice, listInventory, listOrders, listTickets } from '@saltbreak/data';
import { Shell } from '../../shell';

export const dynamic = 'force-dynamic';

export default function OverviewPage() {
  const orders = listOrders();
  const live = orders.filter((o) => o.status !== 'cancelled');
  const revenue = live.reduce((sum, o) => sum + o.totalCents, 0);
  const packing = orders.filter((o) => o.status === 'packing');
  const lagHours = packing.length > 0
    ? packing.reduce((sum, o) => sum + (Date.now() - new Date(o.createdAt).getTime()) / 3600000, 0) / packing.length
    : 0;
  const tickets = listTickets();
  const openTickets = tickets.filter((t) => t.status === 'open').length;
  const lowStock = listInventory().filter((r) => r.onHand <= 3).length;
  const stats: Array<[string, string]> = [
    ['Revenue (non-cancelled)', formatPrice(revenue)],
    ['Orders', `${orders.length} total · ${packing.length} packing`],
    ['Avg packing age', packing.length > 0 ? `${lagHours.toFixed(1)}h` : '—'],
    ['Open tickets', String(openTickets)],
    ['Low/out stock listings', String(lowStock)],
  ];
  return (
    <Shell title="Overview" blurb="The business at a glance. Every number reads live records.">
      <dl className="max-w-2xl divide-y divide-neutral-200 border-y border-neutral-200">
        {stats.map(([k, v]) => (
          <div key={k} className="flex gap-4 py-2">
            <dt className="w-48 shrink-0 text-sm font-medium text-neutral-700">{k}</dt>
            <dd className="text-sm">{v}</dd>
          </div>
        ))}
      </dl>
    </Shell>
  );
}
