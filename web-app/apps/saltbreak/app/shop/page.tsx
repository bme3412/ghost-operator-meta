import Link from 'next/link';
import { formatPrice, listCategories, searchProducts, type ShopSort } from '@saltbreak/data';
import { ProductImage } from '../product-image';

export const dynamic = 'force-dynamic';

const SORTS: Array<[ShopSort, string]> = [
  ['featured', 'Featured'],
  ['price-asc', 'Price: low to high'],
  ['price-desc', 'Price: high to low'],
];

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string; max?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? '';
  const category = sp.category ?? '';
  const sort: ShopSort = sp.sort === 'price-asc' || sp.sort === 'price-desc' ? sp.sort : 'featured';
  const maxDollars = sp.max !== undefined && sp.max !== '' ? Number(sp.max) : NaN;
  const maxCents = Number.isFinite(maxDollars) && maxDollars > 0 ? Math.round(maxDollars * 100) : undefined;
  const products = searchProducts(q, category, sort, maxCents);
  const categories = listCategories();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Shop</h1>
      <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search boards, towels…"
          className="border border-neutral-300 px-3 py-1.5 text-sm"
          aria-label="Search products"
        />
        <select name="category" defaultValue={category} className="border border-neutral-300 px-2 py-1.5 text-sm" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="number"
          name="max"
          min={1}
          defaultValue={sp.max ?? ''}
          placeholder="Max $"
          className="w-24 border border-neutral-300 px-3 py-1.5 text-sm"
          aria-label="Maximum price in dollars"
          data-semid="shop-max"
        />
        <select name="sort" defaultValue={sort} className="border border-neutral-300 px-2 py-1.5 text-sm" aria-label="Sort">
          {SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white">
          Apply
        </button>
      </form>
      {products.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-600">No products match. Clear the search to browse everything.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
          {products.map((p) => (
            <Link
              key={p.sku}
              href={`/product/${encodeURIComponent(p.sku)}`}
              data-semid={`product-card-${p.sku}`}
              className="group"
            >
              <ProductImage
                src={p.primaryImage}
                alt={p.title}
                fit="cover"
                className="aspect-[4/5] w-full transition group-hover:opacity-90"
              />
              <h2 className="mt-3 text-sm font-medium">{p.title}</h2>
              <p className="mt-0.5 text-sm text-neutral-600">{formatPrice(p.priceCents)}</p>
              <p className="mt-0.5 text-xs text-neutral-400">{p.onHand > 0 ? `${p.onHand} in stock` : 'Sold out'}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
