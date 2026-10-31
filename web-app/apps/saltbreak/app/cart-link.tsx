'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cartCount, onCartChange } from './cart';

export function CartLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(cartCount());
    return onCartChange(() => setCount(cartCount()));
  }, []);
  return (
    <Link href="/cart" className="text-sm text-neutral-600 hover:text-black hover:underline">
      Cart{count > 0 ? ` (${count})` : ''}
    </Link>
  );
}
