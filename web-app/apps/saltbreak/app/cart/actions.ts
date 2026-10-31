'use server';

import { activePromo } from '@saltbreak/data';

/** Validate a promo code against currently active promos. */
export async function validatePromoAction(code: string): Promise<{ ok: boolean; label: string; message: string }> {
  const promo = activePromo(code);
  if (!promo) return { ok: false, label: '', message: 'That code is not active.' };
  return { ok: true, label: promo.label, message: `${promo.code} applied: ${promo.label}.` };
}
