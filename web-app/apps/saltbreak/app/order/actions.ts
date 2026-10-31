'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createTicket } from '@saltbreak/data';

const REASONS = ['Charged twice', 'Never arrived', 'Damaged item', 'Address change', 'Other'] as const;

export async function orderHelpAction(form: FormData): Promise<void> {
  const orderNumber = String(form.get('orderNumber') ?? '');
  const email = String(form.get('email') ?? '');
  const reason = String(form.get('reason') ?? '');
  const message = String(form.get('message') ?? '');
  if (!orderNumber || !message.trim()) return;
  const subject = `${REASONS.includes(reason as (typeof REASONS)[number]) ? reason : 'Order help'} — order ${orderNumber}`;
  const r = createTicket({ subject, orderNumber, email: email || null, body: message });
  revalidatePath('/staff/inbox');
  if (r.ok && r.id) redirect(`/order/${encodeURIComponent(orderNumber)}?ticket=${r.id}`);
}
