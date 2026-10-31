import type { SQLOutputValue } from 'node:sqlite';
import { getDb } from './db';
import { logEvent } from './events';

type Row = Record<string, SQLOutputValue>;

function str(v: SQLOutputValue | undefined): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

function num(v: SQLOutputValue | undefined): number {
  return Number(v ?? 0);
}

export interface Email {
  id: number;
  toEmail: string;
  subject: string;
  body: string;
  kind: string;
  status: string;
  relatedOrder: string | null;
  createdAt: string;
  sentAt: string | null;
}

function toEmail(row: Row): Email {
  return {
    id: num(row.id),
    toEmail: str(row.to_email),
    subject: str(row.subject),
    body: str(row.body),
    kind: str(row.kind),
    status: str(row.status),
    relatedOrder: row.related_order === null || row.related_order === undefined ? null : str(row.related_order),
    createdAt: str(row.created_at),
    sentAt: row.sent_at === null || row.sent_at === undefined ? null : str(row.sent_at),
  };
}

/** Queue an email. Nothing is actually delivered; sending flips the status. */
export function queueEmail(input: {
  toEmail: string;
  subject: string;
  body: string;
  kind: string;
  relatedOrder?: string | null;
}): number {
  const db = getDb();
  const r = db
    .prepare('INSERT INTO emails (to_email, subject, body, kind, status, related_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(input.toEmail, input.subject, input.body, input.kind, 'queued', input.relatedOrder ?? null, new Date().toISOString());
  const id = Number(r.lastInsertRowid);
  logEvent('email_queued', 'email', String(id), { to: input.toEmail, kind: input.kind });
  return id;
}

/** Simulated send: marks a queued email sent. Idempotent. */
export function sendEmail(id: number): { ok: boolean; message: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM emails WHERE id = ?').get(id) as Row | undefined;
  if (!row) return { ok: false, message: `No email ${id}.` };
  if (str(row.status) === 'sent') return { ok: true, message: `Email ${id} already sent.` };
  const now = new Date().toISOString();
  db.prepare('UPDATE emails SET status = ?, sent_at = ? WHERE id = ?').run('sent', now, id);
  logEvent('email_sent', 'email', String(id), { to: str(row.to_email), kind: str(row.kind) });
  return { ok: true, message: `Email ${id} sent to ${str(row.to_email)}.` };
}

export function listEmails(limit = 50): Email[] {
  const rows = getDb().prepare('SELECT * FROM emails ORDER BY id DESC LIMIT ?').all(limit) as Row[];
  return rows.map(toEmail);
}

export function countQueued(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM emails WHERE status = 'queued'").get() as Row;
  return num(row.c);
}
