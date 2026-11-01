'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addReply,
  importPayoutCsv,
  refundLine,
  resolveTicket,
  sendEmail,
  sendToBooks,
  setCell,
  setOrderStatus,
  setStock,
  setTicketStatus,
} from '@saltbreak/data';

export async function setStockAction(form: FormData): Promise<void> {
  const sku = String(form.get('sku') ?? '');
  const qty = Number(form.get('qty') ?? 0);
  if (sku) setStock(sku, qty);
  revalidatePath('/staff/inventory');
  revalidatePath('/shop');
  revalidatePath('/');
}

export async function ticketAction(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const status = String(form.get('status') ?? 'open');
  if (id) setTicketStatus(id, status);
  revalidatePath('/staff/inbox');
}

export async function resolveTicketAction(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const resolution = String(form.get('resolution') ?? '');
  if (id && resolution) resolveTicket(id, resolution);
  revalidatePath('/staff/inbox');
  revalidatePath('/staff/outbox');
}

export async function replyAction(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const body = String(form.get('body') ?? '');
  if (id && body.trim()) addReply(id, body);
  revalidatePath('/staff/inbox');
}

export async function sendEmailAction(form: FormData): Promise<void> {
  const id = Number(form.get('id') ?? 0);
  if (id) sendEmail(id);
  revalidatePath('/staff/outbox');
  revalidatePath('/staff/activity');
}

export async function orderAction(form: FormData): Promise<void> {
  const id = Number(form.get('id') ?? 0);
  const status = String(form.get('status') ?? '');
  if (id && status) setOrderStatus(id, status);
  revalidatePath('/staff/orders');
  revalidatePath('/staff/inventory');
}

export async function refundLineAction(form: FormData): Promise<void> {
  const id = Number(form.get('lineId') ?? 0);
  const payout = String(form.get('payout') ?? '');
  if (id) refundLine(id);
  if (payout) revalidatePath(`/staff/payments/${payout}`);
  revalidatePath('/staff/payments');
  revalidatePath('/staff/books');
}

export async function sendToBooksAction(form: FormData): Promise<void> {
  const payout = String(form.get('payout') ?? '');
  if (!payout) return;
  const r = sendToBooks(payout);
  revalidatePath('/staff/books');
  if (r.ok && r.sheetId !== undefined) redirect(`/staff/books/${r.sheetId}`);
}

export async function saveCellAction(sheetId: number, ref: string, raw: string): Promise<{ ok: boolean }> {
  if (!Number.isInteger(sheetId) || !ref.trim()) return { ok: false };
  setCell(sheetId, ref, raw);
  revalidatePath(`/staff/books/${sheetId}`);
  return { ok: true };
}

export async function importCsvAction(form: FormData): Promise<void> {
  const file = form.get('file');
  const name = String(form.get('name') ?? '').trim() || 'Imported payout';
  if (file instanceof File) {
    importPayoutCsv(name, await file.text());
  }
  revalidatePath('/staff/books');
}
