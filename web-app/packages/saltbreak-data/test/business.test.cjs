// Business-rule tests for the event log, email outbox, and CRM. Each test runs
// against a scratch database via SALTBREAK_DB_PATH so the real data/ files are
// never touched. Run with: pnpm test (from this package).
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pkgDir = path.resolve(__dirname, '..');

function run(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saltbreak-biz-'));
  const dbPath = path.join(dir, 'test.db');
  const wrapped = `
    const d = require(${JSON.stringify(path.join(pkgDir, 'dist', 'index.js'))});
    d.migrate();
    const db = d.getDb();
    db.prepare("INSERT INTO products (sku, title, category, material, color, dimensions_value, dimensions_unit, description, price_cents, status, updated_at) VALUES ('P-1', 'Widget', 'Gear', 'Plastic', 'Red', '1', 'in', '', 10000, 'live', '')").run();
    db.prepare("INSERT INTO inventory (sku, on_hand, updated_at) VALUES ('P-1', 5, '')").run();
    db.prepare("INSERT INTO tickets (id, subject, sku, order_number, customer_email, status, body, created_at) VALUES ('T-9', 'Help', 'P-1', NULL, 'buyer@example.com', 'open', '', '')").run();
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

describe('business infrastructure', () => {
  it('checkout emits event, sends confirmation, creates customer', () => {
    const out = run(`
      const co = d.checkout({ customerName: 'Buyer', email: 'buyer@example.com', address: '1 Main', lines: [{ sku: 'P-1', qty: 2 }] });
      if (!co.ok) throw new Error(co.message);
      const types = d.listEvents(10).map((e) => e.type);
      for (const t of ['order_placed', 'email_queued', 'email_sent']) {
        if (!types.includes(t)) throw new Error('missing event ' + t + ': ' + types.join(','));
      }
      const emails = d.listEmails();
      if (emails.length !== 1 || emails[0].status !== 'sent') throw new Error('confirmation not sent');
      const c = d.getCustomerByEmail('buyer@example.com');
      if (!c || c.orderCount !== 1 || c.segment !== 'new') throw new Error('customer wrong: ' + JSON.stringify(c));
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });

  it('cancel restocks and logs order_cancelled', () => {
    const out = run(`
      const co = d.checkout({ customerName: 'B', email: 'b@example.com', address: 'x', lines: [{ sku: 'P-1', qty: 2 }] });
      const before = d.getProduct('P-1').onHand;
      const r = d.cancelOrder(co.orderId);
      if (!r.ok) throw new Error(r.message);
      const after = d.getProduct('P-1').onHand;
      if (after !== before + 2) throw new Error('restock failed: ' + before + ' -> ' + after);
      if (!d.listEvents(10).some((e) => e.type === 'order_cancelled')) throw new Error('no cancel event');
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });

  it('segments are vip, repeat, new, lapsed', () => {
    const out = run(`
      const seg = d.segmentFor;
      if (seg(1, 100, new Date().toISOString()) !== 'new') throw new Error('new wrong');
      if (seg(2, 100, new Date().toISOString()) !== 'repeat') throw new Error('repeat wrong');
      if (seg(3, 100, new Date().toISOString()) !== 'vip') throw new Error('vip-by-count wrong');
      if (seg(1, 50000, new Date().toISOString()) !== 'vip') throw new Error('vip-by-spend wrong');
      if (seg(9, 99999, new Date(Date.now() - 100 * 86400000).toISOString()) !== 'lapsed') throw new Error('lapsed wrong');
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });

  it('ticket reply queues a customer email and logs the event', () => {
    const out = run(`
      const r = d.addReply('T-9', 'Try rinsing with fresh water.');
      if (!r.ok) throw new Error(r.message);
      const emails = d.listEmails();
      if (emails.length !== 1 || emails[0].status !== 'queued' || emails[0].toEmail !== 'buyer@example.com') {
        throw new Error('reply email wrong: ' + JSON.stringify(emails));
      }
      if (!d.listEvents(10).some((e) => e.type === 'ticket_replied')) throw new Error('no reply event');
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });

  it('publishing logs product_published', () => {
    const out = run(`
      d.upsertDraft({ sku: 'P-1', title: 'Widget', category: 'Gear', material: 'Plastic', color: 'Red', dimensionsValue: '1', dimensionsUnit: 'in', description: '', priceCents: 10000, care: '' });
      const r = d.publishDraft('P-1');
      if (!r.ok) throw new Error(r.message);
      if (!d.listEvents(10).some((e) => e.type === 'product_published')) throw new Error('no publish event');
      console.log('ok');
    `);
    assert.equal(out, 'ok');
  });
});
