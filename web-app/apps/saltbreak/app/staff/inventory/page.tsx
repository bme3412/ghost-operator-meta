import { listInventory, listStockHistory } from '@saltbreak/data';
import { Shell } from '../../shell';
import { setStockAction } from '../actions';

export const dynamic = 'force-dynamic';

function badge(onHand: number): string {
  if (onHand <= 0) return 'Sold out';
  if (onHand <= 3) return `Low (${onHand})`;
  return `${onHand}`;
}

export default function InventoryPage() {
  const rows = listInventory();
  const history = listStockHistory(20);
  return (
    <Shell title="Inventory" blurb="On-hand stock per listing. Checkouts decrement these counts; zero means sold out.">
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {rows.map((r) => (
          <li key={r.sku} className="flex items-center gap-4 py-2">
            <span className="w-36 shrink-0 text-sm font-medium">{r.sku}</span>
            <span className="flex-1 text-sm">{r.title}</span>
            <span className="w-20 text-xs text-neutral-500">{r.status}</span>
            <span className="w-16 text-right text-xs font-medium">{badge(r.onHand)}</span>
            <form action={setStockAction} className="flex items-center gap-2">
              <input type="hidden" name="sku" value={r.sku} />
              <input
                type="number"
                name="qty"
                min={0}
                defaultValue={r.onHand}
                className="w-16 border border-neutral-300 px-2 py-1 text-sm"
                aria-label={`Stock for ${r.sku}`}
              />
              <button type="submit" className="border border-neutral-300 px-2 py-1 text-xs">
                Set
              </button>
            </form>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-base font-semibold">Recent stock movements</h2>
      <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
        {history.map((h, i) => (
          <li key={i} className="flex items-baseline gap-4 py-1.5 text-sm">
            <span className="w-36 shrink-0 font-medium">{h.sku}</span>
            <span className="w-16">{h.delta > 0 ? `+${h.delta}` : h.delta}</span>
            <span className="flex-1 text-neutral-600">{h.reason}</span>
            <span className="text-xs text-neutral-500">{h.createdAt}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
