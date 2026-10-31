// Payout, refund, Books formula, and ticket-filing tests. Each test runs in a
// child process against a scratch database via SALTBREAK_DB_PATH so the real
// data/ files are never touched. Run with: pnpm test (from this package).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pkgDir = path.resolve(__dirname, '..');

function run(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saltbreak-pay-'));
  const dbPath = path.join(dir, 'test.db');
  const wrapped = `
    const d = require(${JSON.stringify(path.join(pkgDir, 'dist', 'index.js'))});
    d.migrate();
    ${script}
    d.closeDb();
  `;
  try {
    const r = spawnSync(process.execPath, ['-e', wrapped], {
      cwd: pkgDir,
      encoding: 'utf8',
      env: { ...process.env, SALTBREAK_DB_PATH: dbPath },
    });
    assert.equal(r.status, 0, `child failed: ${r.stderr}`);
    return r.stdout.trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('payout seeds', () => {
  it('settles three October payouts with pinned scenario orders', () => {
    const out = run(`
      const counts = d.seed();
      if (counts.payouts !== 3) throw new Error('payouts: ' + JSON.stringify(counts));
      if (counts.paymentLines !== 20) throw new Error('lines: ' + JSON.stringify(counts));
      const p = d.getPayout('PO-1043');
      const charges = p.lines.filter((l) => l.type === 'charge');
      if (charges.length !== 14) throw new Error('PO-1043 charges: ' + charges.length);
      const dupes = charges.filter((l) => l.orderNumber === 'SB-8014' && l.amountCents === 4500);
      if (dupes.length !== 2) throw new Error('SB-8014 towel charges: ' + dupes.length);
      const o = d.getOrderByNumber('SB-8014');
      if (!o || o.totalCents !== 4500) throw new Error('SB-8014 total: ' + JSON.stringify(o));
      if (!d.getOrderByNumber('SB-8026')) throw new Error('SB-8026 missing');
      const p44 = d.getPayout('PO-1044');
      if (p44.lines.some((l) => l.type === 'refund' && l.amountCents === -4500)) {
        throw new Error('PO-1044 should lack the T-104 refund');
      }
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });
});

describe('reconciliation', () => {
  it('flags only the duplicated order, then clears on refund', () => {
    const out = run(`
      d.seed();
      const sent = d.sendToBooks('PO-1043');
      if (!sent.ok) throw new Error(sent.message);
      const before = d.evaluateSheet(sent.sheetId);
      if (before.get('B1') !== 45) throw new Error('variance pre: ' + before.get('B1'));
      const nos = [...before.entries()].filter(([k, v]) => k.startsWith('H') && v === 'No').map(([k]) => k);
      if (nos.length !== 1) throw new Error('No rows: ' + nos.join(','));
      const p = d.getPayout('PO-1043');
      const dupes = p.lines.filter((l) => l.orderNumber === 'SB-8014' && l.type === 'charge');
      const r = d.refundLine(dupes[1].id);
      if (!r.ok) throw new Error(r.message);
      const after = d.evaluateSheet(sent.sheetId);
      if (after.get('B1') !== 0) throw new Error('variance post: ' + after.get('B1'));
      const again = d.refundLine(dupes[1].id);
      if (again.ok) throw new Error('double refund allowed');
      const relisted = d.getPayout('PO-1043');
      if (!relisted.lines.some((l) => l.type === 'refund' && l.orderNumber === 'SB-8014' && l.amountCents === -4500)) {
        throw new Error('refund line missing');
      }
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });
});

describe('formula evaluator', () => {
  it('computes SUM, refs, ranges, IF, and ORDERTOTAL', () => {
    const out = run(`
      const db = d.getDb();
      db.prepare("INSERT INTO orders (number, customer_name, email, address, status, created_at) VALUES ('SB-1', 'A', 'a@x.co', 'x', 'packing', '')").run();
      const row = db.prepare('SELECT id FROM orders WHERE number = ?').get('SB-1');
      db.prepare('INSERT INTO order_items (order_id, sku, title, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?)').run(row.id, 'S', 'T', 2, 2500);
      const id = d.createSheet('t');
      d.setCells(id, [
        { ref: 'A1', raw: '10' },
        { ref: 'A2', raw: '20' },
        { ref: 'A3', raw: '=SUM(A1:A2)' },
        { ref: 'B1', raw: '=A3*2+5' },
        { ref: 'B2', raw: '=IF(A1=10,"Yes","No")' },
        { ref: 'B3', raw: '=ORDERTOTAL("SB-1")' },
        { ref: 'C1', raw: '=SUM(A:A)' },
        { ref: 'C2', raw: '=1/0' },
        { ref: 'C3', raw: '=NOSUCHFN(1)' },
      ]);
      const v = d.evaluateSheet(id);
      const want = new Map([['A3', 30], ['B1', 65], ['B2', 'Yes'], ['B3', 50], ['C2', '#DIV/0!'], ['C3', '#VALUE!']]);
      for (const [ref, expected] of want) {
        if (v.get(ref) !== expected) throw new Error(ref + ': ' + v.get(ref));
      }
      if (v.get('C1') !== 60) throw new Error('C1: ' + v.get('C1'));
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });

  it('degrades circular refs instead of hanging', () => {
    const out = run(`
      const id = d.createSheet('circ');
      d.setCells(id, [
        { ref: 'A1', raw: '=A2' },
        { ref: 'A2', raw: '=A1' },
      ]);
      const v = d.evaluateSheet(id);
      if (v.get('A1') !== '#CIRC!') throw new Error('A1: ' + v.get('A1'));
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });
});

describe('order help form path', () => {
  it('files the next ticket and logs the event', () => {
    const out = run(`
      d.seed();
      const before = d.listTickets().length;
      const r = d.createTicket({ subject: 'Charged twice', orderNumber: 'SB-8014', email: 'ellis@example.com', body: 'Please refund one.' });
      if (!r.ok || !r.id) throw new Error(r.message);
      if (d.listTickets().length !== before + 1) throw new Error('ticket not stored');
      const types = d.listEvents(5).map((e) => e.type);
      if (!types.includes('ticket_opened')) throw new Error('no event: ' + types.join(','));
      console.log('ok ' + r.id);
    `);
    assert.match(out, /^ok T-\d+$/);
  });
});

describe('promo lookup', () => {
  it('finds the active code and rejects the rest', () => {
    const out = run(`
      d.seed();
      if (!d.activePromo('harbor10')) throw new Error('HARBOR10 should be active');
      if (d.activePromo('SUMMER20')) throw new Error('SUMMER20 ended');
      if (d.activePromo('NOPE')) throw new Error('bogus should miss');
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });
});
