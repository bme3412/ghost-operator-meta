'use server';

import { revalidatePath } from 'next/cache';
import { recordUploadedImage } from '@saltbreak/data';

export interface UploadState {
  ok: boolean;
  message: string;
}

export async function uploadAction(_prev: UploadState, form: FormData): Promise<UploadState> {
  const sku = String(form.get('sku') ?? '').trim();
  const file = form.get('file');
  if (!sku) return { ok: false, message: 'SKU is required.' };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose an image file.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = recordUploadedImage(sku, file.name, bytes);
  if (result.ok) revalidatePath('/staff/assets');
  return result;
}
