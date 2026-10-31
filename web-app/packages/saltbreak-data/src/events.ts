import type { SQLOutputValue } from 'node:sqlite';
import { getDb } from './db';

/**
 * Append-only business event log. Every Saltbreak subsystem writes here on
 * state change. Atlas reads this log to find automation opportunities —
 * it never queries business tables directly.
 */
export interface BusinessEvent {
  id: number;
  type: string;
  entity: string;
  entityId: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export function logEvent(type: string, entity: string, entityId: string, data: Record<string, unknown> = {}): void {
  getDb()
    .prepare('INSERT INTO events (type, entity, entity_id, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(type, entity, entityId, JSON.stringify(data), new Date().toISOString());
}

export function listEvents(limit = 50): BusinessEvent[] {
  const rows = getDb().prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit) as Array<Record<string, SQLOutputValue>>;
  return rows.map((row) => {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(String(row.data ?? '{}')) as Record<string, unknown>;
    } catch {
      data = {};
    }
    return {
      id: Number(row.id ?? 0),
      type: String(row.type ?? ''),
      entity: String(row.entity ?? ''),
      entityId: String(row.entity_id ?? ''),
      data,
      createdAt: String(row.created_at ?? ''),
    };
  });
}
