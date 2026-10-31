'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearCart, readCart } from '../cart';
import { ProductImage } from '../product-image';
import { checkoutAction } from './actions';

const input = 'w-full border border-neutral-300 px-2 py-1 text-sm';
const label = 'block text-xs font-medium text-neutral-700';
const fmt = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

interface Line {
  sku: string;
  title: string;
  qty: number;
  unitPriceCents: number;
  image: string;
}

export function CheckoutForm({ catalog }: { catalog: Array<{ sku: string; title: string; unitPriceCents: number; image: string }> }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [card, setCard] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const bySku = new Map(catalog.map((c) => [c.sku, c]));
    setLines(
      readCart()
        .map((l) => {
          const found = bySku.get(l.sku);
          return found ? { sku: l.sku, title: found.title, qty: l.qty, unitPriceCents: found.unitPriceCents, image: found.image } : null;
        })
        .filter((l): l is Line => l !== null),
    );
  }, [catalog]);

  const total = lines.reduce((sum, l) => sum + l.qty * l.unitPriceCents, 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('Placing order…');
    const result = await checkoutAction({
      customerName: name,
      email,
      address,
      cardLast4: card,
      lines: lines.map((l) => ({ sku: l.sku, qty: l.qty })),
    });
    if (result.ok && result.orderId !== undefined) {
      clearCart();
      router.push(`/order/${result.orderId}`);
    } else {
      setStatus(result.message);
    }
  }

  if (lines.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        Your cart is empty. <Link href="/shop" className="text-teal-800 hover:underline">Browse the shop</Link>.
      </p>
    );
  }

  return (
    <div className="grid max-w-3xl gap-8 sm:grid-cols-2">
      <div>
        <h2 className="text-base font-semibold">Order summary</h2>
        <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
          {lines.map((l) => (
            <li key={l.sku} className="flex items-center gap-2 py-2 text-sm">
              <ProductImage src={l.image} alt={l.title} className="h-10 w-10 shrink-0" />
              <span className="flex-1">{l.title} × {l.qty}</span>
              <span>{fmt(l.qty * l.unitPriceCents)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm font-semibold">Total: {fmt(total)}</p>
      </div>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={label} htmlFor="name">Full name *</label>
          <input id="name" className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={label} htmlFor="email">Email *</label>
          <input id="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={label} htmlFor="address">Shipping address *</label>
          <input id="address" className={input} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="card">Card last 4 (simulated) *</label>
          <input id="card" className={input} value={card} onChange={(e) => setCard(e.target.value)} placeholder="4242" />
        </div>
        <div className="col-span-2 flex items-center gap-3">
          <button type="submit" className="bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white">
            Place order
          </button>
          {status ? <span className="text-sm text-neutral-600">{status}</span> : null}
        </div>
      </form>
    </div>
  );
}
