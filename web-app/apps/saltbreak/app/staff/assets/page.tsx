import { listDrafts, listLiveProducts, listUploads } from '@saltbreak/data';
import { Shell } from '../../shell';
import { ProductImage } from '../../product-image';
import { UploadForm } from './upload-form';

export const dynamic = 'force-dynamic';

export default function AssetsPage() {
  const skus = [...new Set([...listDrafts().map((d) => d.sku), ...listLiveProducts().map((p) => p.sku)])].sort();
  const uploads = listUploads();
  return (
    <Shell
      title="Asset panel"
      blurb="Upload product photography against a draft or listing. Files are stored raw with content hashes; segmentation and variants arrive with the Atlas asset slice."
    >
      <h2 className="text-base font-semibold">New upload</h2>
      <div className="mt-3">
        <UploadForm skus={skus} />
      </div>
      <h2 className="mt-8 text-base font-semibold">Uploaded sources ({uploads.length})</h2>
      {uploads.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">No uploads yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
          {uploads.map((u) => (
            <li key={`${u.id}@${u.version}`} className="flex items-center gap-4 py-2">
              <ProductImage src={u.fileRef ?? ''} alt={u.id} className="h-12 w-12 shrink-0" />
              <span className="text-sm font-medium">{u.id}</span>
              <span className="text-xs text-neutral-500">v{u.version}</span>
              <span className="flex-1 text-xs text-neutral-500">{u.fileRef}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
