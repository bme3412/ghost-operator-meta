import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDb, repoRoot } from './db';

const FUNCTIONS = [
  { id: 'catalog-ops', name: 'Catalog Operations', responsibilities: 'Maintain accurate product content' },
  { id: 'creative', name: 'Creative Production', responsibilities: 'Prepare product assets' },
  { id: 'support', name: 'Customer Support', responsibilities: 'Maintain useful product references' },
];

const TASKS = [
  { id: 'read-supplier-package', functionId: 'catalog-ops', purpose: 'Read supplier package into structured product facts' },
  { id: 'resolve-approved-image', functionId: 'creative', purpose: 'Resolve the approved image and subject-selection rule' },
  { id: 'isolate-product', functionId: 'creative', purpose: 'Isolate the product into a reusable cutout' },
  { id: 'prepare-catalog-hero', functionId: 'creative', purpose: 'Prepare the catalog hero image' },
  { id: 'prepare-campaign-tile', functionId: 'creative', purpose: 'Prepare the campaign tile' },
  { id: 'create-catalog-draft', functionId: 'catalog-ops', purpose: 'Create the persisted catalog draft' },
  { id: 'prepare-support-card', functionId: 'support', purpose: 'Prepare a sourced product knowledge card' },
  { id: 'verify-outputs', functionId: 'catalog-ops', purpose: 'Verify inputs, artifacts, and the saved draft' },
];

/** Load Atlas's company graph seed. Idempotent: existing rows are kept. */
export function seed(): { functions: number; tasks: number; opportunities: number } {
  const db = getDb();
  let functions = 0;
  let tasks = 0;
  const putFunction = db.prepare('INSERT OR IGNORE INTO functions (id, name, responsibilities) VALUES (?, ?, ?)');
  for (const f of FUNCTIONS) functions += Number(putFunction.run(f.id, f.name, f.responsibilities).changes);
  const putTask = db.prepare('INSERT OR IGNORE INTO tasks (id, function_id, purpose) VALUES (?, ?, ?)');
  for (const t of TASKS) tasks += Number(putTask.run(t.id, t.functionId, t.purpose).changes);
  return { functions, tasks, opportunities: seedOpportunities(db) };
}

interface SaltbreakEvidence {
  openTickets: number;
  toteThreads: number;
  sampleTickets: string[];
  liveListings: number;
  campaignTiles: number;
  vipCount: number;
  lapsedCount: number;
  packingCount: number;
}

/**
 * Read-only evidence gathering from Saltbreak's database. This is the
 * sanctioned boundary: Atlas observes business state, never writes it.
 */
function gatherEvidence(): SaltbreakEvidence {
  const empty: SaltbreakEvidence = {
    openTickets: 0, toteThreads: 0, sampleTickets: [], liveListings: 0, campaignTiles: 0, vipCount: 0, lapsedCount: 0, packingCount: 0,
  };
  const root = repoRoot();
  if (!root) return empty;
  const file = path.join(root, 'data', 'saltbreak.db');
  if (!fs.existsSync(file)) return empty;
  const sb = new DatabaseSync(file);
  try {
    const one = (sql: string): number => Number((sb.prepare(sql).get() as { c: number } | undefined)?.c ?? 0);
    const openTickets = one("SELECT COUNT(*) AS c FROM tickets WHERE status = 'open'");
    const toteThreads = one("SELECT COUNT(*) AS c FROM tickets WHERE sku = 'SB-TOTE-005'");
    const sample = sb.prepare("SELECT id FROM tickets WHERE status = 'open' ORDER BY created_at DESC LIMIT 3").all() as Array<{ id: string }>;
    const liveListings = one("SELECT COUNT(*) AS c FROM products WHERE status = 'live'");
    const packingCount = one("SELECT COUNT(*) AS c FROM orders WHERE status = 'packing'");
    const vipCount = one(`SELECT COUNT(*) AS c FROM (
      SELECT o.email FROM orders o JOIN order_items i ON i.order_id = o.id
      GROUP BY o.email HAVING COUNT(DISTINCT o.id) >= 3 OR COALESCE(SUM(i.qty * i.unit_price_cents), 0) >= 50000
    )`);
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const lapsedCount = one(`SELECT COUNT(*) AS c FROM (
      SELECT o.email, MAX(o.created_at) AS last_order FROM orders o GROUP BY o.email HAVING last_order < '${cutoff}'
    )`);
    sb.close();
    return {
      openTickets, toteThreads,
      sampleTickets: sample.map((r) => r.id),
      liveListings, campaignTiles: 0, vipCount, lapsedCount, packingCount,
    };
  } catch {
    try { sb.close(); } catch { /* already closed */ }
    return empty;
  }
}

function seedOpportunities(db: ReturnType<typeof getDb>): number {
  const ev = gatherEvidence();
  const now = new Date().toISOString();
  const put = db.prepare(
    'INSERT OR IGNORE INTO opportunities (id, title, kind, state, hypothesis, impact, evidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const rows: Array<[string, string, string, string, string, string, string]> = [
    [
      'opp-support-replies',
      'Draft replies for open support tickets',
      'support_replies',
      'proposed',
      'Open tickets repeat the same questions; drafts grounded in approved product facts cut handle time.',
      `${ev.openTickets} open tickets, ${ev.toteThreads} about the tote. Estimated 4 min saved per ticket.`,
      JSON.stringify({ openTickets: ev.openTickets, toteThreads: ev.toteThreads, sampleTickets: ev.sampleTickets, staffRef: '/staff/inbox' }),
    ],
    [
      'opp-campaign-tiles',
      'Generate hero and campaign images for live listings',
      'creative_assets',
      'proposed',
      'Every listing ships supplier photography only; cutout-derived hero and campaign variants lift click-through.',
      `${ev.liveListings} live listings, ${ev.campaignTiles} with campaign tiles. One shared cutout per product.`,
      JSON.stringify({ liveListings: ev.liveListings, campaignTiles: ev.campaignTiles, staffRef: '/staff/assets' }),
    ],
    [
      'opp-vip-lapsed',
      'VIP thank-yous and lapsed-buyer win-backs',
      'outreach',
      'proposed',
      'High-value and dormant customers get no proactive outreach; short personalized emails recover revenue.',
      `${ev.vipCount} VIP and ${ev.lapsedCount} lapsed customers identified from order history.`,
      JSON.stringify({ vipCount: ev.vipCount, lapsedCount: ev.lapsedCount, staffRef: '/staff/customers' }),
    ],
    [
      'opp-fulfill-backlog',
      'Fulfill the packing backlog',
      'fulfillment',
      'proposed',
      'Packing orders wait on staff clicks; supervised execution clears them one by one with evidence.',
      `${ev.packingCount} orders sitting in packing. Each takes ~2 min of staff clicks.`,
      JSON.stringify({ packingCount: ev.packingCount, staffRef: '/staff/orders' }),
    ],
  ];
  let n = 0;
  for (const r of rows) n += Number(put.run(...r, now, now).changes);
  return n;
}
