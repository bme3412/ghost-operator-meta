import Link from 'next/link';
import { formatPrice, listLiveProducts } from '@saltbreak/data';
import { ProductImage } from './product-image';

export const dynamic = 'force-dynamic';

export default function Home() {
  const products = listLiveProducts();
  const featured = products.slice(0, 4);
  return (
    <div>
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Gear for the water.</h1>
          <p className="mt-3 max-w-md text-base text-neutral-600">
            Surfboards, beach essentials, and apparel — stocked in Montauk and shipped within a day.
          </p>
          <Link
            href="/shop"
            data-semid="home-shop-all"
            className="mt-6 inline-block bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white"
          >
            Shop all products
          </Link>
        </div>
        <ProductImage
          src="/fixtures/saltbreak/SB-PHOTO-006/photo-1.jpg"
          alt="Two surfboards on the beach"
          className="aspect-[4/3] w-full"
        />
      </section>

      <section className="mt-14">
        <div className="flex items-baseline gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Featured</h2>
          <Link
            href="/shop"
            data-semid="home-view-all"
            className="text-sm text-neutral-600 hover:text-black hover:underline"
          >
            View all {products.length} →
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
          {featured.map((p) => (
            <Link key={p.sku} href={`/product/${encodeURIComponent(p.sku)}`} className="group">
              <ProductImage
                src={p.primaryImage}
                alt={p.title}
                fit="cover"
                className="aspect-[4/5] w-full transition group-hover:opacity-90"
              />
              <h3 className="mt-3 text-sm font-medium">{p.title}</h3>
              <p className="mt-0.5 text-sm text-neutral-600">{formatPrice(p.priceCents)}</p>
              <p className="mt-0.5 text-xs text-neutral-400">{p.onHand > 0 ? `${p.onHand} in stock` : 'Sold out'}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
