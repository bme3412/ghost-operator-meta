import { listLiveProducts } from '@saltbreak/data';
import { Shell } from '../shell';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
  const catalog = listLiveProducts().map((p) => ({ sku: p.sku, title: p.title, unitPriceCents: p.priceCents, image: p.primaryImage }));
  return (
    <Shell title="Checkout" blurb="Simulated payment — no card is charged or stored. Placing the order decrements real inventory.">
      <CheckoutForm catalog={catalog} />
    </Shell>
  );
}
