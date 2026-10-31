import type { SQLOutputValue } from 'node:sqlite';
import { getDb } from './db';

type Row = Record<string, SQLOutputValue>;

function str(v: SQLOutputValue | undefined): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

function num(v: SQLOutputValue | undefined): number {
  return Number(v ?? 0);
}

export type Segment = 'lapsed' | 'vip' | 'repeat' | 'new';

export interface Customer {
  id: number;
  name: string;
  email: string;
  orderCount: number;
  totalCents: number;
  lastOrderAt: string | null;
  segment: Segment;
}

const LAPSSED_DAYS = 90;
const VIP_ORDERS = 3;
const VIP_TOTAL_CENTS = 50000;

export function segmentFor(orderCount: number, totalCents: number, lastOrderAt: string | null): Segment {
  if (lastOrderAt) {
    const ageDays = (Date.now() - new Date(lastOrderAt).getTime()) / 86400000;
    if (ageDays > LAPSSED_DAYS) return 'lapsed';
  }
  if (orderCount >= VIP_ORDERS || totalCents >= VIP_TOTAL_CENTS) return 'vip';
  if (orderCount >= 2) return 'repeat';
  return 'new';
}

/** Orders link to customers by email; no separate foreign key at demo scale. */
export function upsertCustomer(name: string, email: string): number {
  const db = getDb();
  db.prepare('INSERT INTO customers (name, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name')
    .run(name, email, new Date().toISOString());
  const row = db.prepare('SELECT id FROM customers WHERE email = ?').get(email) as Row;
  return num(row.id);
}

const CUSTOMER_STATS = `
  SELECT c.id AS id, c.name AS name, c.email AS email,
         COUNT(DISTINCT o.id) AS orders,
         COALESCE(SUM(i.qty * i.unit_price_cents), 0) AS total,
         MAX(o.created_at) AS last_order
  FROM customers c
  LEFT JOIN orders o ON o.email = c.email
  LEFT JOIN order_items i ON i.order_id = o.id`;

function toCustomer(row: Row): Customer {
  const orderCount = num(row.orders);
  const totalCents = num(row.total);
  const lastOrderAt = row.last_order === null || row.last_order === undefined ? null : str(row.last_order);
  return {
    id: num(row.id),
    name: str(row.name),
    email: str(row.email),
    orderCount,
    totalCents,
    lastOrderAt,
    segment: segmentFor(orderCount, totalCents, lastOrderAt),
  };
}

export function listCustomers(): Customer[] {
  const rows = getDb().prepare(`${CUSTOMER_STATS} GROUP BY c.id ORDER BY total DESC`).all() as Row[];
  return rows.map(toCustomer);
}

export function getCustomer(id: number): Customer | null {
  const row = getDb().prepare(`${CUSTOMER_STATS} WHERE c.id = ? GROUP BY c.id`).get(id) as Row | undefined;
  return row ? toCustomer(row) : null;
}

export function getCustomerByEmail(email: string): Customer | null {
  const row = getDb().prepare(`${CUSTOMER_STATS} WHERE c.email = ? GROUP BY c.id`).get(email) as Row | undefined;
  return row ? toCustomer(row) : null;
}
