import Link from 'next/link';
import { listDrafts, listInventory } from '@saltbreak/data';
import { Shell } from '../../shell';
import { DraftForm } from './form';
import { PublishButtons } from './publish-buttons';

export const dynamic = 'force-dynamic';

export default function CatalogPage() {
  const drafts = listDrafts();
  const stock = new Map(listInventory().map((r) => [r.sku, r.onHand]));
  return (
    <Shell
      title="Catalog staging"
      blurb="Create and update product drafts. Publishing puts the listing on the storefront; dimensions and price are required."
    >
      <h2 className="text-base font-semibold">New or updated draft</h2>
      <div className="mt-3">
        <DraftForm />
      </div>
      <h2 className="mt-8 text-base font-semibold">Saved drafts ({drafts.length})</h2>
      {drafts.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">No drafts yet. Save one above.</p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
          {drafts.map((d) => {
            const onHand = stock.get(d.sku);
            const low = d.status === 'published' && onHand !== undefined && onHand <= 3;
            return (
              <li key={d.sku} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="w-36 shrink-0 text-sm font-medium">{d.sku}</span>
                <span className="min-w-40 flex-1 text-sm">{d.title}</span>
                <span className="text-xs text-neutral-500">{d.status}</span>
                {low ? <span className="text-xs font-medium text-amber-700">Low stock ({onHand})</span> : null}
                <PublishButtons sku={d.sku} status={d.status} />
                <Link
                  href={`/staff/preview/${encodeURIComponent(d.sku)}`}
                  className="text-sm text-teal-800 hover:underline"
                >
                  Preview
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
