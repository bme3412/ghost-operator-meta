import { listLiveProducts } from '@saltbreak/data';
import { Shell } from '../shell';
import { CartView } from './cart-view';

export const dynamic = 'force-dynamic';

export default function CartPage() {
  const products = listLiveProducts();
  return (
    <Shell title="Cart" blurb="Stored in your browser until checkout. Stock is checked again when you order.">
      <CartView products={products} />
    </Shell>
  );
}
