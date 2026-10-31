export interface CartLine {
  sku: string;
  qty: number;
}

const KEY = 'saltbreak-cart';
const PROMO_KEY = 'saltbreak-promo';
const EVENT = 'saltbreak-cart-changed';

export interface CartPromo {
  code: string;
  label: string;
}

export function readPromo(): CartPromo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(PROMO_KEY) ?? 'null');
    if (typeof raw === 'object' && raw !== null && typeof (raw as CartPromo).code === 'string') {
      return { code: (raw as CartPromo).code, label: String((raw as CartPromo).label ?? '') };
    }
    return null;
  } catch {
    return null;
  }
}

export function writePromo(promo: CartPromo | null): void {
  if (promo) window.localStorage.setItem(PROMO_KEY, JSON.stringify(promo));
  else window.localStorage.removeItem(PROMO_KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** Percent off parsed from the promo label ("10% off everything" -> 10). */
export function promoPercent(label: string): number {
  const m = /(\d+)\s*%/.exec(label);
  return m ? Number(m[1]) : 0;
}

export function readCart(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l): l is CartLine => typeof l === 'object' && l !== null && typeof (l as CartLine).sku === 'string')
      .map((l) => ({ sku: l.sku, qty: Math.max(0, Math.floor(l.qty)) }))
      .filter((l) => l.qty > 0);
  } catch {
    return [];
  }
}

function write(lines: CartLine[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event(EVENT));
}

export function cartCount(): number {
  return readCart().reduce((sum, l) => sum + l.qty, 0);
}

export function onCartChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', fn);
  };
}

export function addToCart(sku: string, qty: number): void {
  const lines = readCart();
  const found = lines.find((l) => l.sku === sku);
  if (found) found.qty += Math.max(1, Math.floor(qty));
  else lines.push({ sku, qty: Math.max(1, Math.floor(qty)) });
  write(lines);
}

export function setQty(sku: string, qty: number): void {
  write(readCart().map((l) => (l.sku === sku ? { ...l, qty: Math.max(0, Math.floor(qty)) } : l)).filter((l) => l.qty > 0));
}

export function clearCart(): void {
  write([]);
}
