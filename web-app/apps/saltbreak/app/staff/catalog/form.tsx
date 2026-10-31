'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDraftAction } from './actions';

const input = 'w-full border border-neutral-300 px-2 py-1 text-sm';
const label = 'block text-xs font-medium text-neutral-700';

const EMPTY = {
  sku: '',
  title: '',
  category: 'Surfboards',
  material: '',
  color: '',
  dimensionsValue: '',
  dimensionsUnit: 'in',
  description: '',
  priceDollars: '',
  care: '',
};

export function DraftForm() {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY });
  const [status, setStatus] = useState('');

  function update(key: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('Saving…');
    const result = await saveDraftAction(form);
    setStatus(result.message);
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl grid-cols-2 gap-3">
      <div>
        <label className={label} htmlFor="sku">SKU *</label>
        <input id="sku" className={input} value={form.sku} onChange={(e) => update('sku', e.target.value)} placeholder="SB-BOARD-001" />
      </div>
      <div>
        <label className={label} htmlFor="title">Title *</label>
        <input id="title" className={input} value={form.title} onChange={(e) => update('title', e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="category">Category</label>
        <input id="category" className={input} value={form.category} onChange={(e) => update('category', e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="material">Material</label>
        <input id="material" className={input} value={form.material} onChange={(e) => update('material', e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="color">Color</label>
        <input id="color" className={input} value={form.color} onChange={(e) => update('color', e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="priceDollars">Price (USD)</label>
        <input id="priceDollars" className={input} value={form.priceDollars} onChange={(e) => update('priceDollars', e.target.value)} placeholder="349.00" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={label} htmlFor="dimensionsValue">Dimensions</label>
          <input id="dimensionsValue" className={input} value={form.dimensionsValue} onChange={(e) => update('dimensionsValue', e.target.value)} placeholder="96 x 22 x 3" />
        </div>
        <div>
          <label className={label} htmlFor="dimensionsUnit">Unit</label>
          <input id="dimensionsUnit" className={input} value={form.dimensionsUnit} onChange={(e) => update('dimensionsUnit', e.target.value)} />
        </div>
      </div>
      <div className="col-span-2">
        <label className={label} htmlFor="description">Description</label>
        <textarea id="description" className={input} rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} />
      </div>
      <div className="col-span-2">
        <label className={label} htmlFor="care">Care instructions (optional)</label>
        <input id="care" className={input} value={form.care} onChange={(e) => update('care', e.target.value)} />
      </div>
      <div className="col-span-2 flex items-center gap-3">
        <button type="submit" className="bg-teal-800 px-4 py-1.5 text-sm font-medium text-white">
          Save draft
        </button>
        {status ? <span className="text-sm text-neutral-600">{status}</span> : null}
      </div>
    </form>
  );
}
