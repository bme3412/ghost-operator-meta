import { notFound } from 'next/navigation';
import { formatPrice, getProduct } from '@saltbreak/data';
import { ProductImage } from '../../product-image';
import { AddToCart } from '../add-to-cart';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = getProduct(decodeURIComponent(sku));
  if (!product || product.status !== 'live') notFound();
  return (
    <div className="grid gap-10 md:grid-cols-2">
      <ProductImage src={product.primaryImage} alt={product.title} className="aspect-square w-full" />
      <div>
        <p className="text-sm text-neutral-500">{product.category}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{product.title}</h1>
        <p className="mt-2 text-lg">{formatPrice(product.priceCents)}</p>
        <p className="mt-1 text-sm text-neutral-500">
          {product.onHand > 0 ? `${product.onHand} in stock` : 'Sold out'}
        </p>
        {product.description ? <p className="mt-4 text-sm text-neutral-700">{product.description}</p> : null}
        <dl className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
          {(
            [
              ['Material', product.material],
              ['Color', product.color],
              ['Dimensions', `${product.dimensionsValue} ${product.dimensionsUnit}`.trim()],
              ['Care', product.care || 'Not available'],
            ] as Array<[string, string]>
          ).map(([k, v]) => (
            <div key={k} className="flex gap-4 py-2">
              <dt className="w-28 shrink-0 text-sm font-medium text-neutral-700">{k}</dt>
              <dd className="text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <AddToCart sku={product.sku} max={product.onHand} soldOut={product.onHand <= 0} />
        </div>
      </div>
    </div>
  );
}
