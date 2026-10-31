'use client';

import { useState } from 'react';
import { addToCart } from '../cart';

export function AddToCart({ sku, max, soldOut }: { sku: string; max: number; soldOut: boolean }) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  if (soldOut) return <p className="text-sm font-medium text-neutral-500">Sold out</p>;
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        max={max}
        value={qty}
        onChange={(e) => setQty(Math.min(max, Math.max(1, Number(e.target.value) || 1)))}
        className="w-16 border border-neutral-300 px-2 py-1 text-sm"
        aria-label="Quantity"
      />
      <button
        type="button"
        className="bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white"
        onClick={() => {
          addToCart(sku, qty);
          setNote(`Added ${qty} to cart.`);
        }}
      >
        Add to cart
      </button>
      {note ? <span className="text-sm text-neutral-600">{note}</span> : null}
    </div>
  );
}
