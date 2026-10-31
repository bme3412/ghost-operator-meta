import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice, getOrder, getOrderByNumber, getProduct } from '@saltbreak/data';
import { Shell } from '../../shell';
import { ProductImage } from '../../product-image';
import { orderHelpAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ticket?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const order = getOrderByNumber(id) ?? getOrder(Number(id));
  if (!order) notFound();
  const images = new Map(order.items.map((i) => [i.sku, getProduct(i.sku)?.primaryImage ?? '']));
  return (
    <Shell title={`Order ${order.number}`} blurb={`Placed ${order.createdAt} · ${order.status} · payment ${order.payment}`}>
      <ul className="max-w-2xl divide-y divide-neutral-200 border-y border-neutral-200">
        {order.items.map((i) => (
          <li key={i.sku} className="flex items-center gap-2 py-2 text-sm">
            <ProductImage src={images.get(i.sku) ?? ''} alt={i.title} className="h-10 w-10 shrink-0" />
            <span className="flex-1">{i.title} × {i.qty}</span>
            <span>{formatPrice(i.qty * i.unitPriceCents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm font-semibold">Total: {formatPrice(order.totalCents)}</p>
      <p className="mt-4 text-sm text-neutral-600">
        Shipping to {order.customerName}, {order.address}.{' '}
        <Link href="/shop" className="text-teal-800 hover:underline">Continue shopping</Link>.
      </p>
      {sp.ticket ? (
        <p data-semid="order-help-confirm" className="mt-4 border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm">
          Ticket {sp.ticket} created — the shop will reply by email.
        </p>
      ) : null}
      <form action={orderHelpAction} data-semid="order-help-form" className="mt-6 max-w-xl border-t border-neutral-200 pt-4">
        <h2 className="text-sm font-semibold">Get help with this order</h2>
        <input type="hidden" name="orderNumber" value={order.number} />
        <input type="hidden" name="email" value={order.email} />
        <label className="mt-3 block text-xs text-neutral-500" htmlFor="order-help-reason">
          Reason
        </label>
        <select
          id="order-help-reason"
          name="reason"
          data-semid="order-help-reason"
          className="mt-1 border border-neutral-300 px-2 py-1.5 text-sm"
        >
          {['Charged twice', 'Never arrived', 'Damaged item', 'Address change', 'Other'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <label className="mt-3 block text-xs text-neutral-500" htmlFor="order-help-message">
          Message
        </label>
        <textarea
          id="order-help-message"
          name="message"
          rows={3}
          data-semid="order-help-message"
          placeholder="What happened?"
          className="mt-1 w-full border border-neutral-300 px-2 py-1.5 text-sm"
        />
        <button type="submit" data-semid="order-help-submit" className="mt-3 bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white">
          Submit request
        </button>
      </form>
    </Shell>
  );
}
