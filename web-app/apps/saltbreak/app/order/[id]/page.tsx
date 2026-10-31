import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice, getOrder, getProduct } from '@saltbreak/data';
import { Shell } from '../../shell';
import { ProductImage } from '../../product-image';

export const dynamic = 'force-dynamic';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getOrder(Number(id));
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
    </Shell>
  );
}
