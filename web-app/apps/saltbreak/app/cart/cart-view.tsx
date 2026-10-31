'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Product } from '@saltbreak/data';
import { promoPercent, readCart, readPromo, setQty, writePromo, type CartPromo } from '../cart';
import { ProductImage } from '../product-image';
import { validatePromoAction } from './actions';

const fmt = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function CartView({ products }: { products: Product[] }) {
  const [lines, setLines] = useState(readCart());
  const [promo, setPromo] = useState<CartPromo | null>(null);
  const [code, setCode] = useState('');
  const [promoMessage, setPromoMessage] = useState('');
  useEffect(() => {
    setLines(readCart());
    setPromo(readPromo());
  }, []);
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const detailed = lines.map((l) => ({ line: l, product: bySku.get(l.sku) })).filter((d) => d.product !== undefined);
  const total = detailed.reduce((sum, d) => sum + d.line.qty * (d.product?.priceCents ?? 0), 0);
  const discount = promo ? Math.round((total * promoPercent(promo.label)) / 100) : 0;

  function update(sku: string, qty: number) {
    setQty(sku, qty);
    setLines(readCart());
  }

  async function applyPromo() {
    const r = await validatePromoAction(code);
    setPromoMessage(r.message);
    if (r.ok) {
      const next = { code: code.trim().toUpperCase(), label: r.label };
      writePromo(next);
      setPromo(next);
    }
  }

  if (detailed.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        Your cart is empty. <Link href="/shop" className="text-teal-800 hover:underline">Browse the shop</Link>.
      </p>
    );
  }
  return (
    <div>
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {detailed.map(({ line, product }) => (
          <li key={line.sku} className="flex items-center gap-4 py-2">
            <ProductImage src={product?.primaryImage ?? ''} alt={product?.title ?? line.sku} className="h-12 w-12 shrink-0" />
            <span className="flex-1 text-sm font-medium">{product?.title}</span>
            <input
              type="number"
              min={0}
              max={product?.onHand ?? 0}
              value={line.qty}
              onChange={(e) => update(line.sku, Number(e.target.value) || 0)}
              className="w-16 border border-neutral-300 px-2 py-1 text-sm"
              aria-label={`Quantity for ${product?.title}`}
            />
            <span className="w-24 text-right text-sm">{fmt(line.qty * (product?.priceCents ?? 0))}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Promo code"
          className="w-40 border border-neutral-300 px-2 py-1.5 text-sm"
          aria-label="Promo code"
          data-semid="cart-promo-code"
        />
        <button
          type="button"
          onClick={applyPromo}
          data-semid="cart-promo-apply"
          className="border border-neutral-300 px-3 py-1.5 text-sm"
        >
          Apply
        </button>
        {promoMessage ? (
          <span data-semid="cart-promo-status" className="text-xs text-neutral-600">
            {promoMessage}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <span className="text-sm font-semibold" data-semid="cart-total">
          Total: {fmt(total - discount)}
          {discount > 0 ? <span className="ml-2 font-normal text-neutral-500">({fmt(discount)} off)</span> : null}
        </span>
        <Link href="/checkout" className="bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white">
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
