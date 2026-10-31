import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice, getCustomer, listOrders } from '@saltbreak/data';
import { Shell } from '../../../shell';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = getCustomer(Number(id));
  if (!customer) notFound();
  const orders = listOrders().filter((o) => o.email === customer.email);
  return (
    <Shell title={customer.name} blurb={`${customer.email} · ${customer.segment} · ${customer.orderCount} orders · ${formatPrice(customer.totalCents)} lifetime`}>
      <h2 className="text-base font-semibold">Order history</h2>
      {orders.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">No orders yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
          {orders.map((o) => (
            <li key={o.id} className="flex items-baseline gap-4 py-2">
              <Link href={`/staff/orders/${o.id}`} className="text-sm font-medium text-teal-800 hover:underline">
                {o.number}
              </Link>
              <span className="flex-1 text-sm text-neutral-600">
                {o.items.map((i) => `${i.title} × ${i.qty}`).join(', ')}
              </span>
              <span className="text-xs text-neutral-500">{o.status}</span>
              <span className="text-sm font-medium">{formatPrice(o.totalCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
