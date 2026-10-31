import { getDb } from './db';
import { num, recordHistory, str, type Row } from './catalog';
import { upsertCustomer } from './customers';
import { queueEmail, sendEmail } from './emails';
import { logEvent } from './events';

export interface OrderItem {
  sku: string;
  title: string;
  qty: number;
  unitPriceCents: number;
}

export interface Order {
  id: number;
  number: string;
  customerName: string;
  email: string;
  address: string;
  status: string;
  payment: string;
  createdAt: string;
  items: OrderItem[];
  totalCents: number;
}

function toItem(row: Row): OrderItem {
  return { sku: str(row.sku), title: str(row.title), qty: num(row.qty), unitPriceCents: num(row.unit_price_cents) };
}

function itemsFor(orderId: number): OrderItem[] {
  const rows = getDb().prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as Row[];
  return rows.map(toItem);
}

function toOrder(row: Row, items: OrderItem[]): Order {
  return {
    id: num(row.id),
    number: str(row.number),
    customerName: str(row.customer_name),
    email: str(row.email),
    address: str(row.address),
    status: str(row.status),
    payment: str(row.payment),
    createdAt: str(row.created_at),
    items,
    totalCents: items.reduce((sum, i) => sum + i.qty * i.unitPriceCents, 0),
  };
}

export function listOrders(): Order[] {
  const rows = getDb().prepare('SELECT * FROM orders ORDER BY id DESC').all() as Row[];
  return rows.map((row) => {
    const items = itemsFor(num(row.id));
    return toOrder(row, items);
  });
}

export function getOrder(id: number): Order | null {
  const row = getDb().prepare('SELECT * FROM orders WHERE id = ?').get(id) as Row | undefined;
  if (!row) return null;
  return toOrder(row, itemsFor(num(row.id)));
}

/** Look an order up by its public number (SB-8014); null when unknown. */
export function getOrderByNumber(number: string): Order | null {
  const row = getDb().prepare('SELECT * FROM orders WHERE number = ?').get(number) as Row | undefined;
  if (!row) return null;
  return toOrder(row, itemsFor(num(row.id)));
}

export interface CheckoutLine {
  sku: string;
  qty: number;
}

/**
 * Simulated checkout: validates stock, creates the order, decrements
 * inventory. All-or-nothing; insufficient stock blocks the whole order.
 */
export function checkout(input: {
  customerName: string;
  email: string;
  address: string;
  lines: CheckoutLine[];
}): { ok: boolean; orderId?: number; message: string } {
  const name = input.customerName.trim();
  if (!name) return { ok: false, message: 'Name is required.' };
  if (!input.email.trim()) return { ok: false, message: 'Email is required.' };
  if (!input.address.trim()) return { ok: false, message: 'Address is required.' };
  const lines = input.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) return { ok: false, message: 'The cart is empty.' };

  const db = getDb();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const priced: Array<{ sku: string; title: string; qty: number; unitPriceCents: number }> = [];
    for (const line of lines) {
      const row = db.prepare(
        `SELECT p.sku AS sku, p.title AS title, p.price_cents AS price_cents, p.status AS status,
                COALESCE(i.on_hand, 0) AS on_hand
         FROM products p LEFT JOIN inventory i ON i.sku = p.sku WHERE p.sku = ?`,
      ).get(line.sku) as Row | undefined;
      if (!row || str(row.status) !== 'live') {
        db.exec('ROLLBACK');
        return { ok: false, message: `${line.sku} is no longer available.` };
      }
      if (num(row.on_hand) < line.qty) {
        db.exec('ROLLBACK');
        return { ok: false, message: `Only ${num(row.on_hand)} of ${str(row.title)} in stock.` };
      }
      priced.push({ sku: str(row.sku), title: str(row.title), qty: line.qty, unitPriceCents: num(row.price_cents) });
    }
    const last = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(number, 4) AS INTEGER)), 1000) AS m FROM orders").get() as Row;
    const number = `SB-${num(last.m) + 1}`;
    const created = db.prepare(
      'INSERT INTO orders (number, customer_name, email, address, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(number, name, input.email.trim(), input.address.trim(), 'packing', now);
    const orderId = Number(created.lastInsertRowid);
    const putItem = db.prepare('INSERT INTO order_items (order_id, sku, title, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?)');
    const decStock = db.prepare('UPDATE inventory SET on_hand = on_hand - ?, updated_at = ? WHERE sku = ?');
    for (const p of priced) {
      putItem.run(orderId, p.sku, p.title, p.qty, p.unitPriceCents);
      decStock.run(p.qty, now, p.sku);
    }
    db.exec('COMMIT');
    for (const p of priced) recordHistory(p.sku, -p.qty, `order ${number}`);
    upsertCustomer(name, input.email.trim());
    logEvent('order_placed', 'order', String(orderId), { number, lines: priced.length });
    const summary = priced.map((p) => `${p.title} x ${p.qty}`).join(', ');
    const emailId = queueEmail({
      toEmail: input.email.trim(),
      subject: `Order ${number} confirmed`,
      body: `Thanks ${name}! Your order ${number} (${summary}) is being packed.`,
      kind: 'order_confirmation',
      relatedOrder: number,
    });
    sendEmail(emailId);
    return { ok: true, orderId, message: `Order ${number} created.` };
  } catch (err) {
    db.exec('ROLLBACK');
    return { ok: false, message: err instanceof Error ? err.message : 'Checkout failed.' };
  }
}

const TRANSITIONS: Record<string, string[]> = {
  packing: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

/** Move an order forward. Cancelled orders restock; use cancelOrder for that. */
export function setOrderStatus(id: number, status: string): { ok: boolean; message: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Row | undefined;
  if (!row) return { ok: false, message: `No order ${id}.` };
  const from = str(row.status);
  if (status === 'cancelled') return cancelOrder(id);
  if (!TRANSITIONS[from]?.includes(status)) {
    return { ok: false, message: `Cannot move order ${str(row.number)} from ${from} to ${status}.` };
  }
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  logEvent('order_status', 'order', String(id), { number: str(row.number), from, to: status });
  if (status === 'fulfilled') {
    const emailId = queueEmail({
      toEmail: str(row.email),
      subject: `Order ${str(row.number)} shipped`,
      body: `Good news ${str(row.customer_name)}! Your order ${str(row.number)} is on its way.`,
      kind: 'shipping_notice',
      relatedOrder: str(row.number),
    });
    sendEmail(emailId);
  }
  return { ok: true, message: `Order ${str(row.number)} is now ${status}.` };
}

/** Cancel a packing order and return its items to inventory. All-or-nothing. */
export function cancelOrder(id: number): { ok: boolean; message: string } {
  const db = getDb();
  const now = new Date().toISOString();
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Row | undefined;
  if (!row) return { ok: false, message: `No order ${id}.` };
  if (str(row.status) !== 'packing') {
    return { ok: false, message: `Only packing orders can be cancelled; ${str(row.number)} is ${str(row.status)}.` };
  }
  const number = str(row.number);
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('cancelled', id);
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id) as Row[];
    const restock = db.prepare('UPDATE inventory SET on_hand = on_hand + ?, updated_at = ? WHERE sku = ?');
    for (const item of items) restock.run(num(item.qty), now, str(item.sku));
    db.exec('COMMIT');
    for (const item of items) recordHistory(str(item.sku), num(item.qty), `cancel ${number} restock`);
    logEvent('order_cancelled', 'order', String(id), { number });
    return { ok: true, message: `Order ${number} cancelled and restocked.` };
  } catch (err) {
    db.exec('ROLLBACK');
    return { ok: false, message: err instanceof Error ? err.message : 'Cancel failed.' };
  }
}

export interface TicketReply {
  id: number;
  body: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  subject: string;
  sku: string | null;
  orderNumber: string | null;
  customerEmail: string | null;
  status: string;
  body: string;
  createdAt: string;
  replies: TicketReply[];
}

function repliesFor(ticketId: string): TicketReply[] {
  const rows = getDb().prepare('SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY id').all(ticketId) as Row[];
  return rows.map((row) => ({ id: num(row.id), body: str(row.body), createdAt: str(row.created_at) }));
}

export function listTickets(): Ticket[] {
  const rows = getDb().prepare('SELECT * FROM tickets ORDER BY created_at DESC').all() as Row[];
  return rows.map((row) => ({
    id: str(row.id),
    subject: str(row.subject),
    sku: row.sku === null || row.sku === undefined ? null : str(row.sku),
    orderNumber: row.order_number === null || row.order_number === undefined ? null : str(row.order_number),
    customerEmail: row.customer_email === null || row.customer_email === undefined ? null : str(row.customer_email),
    status: str(row.status),
    body: str(row.body),
    createdAt: str(row.created_at),
    replies: repliesFor(str(row.id)),
  }));
}

export function addReply(ticketId: string, body: string): { ok: boolean; message: string } {
  if (!body.trim()) return { ok: false, message: 'Reply cannot be empty.' };
  const db = getDb();
  db.prepare('INSERT INTO ticket_replies (ticket_id, body, created_at) VALUES (?, ?, ?)').run(ticketId, body.trim(), new Date().toISOString());
  logEvent('ticket_replied', 'ticket', ticketId, {});
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as Row | undefined;
  const email = ticket?.customer_email;
  if (ticket && email !== null && email !== undefined && String(email).includes('@')) {
    queueEmail({
      toEmail: String(email),
      subject: `Re: ${str(ticket.subject)}`,
      body: body.trim(),
      kind: 'support_reply',
    });
  }
  return { ok: true, message: 'Reply posted.' };
}

export function setTicketStatus(id: string, status: string): void {
  getDb().prepare('UPDATE tickets SET status = ? WHERE id = ?').run(status, id);
  logEvent('ticket_status', 'ticket', id, { to: status });
}

/**
 * File a ticket from the storefront order help form. Ids continue the
 * T-101 sequence; the ticket opens unanswered in the staff inbox.
 */
export function createTicket(input: {
  subject: string;
  sku?: string | null;
  orderNumber?: string | null;
  email?: string | null;
  body: string;
}): { ok: boolean; message: string; id?: string } {
  const subject = input.subject.trim();
  if (!subject) return { ok: false, message: 'Subject is required.' };
  if (!input.body.trim()) return { ok: false, message: 'Message is required.' };
  const db = getDb();
  const last = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id, 3) AS INTEGER)), 100) AS m FROM tickets").get() as Row;
  const id = `T-${num(last.m) + 1}`;
  db.prepare(
    'INSERT INTO tickets (id, subject, sku, order_number, customer_email, status, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    subject,
    input.sku ?? null,
    input.orderNumber ?? null,
    input.email?.trim() ? input.email.trim() : null,
    'open',
    input.body.trim(),
    new Date().toISOString()
  );
  logEvent('ticket_opened', 'ticket', id, { subject, orderNumber: input.orderNumber ?? null });
  return { ok: true, message: `Ticket ${id} created.`, id };
}
