import Link from 'next/link';
import { formatPrice, listOrders } from '@saltbreak/data';
import { Shell } from '../../shell';

export const dynamic = 'force-dynamic';

export default function OrdersPage() {
  const orders = listOrders();
  return (
    <Shell title="Orders" blurb={`${orders.length} orders. New checkouts land here and decrement inventory.`}>
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {orders.map((o) => (
          <li key={o.id} className="py-3">
            <div className="flex items-baseline gap-4">
              <Link href={`/staff/orders/${o.id}`} className="text-sm font-medium text-teal-800 hover:underline">
                {o.number}
              </Link>
              <span className="flex-1 text-sm text-neutral-600">{o.customerName} · {o.email}</span>
              <span className="text-xs text-neutral-500">{o.status}</span>
              <span className="text-sm font-medium">{formatPrice(o.totalCents)}</span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {o.items.map((i) => (
                <li key={i.sku} className="text-xs text-neutral-600">
                  {i.title} × {i.qty} @ {formatPrice(i.unitPriceCents)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
