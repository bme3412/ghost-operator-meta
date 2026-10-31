'use server';

import { revalidatePath } from 'next/cache';
import { publishDraft, unpublishProduct, upsertDraft } from '@saltbreak/data';

export interface DraftFormState {
  ok: boolean;
  message: string;
}

export async function saveDraftAction(form: {
  sku: string;
  title: string;
  category: string;
  material: string;
  color: string;
  dimensionsValue: string;
  dimensionsUnit: string;
  description: string;
  priceDollars: string;
  care: string;
}): Promise<DraftFormState> {
  const sku = form.sku.trim();
  if (!sku) return { ok: false, message: 'SKU is required.' };
  if (!form.title.trim()) return { ok: false, message: 'Title is required.' };
  try {
    const saved = upsertDraft({
      sku,
      title: form.title.trim(),
      category: form.category.trim(),
      material: form.material.trim(),
      color: form.color.trim(),
      dimensionsValue: form.dimensionsValue.trim(),
      dimensionsUnit: form.dimensionsUnit.trim(),
      description: form.description.trim(),
      priceCents: Math.max(0, Math.round(Number(form.priceDollars) * 100) || 0),
      care: form.care.trim(),
    });
    revalidatePath('/staff/catalog');
    return { ok: true, message: `Saved ${saved.sku} as ${saved.status} at ${saved.updatedAt}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Save failed.' };
  }
}

export async function publishAction(sku: string): Promise<DraftFormState> {
  const result = publishDraft(sku);
  revalidatePath('/staff/catalog');
  revalidatePath('/shop');
  revalidatePath('/');
  return result;
}

export async function unpublishAction(sku: string): Promise<DraftFormState> {
  const result = unpublishProduct(sku);
  revalidatePath('/staff/catalog');
  revalidatePath('/shop');
  revalidatePath('/');
  return result;
}
