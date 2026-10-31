import { getDb } from './db';
import { num, str, type Row } from './catalog';
import { logEvent } from './events';
import { createSheet, getSheetByName, listCells, parseRef, refOf, setCell, setCells } from './books';

/**
 * TidePay payouts: weekly processor settlements over Saltbreak orders.
 * Charges carry per-charge fees; refunds are negative lines. Reconciliation
 * sheets aggregate charges per order so a duplicated charge reads as a
 * gross-vs-order-total mismatch on that order's row.
 */

/** TidePay's fictional schedule: 2.9% plus a flat 30c per charge. */
export function tidepayFee(grossCents: number): number {
  return Math.round(grossCents * 0.029) + 30;
}

function dollars(cents: number): string {
  return String(Number((cents / 100).toFixed(2)));
}

export interface PaymentLine {
  id: number;
  payoutId: string;
  orderNumber: string;
  type: string;
  amountCents: number;
  feeCents: number;
  createdAt: string;
}

export interface Payout {
  id: string;
  arrivesAt: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  lines: PaymentLine[];
}

function toLine(row: Row): PaymentLine {
  return {
    id: num(row.id),
    payoutId: str(row.payout_id),
    orderNumber: str(row.order_number),
    type: str(row.type),
    amountCents: num(row.amount_cents),
    feeCents: num(row.fee_cents),
    createdAt: str(row.created_at),
  };
}

export function listPayouts(): Array<{
  id: string;
  arrivesAt: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  lineCount: number;
}> {
  const rows = getDb().prepare('SELECT * FROM payouts ORDER BY arrives_at').all() as Row[];
  return rows.map((row) => {
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM payment_lines WHERE payout_id = ?').get(str(row.id)) as Row;
    return {
      id: str(row.id),
      arrivesAt: str(row.arrives_at),
      grossCents: num(row.gross_cents),
      feeCents: num(row.fee_cents),
      netCents: num(row.net_cents),
      lineCount: num(count.c),
    };
  });
}

export function getPayout(id: string): Payout | null {
  const row = getDb().prepare('SELECT * FROM payouts WHERE id = ?').get(id) as Row | undefined;
  if (!row) return null;
  const lines = (getDb().prepare('SELECT * FROM payment_lines WHERE payout_id = ? ORDER BY id').all(id) as Row[]).map(toLine);
  return {
    id: str(row.id),
    arrivesAt: str(row.arrives_at),
    grossCents: num(row.gross_cents),
    feeCents: num(row.fee_cents),
    netCents: num(row.net_cents),
    lines,
  };
}

function recomputePayoutTotals(payoutId: string): void {
  const lines = (getDb().prepare('SELECT * FROM payment_lines WHERE payout_id = ?').all(payoutId) as Row[]).map(toLine);
  const gross = lines.filter((l) => l.type === 'charge').reduce((s, l) => s + l.amountCents, 0);
  const fee = lines.filter((l) => l.type === 'charge').reduce((s, l) => s + l.feeCents, 0);
  const net = lines.reduce((s, l) => s + l.amountCents - l.feeCents, 0);
  getDb().prepare('UPDATE payouts SET gross_cents = ?, fee_cents = ?, net_cents = ? WHERE id = ?').run(gross, fee, net, payoutId);
}

export function sheetNameForPayout(payoutId: string): string {
  return `${payoutId} reconciliation`;
}

interface BookRow {
  date: string;
  order: string;
  type: string;
  grossCents: number;
  feeCents: number;
}

/**
 * Build the 9-column reconciliation layout: a Variance row, headers, one row
 * per order (charges aggregated, so duplicates mismatch), refund rows
 * verbatim, and a TOTALS row. Refund rows carry a zero order total so the
 * variance formula needs no per-row corrections.
 */
export function buildReconciliationCells(charges: BookRow[], refunds: BookRow[]): Array<{ ref: string; raw: string }> {
  const rows = [...charges, ...refunds];
  const first = 3;
  const last = first + rows.length - 1;
  const totalRow = last + 1;
  const cells: Array<{ ref: string; raw: string }> = [
    { ref: 'A1', raw: 'Variance' },
    { ref: 'B1', raw: `=SUM(D${first}:D${last})-SUM(G${first}:G${last})` },
  ];
  const headers = ['Date', 'Order', 'Type', 'Gross', 'Fee', 'Net', 'Order total', 'Match', 'Action'];
  headers.forEach((h, i) => cells.push({ ref: refOf(i, 1), raw: h }));
  rows.forEach((row, i) => {
    const r = first + i;
    cells.push({ ref: refOf(0, r - 1), raw: row.date });
    cells.push({ ref: refOf(1, r - 1), raw: row.order });
    cells.push({ ref: refOf(2, r - 1), raw: row.type });
    cells.push({ ref: refOf(3, r - 1), raw: dollars(row.grossCents) });
    cells.push({ ref: refOf(4, r - 1), raw: dollars(row.feeCents) });
    cells.push({ ref: refOf(5, r - 1), raw: `=D${r}-E${r}` });
    cells.push({
      ref: refOf(6, r - 1),
      raw: row.type === 'refund' ? '0' : `=ORDERTOTAL("${row.order}")`,
    });
    cells.push({ ref: refOf(7, r - 1), raw: `=IF(C${r}="refund","Yes",IF(D${r}=G${r},"Yes","No"))` });
    cells.push({ ref: refOf(8, r - 1), raw: '' });
  });
  cells.push({ ref: refOf(0, totalRow - 1), raw: 'TOTALS' });
  for (const col of [3, 4, 5, 6]) {
    cells.push({ ref: refOf(col, totalRow - 1), raw: `=SUM(${refOf(col, first - 1)}:${refOf(col, last - 1)})` });
  }
  return cells;
}

function aggregateCharges(lines: PaymentLine[]): BookRow[] {
  const byOrder = new Map<string, { date: string; gross: number; fee: number }>();
  for (const line of lines.filter((l) => l.type === 'charge')) {
    const day = line.createdAt.slice(0, 10);
    const agg = byOrder.get(line.orderNumber) ?? { date: day, gross: 0, fee: 0 };
    if (day < agg.date) agg.date = day;
    agg.gross += line.amountCents;
    agg.fee += line.feeCents;
    byOrder.set(line.orderNumber, agg);
  }
  return [...byOrder.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([order, agg]) => ({ date: agg.date, order, type: 'charge', grossCents: agg.gross, feeCents: agg.fee }));
}

/**
 * Generate (or regenerate) a payout's reconciliation sheet. Replaces every
 * cell, so re-sending after manual edits discards them.
 */
export function sendToBooks(payoutId: string): { ok: boolean; message: string; sheetId?: number } {
  const payout = getPayout(payoutId);
  if (!payout) return { ok: false, message: `No payout ${payoutId}.` };
  const refunds: BookRow[] = payout.lines
    .filter((l) => l.type === 'refund')
    .map((l) => ({ date: l.createdAt.slice(0, 10), order: l.orderNumber, type: 'refund', grossCents: l.amountCents, feeCents: 0 }));
  const sheetId = createSheet(sheetNameForPayout(payoutId));
  setCells(sheetId, buildReconciliationCells(aggregateCharges(payout.lines), refunds));
  logEvent('sheet_generated', 'sheet', String(sheetId), { payout: payoutId });
  return { ok: true, message: `Sheet ${sheetNameForPayout(payoutId)} ready.`, sheetId };
}

/**
 * Refund one charge line (simulated): appends a negative refund line,
 * recomputes the payout totals, and — when the payout has a reconciliation
 * sheet — appends the refund row and extends the sheet's range formulas, so
 * returning to Books shows the new variance with no re-send.
 */
export function refundLine(lineId: number): { ok: boolean; message: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM payment_lines WHERE id = ?').get(lineId) as Row | undefined;
  if (!row) return { ok: false, message: `No payment line ${lineId}.` };
  const line = toLine(row);
  if (line.type !== 'charge') return { ok: false, message: 'Only charge lines can be refunded.' };
  const dup = db
    .prepare('SELECT id FROM payment_lines WHERE payout_id = ? AND order_number = ? AND type = ? AND amount_cents = ?')
    .get(line.payoutId, line.orderNumber, 'refund', -line.amountCents) as Row | undefined;
  if (dup) return { ok: false, message: 'That charge was already refunded.' };
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO payment_lines (payout_id, order_number, type, amount_cents, fee_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(line.payoutId, line.orderNumber, 'refund', -line.amountCents, 0, now);
  recomputePayoutTotals(line.payoutId);
  const sheet = getSheetByName(sheetNameForPayout(line.payoutId));
  if (sheet) appendRefundRow(sheet.id, line.orderNumber, now.slice(0, 10), -line.amountCents);
  logEvent('line_refunded', 'payment_line', String(lineId), {
    payout: line.payoutId,
    order: line.orderNumber,
    amountCents: -line.amountCents,
  });
  return { ok: true, message: `Refunded ${dollars(line.amountCents)} on ${line.orderNumber} (simulated).` };
}

/** Insert a refund row above the TOTALS row and extend the range formulas. */
function appendRefundRow(sheetId: number, order: string, date: string, amountCents: number): void {
  const cells = listCells(sheetId);
  const totalCell = cells.find((c) => c.raw === 'TOTALS');
  if (!totalCell) return;
  const totalRow = Number(totalCell.ref.replace(/^[A-Z]+/, ''));
  if (!Number.isFinite(totalRow) || totalRow < 4) return;
  // Move the TOTALS row down one, then write the refund row in its place.
  for (const cell of cells) {
    const parsed = parseRef(cell.ref);
    if (!parsed || parsed[1] + 1 !== totalRow) continue;
    setCell(sheetId, refOf(parsed[0], totalRow), cell.raw);
  }
  const r = totalRow;
  const first = 3;
  const last = totalRow;
  setCell(sheetId, `A${r}`, date);
  setCell(sheetId, `B${r}`, order);
  setCell(sheetId, `C${r}`, 'refund');
  setCell(sheetId, `D${r}`, dollars(amountCents));
  setCell(sheetId, `E${r}`, '0');
  setCell(sheetId, `F${r}`, `=D${r}-E${r}`);
  setCell(sheetId, `G${r}`, '0');
  setCell(sheetId, `H${r}`, `=IF(C${r}="refund","Yes",IF(D${r}=G${r},"Yes","No"))`);
  setCell(sheetId, `I${r}`, '');
  setCell(sheetId, 'B1', `=SUM(D${first}:D${last})-SUM(G${first}:G${last})`);
  for (const col of ['D', 'E', 'F', 'G']) {
    setCell(sheetId, `${col}${totalRow + 1}`, `=SUM(${col}${first}:${col}${last})`);
  }
}

/** Processor-native CSV export of a payout's lines (cents, TidePay headers). */
export function payoutCsv(payoutId: string): string | null {
  const payout = getPayout(payoutId);
  if (!payout) return null;
  const lines = ['tidepay_date,order_number,type,amount_cents,fee_cents'];
  for (const line of payout.lines) {
    lines.push(
      [line.createdAt.slice(0, 10), line.orderNumber, line.type, line.amountCents, line.feeCents].join(',')
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Import a TidePay CSV into a fresh reconciliation sheet with the same
 * layout as Send to Books. Lenient about blank lines; strict about the
 * header and numeric cents.
 */
export function importPayoutCsv(name: string, csvText: string): { ok: boolean; message: string; sheetId?: number } {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const header = (lines.shift() ?? '').split(',').map((h) => h.trim());
  const idx = (col: string): number => header.indexOf(col);
  if (idx('order_number') < 0 || idx('type') < 0 || idx('amount_cents') < 0) {
    return { ok: false, message: 'CSV needs order_number, type, and amount_cents columns.' };
  }
  const charges: BookRow[] = [];
  const refunds: BookRow[] = [];
  for (const line of lines) {
    const cols = line.split(',').map((c) => c.trim());
    const order = cols[idx('order_number')] ?? '';
    const type = (cols[idx('type')] ?? '').toLowerCase();
    const amount = Number(cols[idx('amount_cents')] ?? '');
    const fee = idx('fee_cents') >= 0 ? Number(cols[idx('fee_cents')] ?? '0') : 0;
    const date = idx('tidepay_date') >= 0 ? (cols[idx('tidepay_date')] ?? '') : '';
    if (!order || (type !== 'charge' && type !== 'refund')) {
      return { ok: false, message: `Bad row (want an order and type charge|refund): ${line}.` };
    }
    if (!Number.isInteger(amount) || !Number.isInteger(fee)) {
      return { ok: false, message: `Bad row (want integer cents): ${line}.` };
    }
    // Aggregate charges per order so duplicates mismatch like Send to Books.
    const target = type === 'charge' ? charges : refunds;
    const day = date || new Date().toISOString().slice(0, 10);
    if (type === 'charge') {
      const agg = target.find((r) => r.order === order);
      if (agg) {
        if (day < agg.date) agg.date = day;
        agg.grossCents += amount;
        agg.feeCents += fee;
      } else {
        target.push({ date: day, order, type, grossCents: amount, feeCents: fee });
      }
    } else {
      target.push({ date: day, order, type, grossCents: amount, feeCents: 0 });
    }
  }
  if (charges.length === 0 && refunds.length === 0) return { ok: false, message: 'CSV has no data rows.' };
  const sheetId = createSheet(name);
  setCells(sheetId, buildReconciliationCells(charges, refunds));
  logEvent('sheet_imported', 'sheet', String(sheetId), { name });
  return { ok: true, message: `Imported ${charges.length + refunds.length} rows into ${name}.`, sheetId };
}
