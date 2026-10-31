import { notFound } from 'next/navigation';
import { formatPrice, getDraft } from '@saltbreak/data';
import { Shell } from '../../../shell';
import { ProductImage } from '../../../product-image';

export const dynamic = 'force-dynamic';

export default async function PreviewPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const draft = getDraft(decodeURIComponent(sku));
  if (!draft) notFound();
  const rows: Array<[string, string]> = [
    ['SKU', draft.sku],
    ['Title', draft.title],
    ['Category', draft.category],
    ['Material', draft.material],
    ['Color', draft.color],
    ['Dimensions', `${draft.dimensionsValue} ${draft.dimensionsUnit}`.trim() || '—'],
    ['Description', draft.description || '—'],
    ['Price', draft.priceCents > 0 ? formatPrice(draft.priceCents) : '—'],
    ['Care', draft.care || 'Not available'],
    ['Status', draft.status],
    ['Updated', draft.updatedAt],
  ];
  return (
    <Shell title={`Preview — ${draft.sku}`} blurb="Independent render of the saved draft row.">
      <ProductImage src={draft.primaryImage} alt={draft.title} className="mb-4 h-64 w-full max-w-md" />
      <dl className="max-w-2xl divide-y divide-neutral-200 border-y border-neutral-200">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 py-2">
            <dt className="w-28 shrink-0 text-sm font-medium text-neutral-700">{k}</dt>
            <dd className="text-sm">{v}</dd>
          </div>
        ))}
      </dl>
    </Shell>
  );
}
