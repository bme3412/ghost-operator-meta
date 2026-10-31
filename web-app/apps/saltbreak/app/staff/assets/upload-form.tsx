'use client';

import { useActionState } from 'react';
import { uploadAction, type UploadState } from './actions';

const initial: UploadState = { ok: false, message: '' };

export function UploadForm({ skus }: { skus: string[] }) {
  const [state, action, pending] = useActionState(uploadAction, initial);
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <div>
        <label className="block text-xs font-medium text-neutral-700" htmlFor="sku">Product SKU</label>
        <select id="sku" name="sku" className="w-full border border-neutral-300 px-2 py-1 text-sm" defaultValue={skus[0] ?? ''}>
          {skus.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-700" htmlFor="file">Image (JPEG, PNG, or WebP, max 5MB)</label>
        <input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" className="w-full text-sm" />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="bg-teal-800 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Uploading…' : 'Upload'}
        </button>
        {state.message ? <span className="text-sm text-neutral-600">{state.message}</span> : null}
      </div>
    </form>
  );
}
