import { notFound } from 'next/navigation';
import { formatPrice, getOrder } from '@saltbreak/data';
import { Shell } from '../../../shell';
import { orderAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function StaffOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getOrder(Number(id));
  if (!order) notFound();
  const actions = order.status === 'packing' ? ['fulfilled', 'cancelled'] : [];
  return (
    <Shell title={`Order ${order.number}`} blurb={`${order.status} · placed ${order.createdAt} · payment ${order.payment}`}>
      <dl className="max-w-2xl divide-y divide-neutral-200 border-y border-neutral-200">
        <div className="flex gap-4 py-2">
          <dt className="w-28 shrink-0 text-sm font-medium text-neutral-700">Customer</dt>
          <dd className="text-sm">{order.customerName} · {order.email}</dd>
        </div>
        <div className="flex gap-4 py-2">
          <dt className="w-28 shrink-0 text-sm font-medium text-neutral-700">Address</dt>
          <dd className="text-sm">{order.address}</dd>
        </div>
        {order.items.map((i) => (
          <div key={i.sku} className="flex gap-4 py-2">
            <dt className="w-28 shrink-0 text-sm font-medium text-neutral-700">{i.sku}</dt>
            <dd className="text-sm">{i.title} × {i.qty} @ {formatPrice(i.unitPriceCents)}</dd>
          </div>
        ))}
        <div className="flex gap-4 py-2">
          <dt className="w-28 shrink-0 text-sm font-medium text-neutral-700">Total</dt>
          <dd className="text-sm font-semibold">{formatPrice(order.totalCents)}</dd>
        </div>
      </dl>
      {actions.length > 0 ? (
        <div className="mt-4 flex gap-2">
          {actions.map((s) => (
            <form key={s} action={orderAction}>
              <input type="hidden" name="id" value={order.id} />
              <input type="hidden" name="status" value={s} />
              <button type="submit" className="border border-neutral-300 px-3 py-1 text-sm">
                Mark {s}
              </button>
            </form>
          ))}
          <span className="self-center text-xs text-neutral-500">Cancelling restocks inventory.</span>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">Terminal state — no further transitions.</p>
      )}
    </Shell>
  );
}
