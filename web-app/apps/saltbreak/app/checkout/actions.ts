'use server';

import { checkout, type CheckoutLine } from '@saltbreak/data';

export interface CheckoutResult {
  ok: boolean;
  orderId?: number;
  message: string;
}

export async function checkoutAction(input: {
  customerName: string;
  email: string;
  address: string;
  cardLast4: string;
  lines: CheckoutLine[];
}): Promise<CheckoutResult> {
  if (!/^\d{4}$/.test(input.cardLast4.trim())) {
    return { ok: false, message: 'Enter the last 4 digits of the card (simulated, never stored).' };
  }
  if (!input.email.includes('@')) return { ok: false, message: 'Enter a valid email.' };
  return checkout({
    customerName: input.customerName,
    email: input.email,
    address: input.address,
    lines: input.lines,
  });
}
