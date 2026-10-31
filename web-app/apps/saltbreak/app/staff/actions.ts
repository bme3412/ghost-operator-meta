'use server';

import { revalidatePath } from 'next/cache';
import { addReply, sendEmail, setOrderStatus, setStock, setTicketStatus } from '@saltbreak/data';

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
