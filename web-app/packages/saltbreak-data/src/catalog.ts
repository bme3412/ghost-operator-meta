import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SQLOutputValue } from 'node:sqlite';
import { getDb, repoRoot } from './db';
import { logEvent } from './events';

export type Row = Record<string, SQLOutputValue>;

export function str(v: SQLOutputValue | undefined): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

export function num(v: SQLOutputValue | undefined): number {
  return Number(v ?? 0);
}

export interface Draft {
  sku: string;
  title: string;
  category: string;
  material: string;
  color: string;
  dimensionsValue: string;
  dimensionsUnit: string;
  description: string;
  priceCents: number;
  primaryImage: string;
  altText: string;
  care: string;
  status: string;
  updatedAt: string;
}

export type DraftInput = Omit<Draft, 'updatedAt' | 'status' | 'primaryImage' | 'altText'> & {
  status?: string;
  primaryImage?: string;
  altText?: string;
};

function toDraft(row: Row): Draft {
  return {
    sku: str(row.sku),
    title: str(row.title),
    category: str(row.category),
    material: str(row.material),
    color: str(row.color),
    dimensionsValue: str(row.dimensions_value),
    dimensionsUnit: str(row.dimensions_unit),
    description: str(row.description),
    priceCents: num(row.price_cents),
    primaryImage: str(row.primary_image),
    altText: str(row.alt_text),
    care: str(row.care),
    status: str(row.status),
    updatedAt: str(row.updated_at),
  };
}

export function listDrafts(): Draft[] {
  const rows = getDb().prepare('SELECT * FROM drafts ORDER BY updated_at DESC').all() as Row[];
  return rows.map(toDraft);
}

export function getDraft(sku: string): Draft | null {
  const row = getDb().prepare('SELECT * FROM drafts WHERE sku = ?').get(sku) as Row | undefined;
  return row ? toDraft(row) : null;
}

export function upsertDraft(input: DraftInput): Draft {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO drafts (sku, title, category, material, color, dimensions_value, dimensions_unit, description, price_cents, primary_image, alt_text, care, status, updated_at)
     VALUES (@sku, @title, @category, @material, @color, @dimensionsValue, @dimensionsUnit, @description, @priceCents, @primaryImage, @altText, @care, @status, @updatedAt)
     ON CONFLICT(sku) DO UPDATE SET
       title = excluded.title, category = excluded.category, material = excluded.material,
       color = excluded.color, dimensions_value = excluded.dimensions_value,
       dimensions_unit = excluded.dimensions_unit, description = excluded.description,
       price_cents = excluded.price_cents, primary_image = excluded.primary_image,
       alt_text = excluded.alt_text, care = excluded.care, status = excluded.status,
       updated_at = excluded.updated_at`,
  ).run({
    ...input,
    primaryImage: input.primaryImage ?? '',
    altText: input.altText ?? '',
    status: input.status ?? 'draft',
    updatedAt: now,
  });
  const saved = getDraft(input.sku);
  if (!saved) throw new Error(`Draft ${input.sku} was not persisted`);
  return saved;
}

export interface SourceRecord {
  id: string;
  version: number;
  kind: string;
  data: string;
  fileRef: string | null;
}

function toSourceRecord(row: Row): SourceRecord {
  return {
    id: str(row.id),
    version: num(row.version),
    kind: str(row.kind),
    data: str(row.data),
    fileRef: row.fileRef === null || row.fileRef === undefined ? null : str(row.fileRef),
  };
}

export function listSources(): SourceRecord[] {
  const rows = getDb().prepare('SELECT id, version, kind, data, file_ref AS fileRef FROM sources ORDER BY id').all() as Row[];
  return rows.map(toSourceRecord);
}

export function listUploads(): SourceRecord[] {
  const rows = getDb()
    .prepare("SELECT id, version, kind, data, file_ref AS fileRef FROM sources WHERE kind = 'uploaded_image' ORDER BY id, version")
    .all() as Row[];
  return rows.map(toSourceRecord);
}

/** Store a staff upload and record it as a new source version. Raw storage only. */
export function recordUploadedImage(sku: string, originalName: string, bytes: Uint8Array): { ok: boolean; ref?: string; message: string } {
  const ext = path.extname(originalName).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return { ok: false, message: 'Only JPEG, PNG, or WebP images.' };
  if (bytes.length > 5 * 1024 * 1024) return { ok: false, message: 'Image must be under 5MB.' };
  const root = repoRoot();
  if (!root) return { ok: false, message: 'Cannot locate repository root.' };
  const dir = path.join(root, 'apps', 'saltbreak', 'public', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const safe = sku.replace(/[^A-Za-z0-9-]/g, '').slice(0, 32) || 'img';
  const file = `${safe}-${Date.now()}${ext === '.jpeg' ? '.jpg' : ext}`;
  fs.writeFileSync(path.join(dir, file), bytes);
  const ref = `/uploads/${file}`;
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT COUNT(*) AS c FROM sources WHERE id = ?').get(`${sku}:upload`) as Row;
  const version = num(existing.c) + 1;
  const data = JSON.stringify({ sku, ref, originalName, bytes: bytes.length, synthetic: true });
  db.prepare(
    'INSERT INTO sources (id, version, kind, content_hash, data, file_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(`${sku}:upload`, version, 'uploaded_image', createHash('sha256').update(bytes).digest('hex'), data, ref, now);
  logEvent('asset_uploaded', 'source', `${sku}:upload`, { version, ref });
  return { ok: true, ref, message: `Stored ${ref} as ${sku}:upload v${version}.` };
}

export interface Product {
  sku: string;
  title: string;
  category: string;
  material: string;
  color: string;
  dimensionsValue: string;
  dimensionsUnit: string;
  description: string;
  priceCents: number;
  primaryImage: string;
  altText: string;
  care: string;
  status: string;
  onHand: number;
  updatedAt: string;
}

function toProduct(row: Row): Product {
  return {
    sku: str(row.sku),
    title: str(row.title),
    category: str(row.category),
    material: str(row.material),
    color: str(row.color),
    dimensionsValue: str(row.dimensions_value),
    dimensionsUnit: str(row.dimensions_unit),
    description: str(row.description),
    priceCents: num(row.price_cents),
    primaryImage: str(row.primary_image),
    altText: str(row.alt_text),
    care: str(row.care),
    status: str(row.status),
    onHand: num(row.on_hand),
    updatedAt: str(row.updated_at),
  };
}

const PRODUCT_WITH_STOCK = `
  SELECT p.*, COALESCE(i.on_hand, 0) AS on_hand
  FROM products p LEFT JOIN inventory i ON i.sku = p.sku`;

export function listLiveProducts(): Product[] {
  const rows = getDb().prepare(`${PRODUCT_WITH_STOCK} WHERE p.status = 'live' ORDER BY p.title`).all() as Row[];
  return rows.map(toProduct);
}

export type ShopSort = 'featured' | 'price-asc' | 'price-desc';

export function searchProducts(q: string, category: string, sort: ShopSort): Product[] {
  const where: string[] = ["p.status = 'live'"];
  const args: string[] = [];
  const needle = q.trim();
  if (needle) {
    where.push('(p.title LIKE ? OR p.description LIKE ? OR p.category LIKE ?)');
    args.push(`%${needle}%`, `%${needle}%`, `%${needle}%`);
  }
  if (category.trim()) {
    where.push('p.category = ?');
    args.push(category.trim());
  }
  const order = sort === 'price-asc' ? 'p.price_cents ASC' : sort === 'price-desc' ? 'p.price_cents DESC' : 'p.title';
  const rows = getDb().prepare(`${PRODUCT_WITH_STOCK} WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...args) as Row[];
  return rows.map(toProduct);
}

export function listCategories(): string[] {
  const rows = getDb().prepare("SELECT DISTINCT category AS c FROM products WHERE status = 'live' ORDER BY category").all() as Row[];
  return rows.map((r) => str(r.c));
}

export function getProduct(sku: string): Product | null {
  const row = getDb().prepare(`${PRODUCT_WITH_STOCK} WHERE p.sku = ?`).get(sku) as Row | undefined;
  return row ? toProduct(row) : null;
}

export interface StockRow {
  sku: string;
  title: string;
  onHand: number;
  status: string;
}

export function listInventory(): StockRow[] {
  const rows = getDb()
    .prepare(
      `SELECT p.sku AS sku, p.title AS title, COALESCE(i.on_hand, 0) AS on_hand, p.status AS status
       FROM products p LEFT JOIN inventory i ON i.sku = p.sku ORDER BY p.title`,
    )
    .all() as Row[];
  return rows.map((row) => ({ sku: str(row.sku), title: str(row.title), onHand: num(row.on_hand), status: str(row.status) }));
}

export function setStock(sku: string, onHand: number): void {
  const db = getDb();
  const qty = Math.max(0, Math.floor(onHand));
  const current = db.prepare('SELECT COALESCE(on_hand, 0) AS q FROM inventory WHERE sku = ?').get(sku) as Row | undefined;
  const before = current ? num(current.q) : 0;
  db.prepare(
    `INSERT INTO inventory (sku, on_hand, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(sku) DO UPDATE SET on_hand = excluded.on_hand, updated_at = excluded.updated_at`,
  ).run(sku, qty, new Date().toISOString());
  recordHistory(sku, qty - before, 'manual adjustment');
  if (qty !== before) logEvent('stock_changed', 'inventory', sku, { before, after: qty });
}

export function recordHistory(sku: string, delta: number, reason: string): void {
  if (delta === 0) return;
  getDb().prepare('INSERT INTO stock_history (sku, delta, reason, created_at) VALUES (?, ?, ?, ?)').run(sku, delta, reason, new Date().toISOString());
}

export interface StockEvent {
  sku: string;
  delta: number;
  reason: string;
  createdAt: string;
}

export function listStockHistory(limit = 30): StockEvent[] {
  const rows = getDb().prepare('SELECT * FROM stock_history ORDER BY id DESC LIMIT ?').all(limit) as Row[];
  return rows.map((row) => ({ sku: str(row.sku), delta: num(row.delta), reason: str(row.reason), createdAt: str(row.created_at) }));
}

/** Publish a draft to the storefront. Dimensions and price are required. */
export function publishDraft(sku: string): { ok: boolean; message: string } {
  const draft = getDraft(sku);
  if (!draft) return { ok: false, message: `No draft for ${sku}.` };
  const missing: string[] = [];
  if (!draft.title) missing.push('title');
  if (!draft.dimensionsValue || !draft.dimensionsUnit) missing.push('dimensions');
  if (draft.priceCents <= 0) missing.push('price');
  if (missing.length > 0) return { ok: false, message: `Cannot publish ${sku}: missing ${missing.join(', ')}.` };
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO products (sku, title, category, material, color, dimensions_value, dimensions_unit, description, price_cents, primary_image, alt_text, care, status, updated_at)
     VALUES (@sku, @title, @category, @material, @color, @dimensionsValue, @dimensionsUnit, @description, @priceCents, @primaryImage, @altText, @care, 'live', @updatedAt)
     ON CONFLICT(sku) DO UPDATE SET
       title = excluded.title, category = excluded.category, material = excluded.material,
       color = excluded.color, dimensions_value = excluded.dimensions_value,
       dimensions_unit = excluded.dimensions_unit, description = excluded.description,
       price_cents = excluded.price_cents, primary_image = excluded.primary_image,
       alt_text = excluded.alt_text, care = excluded.care, status = 'live',
       updated_at = excluded.updated_at`,
  ).run({
    sku: draft.sku,
    title: draft.title,
    category: draft.category,
    material: draft.material,
    color: draft.color,
    dimensionsValue: draft.dimensionsValue,
    dimensionsUnit: draft.dimensionsUnit,
    description: draft.description,
    priceCents: draft.priceCents,
    primaryImage: draft.primaryImage,
    altText: draft.altText,
    care: draft.care,
    updatedAt: now,
  });
  db.prepare("UPDATE drafts SET status = 'published', updated_at = ? WHERE sku = ?").run(now, sku);
  logEvent('product_published', 'product', sku, {});
  return { ok: true, message: `${sku} is live on the storefront.` };
}

export function unpublishProduct(sku: string): { ok: boolean; message: string } {
  const db = getDb();
  const now = new Date().toISOString();
  const product = getProduct(sku);
  if (!product) return { ok: false, message: `No product ${sku}.` };
  db.prepare("UPDATE products SET status = 'unlisted', updated_at = ? WHERE sku = ?").run(now, sku);
  db.prepare("UPDATE drafts SET status = 'draft', updated_at = ? WHERE sku = ?").run(now, sku);
  logEvent('product_unpublished', 'product', sku, {});
  return { ok: true, message: `${sku} removed from the storefront.` };
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface Promo {
  id: string;
  code: string;
  label: string;
  startsAt: string;
  endsAt: string;
  status: 'active' | 'upcoming' | 'ended';
}

export function listPromos(): Promo[] {
  const rows = getDb().prepare('SELECT * FROM promos ORDER BY starts_at DESC').all() as Row[];
  const now = new Date().toISOString();
  return rows.map((row) => {
    const starts = str(row.starts_at);
    const ends = str(row.ends_at);
    return {
      id: str(row.id),
      code: str(row.code),
      label: str(row.label),
      startsAt: starts,
      endsAt: ends,
      status: now < starts ? 'upcoming' : now > ends ? 'ended' : 'active',
    };
  });
}
