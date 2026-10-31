import { createHash } from 'node:crypto';
import { getDb } from './db';
import { tidepayFee } from './payments';

interface Fixture {
  sku: string;
  title: string;
  category: string;
  material: string;
  color: string;
  dimensionsValue: string;
  dimensionsUnit: string;
  description: string;
  priceCents: number;
  spec: string;
  live: boolean;
  stock: number;
}

const FIXTURES: Fixture[] = [
  {
    sku: 'SB-BOARD-001',
    title: "Drift 8'0\" Foam Surfboard",
    category: 'Surfboards',
    material: 'Foam / HDPE',
    color: 'Seafoam',
    dimensionsValue: '96 x 22 x 3',
    dimensionsUnit: 'in',
    description: 'Stable foam longboard for beginners and small days. Volume approx 80 L — floats riders up to about 200 lb.',
    priceCents: 34900,
    spec: 'Supplier spec: Drift 8\'0" foam surfboard, soft-top construction, thruster fin set included.',
    live: true,
    stock: 12,
  },
  {
    sku: 'SB-BOARD-002',
    title: 'Reef 6\'2" Shortboard',
    category: 'Surfboards',
    material: 'Epoxy / Fiberglass',
    color: 'Coral',
    dimensionsValue: '74 x 19.5 x 2.5',
    dimensionsUnit: 'in',
    description: 'Responsive epoxy shortboard for punchy beach breaks.',
    priceCents: 42900,
    spec: 'Supplier spec: Reef 6\'2" epoxy shortboard, squash tail, FCS II fin boxes.',
    live: false,
    stock: 0,
  },
  {
    sku: 'SB-TOWEL-003',
    title: 'Côte Beach Towel',
    category: 'Beach Gear',
    material: 'Cotton',
    color: 'Azur Stripe',
    dimensionsValue: '70 x 35',
    dimensionsUnit: 'in',
    description:
      'Grande serviette de plage tissée — an oversized woven beach towel with a soft terry face and a flat-woven reverse, finished with hand-knotted fringe.',
    priceCents: 4500,
    spec: 'Supplier spec: Côte beach towel, 100% cotton, 450 GSM, azur stripe.',
    live: true,
    stock: 20,
  },
  {
    sku: 'SB-PADDLE-004',
    title: 'Carbon SUP Paddle',
    category: 'Paddle Gear',
    material: 'Carbon Fiber',
    color: 'Black',
    dimensionsValue: '67-83 adjustable',
    dimensionsUnit: 'in',
    description: 'Lightweight adjustable carbon paddle for stand-up paddleboarding.',
    priceCents: 12900,
    spec: 'Supplier spec: Carbon SUP paddle, 3-piece adjustable shaft, nylon blade.',
    live: true,
    stock: 8,
  },
  {
    sku: 'SB-TOTE-005',
    title: 'Woven Beach Tote',
    category: 'Beach Gear',
    material: 'Seagrass',
    color: 'Natural',
    dimensionsValue: '',
    dimensionsUnit: '',
    description: 'Handwoven seagrass tote for beach days.',
    priceCents: 3800,
    spec: 'Supplier spec: Woven beach tote. Dimensions not provided by supplier.',
    live: false,
    stock: 0,
  },
  {
    sku: 'SB-PHOTO-006',
    title: 'Shoreline Quiver Photo',
    category: 'Surfboards',
    material: 'Mixed',
    color: 'Mixed',
    dimensionsValue: 'varies',
    dimensionsUnit: 'in',
    description: 'Supplier lifestyle photograph showing two surfboards on the beach.',
    priceCents: 0,
    spec: 'Supplier spec: lifestyle photo. Manifest does not resolve which board is the listed product.',
    live: false,
    stock: 0,
  },
  {
    sku: 'SB-APP-007',
    title: 'Harbor Rash Guard',
    category: 'Apparel',
    material: 'Nylon / Spandex',
    color: 'Navy',
    dimensionsValue: 'S-XXL',
    dimensionsUnit: 'size',
    description: 'UPF 50+ long-sleeve rash guard for long sessions.',
    priceCents: 5900,
    spec: 'Supplier spec: Harbor rash guard, UPF 50+, flatlock seams.',
    live: true,
    stock: 15,
  },
  {
    sku: 'SB-ACC-008',
    title: 'Wax and Leash Kit',
    category: 'Accessories',
    material: 'Paraffin / Urethane',
    color: 'Natural / Black',
    dimensionsValue: '2 bars + 6ft leash',
    dimensionsUnit: 'kit',
    description: 'Two bars of all-temp wax plus a 6-foot comp leash.',
    priceCents: 3400,
    spec: 'Supplier spec: wax and leash kit, all-temperature wax, 6ft urethane leash.',
    live: true,
    stock: 30,
  },
  {
    sku: 'SB-GEAR-009',
    title: 'Harbor Beach Umbrella',
    category: 'Beach Gear',
    material: 'Canvas / Ash Wood',
    color: 'Navy Stripe',
    dimensionsValue: '7ft canopy',
    dimensionsUnit: 'ft',
    description: 'Seven-foot canvas beach umbrella with sand anchor.',
    priceCents: 8900,
    spec: 'Supplier spec: Harbor beach umbrella, 7ft canvas canopy, ash pole.',
    live: true,
    stock: 0,
  },
  {
    sku: 'SB-GEAR-010',
    title: 'Drift Cooler Bag',
    category: 'Beach Gear',
    material: 'Canvas / PEVA',
    color: 'Sand',
    dimensionsValue: '20L',
    dimensionsUnit: 'L',
    description: 'Twenty-liter insulated cooler bag for beach days.',
    priceCents: 6400,
    spec: 'Supplier spec: Drift cooler bag, 20L insulated, shoulder strap.',
    live: true,
    stock: 2,
  },
  {
    sku: 'SB-BOARD-011',
    title: 'Grom 6\'6" Funboard',
    category: 'Surfboards',
    material: 'Epoxy / Fiberglass',
    color: 'Sunshine',
    dimensionsValue: '78 x 21 x 2.75',
    dimensionsUnit: 'in',
    description: 'Forgiving funboard shape for progressing groms.',
    priceCents: 38900,
    spec: 'Supplier spec: Grom 6\'6" funboard, rounded nose, thruster setup.',
    live: true,
    stock: 6,
  },
];

const TICKETS = [
  {
    id: 'T-101',
    subject: 'Is the Drift 8\'0" right for a 200lb beginner?',
    sku: 'SB-BOARD-001',
    orderNumber: null,
    customerEmail: 'sam@example.com',
    status: 'open',
    body: 'Customer asks whether the Drift foam board floats enough for a 200lb first-timer. Needs a sizing answer from product facts.',
  },
  {
    id: 'T-102',
    subject: 'Where is order SB-1002?',
    sku: null,
    orderNumber: 'SB-1002',
    customerEmail: 'tom@example.com',
    status: 'pending',
    body: 'Customer asks for tracking on their shortboard order. Waiting on warehouse scan.',
  },
  {
    id: 'T-103',
    subject: 'How do I clean the Woven Beach Tote?',
    sku: 'SB-TOTE-005',
    orderNumber: null,
    customerEmail: 'priya@example.com',
    status: 'open',
    body: 'Customer wants care instructions for the seagrass tote. Supplier never provided care information, so staff cannot answer from approved facts.',
  },
];

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

/** Deterministic PRNG so backfilled history is stable across resets. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BACKFILL_CUSTOMERS: Array<[string, string, string]> = [
  ['Alex Morgan', 'alex@example.com', '21 Reef Rd, San Diego CA'],
  ['Blake Lee', 'blake@example.com', '9 Swell St, Oahu HI'],
  ['Casey Kim', 'casey@example.com', '44 Tide Ave, Virginia Beach VA'],
  ['Devon Fox', 'devon@example.com', '12 Break St, Cocoa Beach FL'],
  ['Ellis Ray', 'ellis@example.com', '77 Dune Ct, Outer Banks NC'],
  ['Frankie Lou', 'frankie@example.com', '5 Pelican Way, Galveston TX'],
  ['Gray Sloan', 'gray@example.com', '90 Coral Dr, Miami FL'],
  ['Harper Quinn', 'harper@example.com', '33 Anchor Ln, Seattle WA'],
  ['Ivy Chen', 'ivy@example.com', '18 Lagoon Blvd, San Clemente CA'],
  ['Jordan Blake', 'jordan@example.com', '25 Jetty Rd, Narragansett RI'],
  ['Kai Noor', 'kai@example.com', '7 Atoll Ave, Honolulu HI'],
  ['Logan Pierce', 'logan@example.com', '52 Spindrift Ct, La Jolla CA'],
];

interface BackfillTicket {
  id: string;
  days: number;
  subject: string;
  sku: string | null;
  orderNumber: string | null;
  email: string;
  status: string;
  body: string;
  reply: string | null;
}

const BACKFILL_TICKETS: BackfillTicket[] = [
  { id: 'T-104', days: 27, subject: 'Board arrived with a pressure ding', sku: 'SB-BOARD-011', orderNumber: null, email: 'gray@example.com', status: 'resolved', body: 'Small pressure ding on the rail out of the box.', reply: 'Sorry about that — a partial refund is on its way.' },
  { id: 'T-105', days: 23, subject: 'Which wax for cold water?', sku: 'SB-ACC-008', orderNumber: null, email: 'kai@example.com', status: 'resolved', body: 'Is the kit wax good below 60F?', reply: 'Yes — the kit includes all-temperature wax, fine below 60F.' },
  { id: 'T-106', days: 19, subject: 'Refund for duplicate towel order', sku: null, orderNumber: 'SB-8014', email: 'ellis@example.com', status: 'open', body: 'I was charged twice for the Côte towel, please refund one.', reply: null },
  { id: 'T-107', days: 13, subject: 'Paddle length for 6ft paddler?', sku: 'SB-PADDLE-004', orderNumber: null, email: 'devon@example.com', status: 'resolved', body: 'What length should a 6ft paddler set?', reply: 'Start around 80 inches and adjust from there.' },
  { id: 'T-108', days: 12, subject: 'Umbrella out of stock?', sku: 'SB-GEAR-009', orderNumber: null, email: 'ivy@example.com', status: 'resolved', body: 'The umbrella shows sold out — when is it back?', reply: 'Restock lands next week; we emailed when it returns.' },
  { id: 'T-109', days: 6, subject: 'Tote dimensions?', sku: 'SB-TOTE-005', orderNumber: null, email: 'frankie@example.com', status: 'open', body: 'What are the tote measurements? Not listed on the site.', reply: null },
  { id: 'T-110', days: 6, subject: 'Do you ship to Hawaii?', sku: null, orderNumber: null, email: 'blake@example.com', status: 'open', body: 'Need a board shipped to Oahu, is that possible?', reply: null },
  { id: 'T-111', days: 5, subject: 'Leash broke on first session', sku: 'SB-ACC-008', orderNumber: null, email: 'jordan@example.com', status: 'open', body: 'Leash snapped at the cuff on day one.', reply: null },
  { id: 'T-112', days: 5, subject: 'Tote care instructions?', sku: 'SB-TOTE-005', orderNumber: null, email: 'harper@example.com', status: 'open', body: 'How should I clean the seagrass tote?', reply: null },
  { id: 'T-113', days: 2, subject: 'Can I change my order address?', sku: null, orderNumber: 'SB-8026', status: 'pending', body: 'Moving next week, need to reroute my order.', reply: null, email: 'logan@example.com' },
];

/**
 * Pin scenario orders to known lines (the backfill RNG leaves these random)
 * and settle three October TidePay payouts. Pins re-apply deterministically;
 * payouts seed once. PO-1043 carries 14 charges including a duplicated $45
 * towel charge on SB-8014; PO-1044 lacks the $45 partial refund promised in
 * T-104; PO-1045 is clean.
 */
function seedPayouts(db: ReturnType<typeof getDb>): { payouts: number; paymentLines: number } {
  const pins: Array<{
    number: string;
    name?: string;
    email?: string;
    items: Array<[string, string, number, number]>;
  }> = [
    { number: 'SB-8014', name: 'Ellis Avery', email: 'ellis@example.com', items: [['SB-TOWEL-003', 'Côte Beach Towel', 1, 4500]] },
    { number: 'SB-8026', name: 'Logan Pike', email: 'logan@example.com', items: [['SB-PADDLE-004', 'Carbon SUP Paddle', 1, 12900], ['SB-ACC-008', 'Wax and Leash Kit', 1, 3400]] },
    { number: 'SB-8005', items: [['SB-TOWEL-003', 'Côte Beach Towel', 1, 4500]] },
    { number: 'SB-8010', items: [['SB-PADDLE-004', 'Carbon SUP Paddle', 1, 12900]] },
    { number: 'SB-8020', items: [["SB-BOARD-001", "Drift 8'0\" Foam Surfboard", 1, 34900]] },
    { number: 'SB-8006', items: [['SB-TOWEL-003', 'Côte Beach Towel', 1, 4500]] },
    { number: 'SB-8011', items: [['SB-PADDLE-004', 'Carbon SUP Paddle', 1, 12900]] },
    { number: 'SB-8021', items: [["SB-BOARD-001", "Drift 8'0\" Foam Surfboard", 1, 34900]] },
  ];
  for (const pin of pins) {
    const row = db.prepare('SELECT id FROM orders WHERE number = ?').get(pin.number) as { id: number } | undefined;
    if (!row) continue;
    if (pin.name && pin.email) db.prepare('UPDATE orders SET customer_name = ?, email = ? WHERE id = ?').run(pin.name, pin.email, row.id);
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(row.id);
    const put = db.prepare('INSERT INTO order_items (order_id, sku, title, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?)');
    for (const [sku, title, qty, price] of pin.items) put.run(row.id, sku, title, qty, price);
  }

  const existing = db.prepare('SELECT COUNT(*) AS c FROM payouts').get() as { c: number };
  if (Number(existing.c) > 0) return { payouts: 0, paymentLines: 0 };
  const putLine = db.prepare(
    'INSERT INTO payment_lines (payout_id, order_number, type, amount_cents, fee_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  let lines = 0;
  const charge = (payout: string, order: string, gross: number, day: string): void => {
    putLine.run(payout, order, 'charge', gross, tidepayFee(gross), `${day}T12:00:00.000Z`);
    lines += 1;
  };
  const p43: Array<[string, number, string]> = [
    ['SB-1000', 3400, '2026-10-01'],
    ['SB-1001', 4500, '2026-10-01'],
    ['SB-1001', 4500, '2026-10-02'],
    ['SB-1002', 20000, '2026-10-02'],
    ['SB-1002', 14900, '2026-10-03'],
    ['SB-1003', 12900, '2026-10-03'],
    ['SB-1003', 4500, '2026-10-04'],
    ['SB-1005', 4500, '2026-10-04'],
    ['SB-1006', 20000, '2026-10-05'],
    ['SB-1006', 14900, '2026-10-05'],
    ['SB-8014', 4500, '2026-10-06'],
    ['SB-8026', 12900, '2026-10-06'],
    ['SB-8026', 3400, '2026-10-06'],
    ['SB-8014', 4500, '2026-10-06'],
  ];
  for (const [order, gross, day] of p43) charge('PO-1043', order, gross, day);
  for (const [order, gross] of [['SB-8005', 4500], ['SB-8010', 12900], ['SB-8020', 34900]] as Array<[string, number]>) {
    charge('PO-1044', order, gross, '2026-10-12');
  }
  for (const [order, gross] of [['SB-8006', 4500], ['SB-8011', 12900], ['SB-8021', 34900]] as Array<[string, number]>) {
    charge('PO-1045', order, gross, '2026-10-19');
  }
  const putPayout = db.prepare('INSERT INTO payouts (id, arrives_at, gross_cents, fee_cents, net_cents) VALUES (?, ?, ?, ?, ?)');
  for (const [id, arrives] of [['PO-1043', '2026-10-07'], ['PO-1044', '2026-10-14'], ['PO-1045', '2026-10-21']]) {
    const sums = db.prepare(
      'SELECT COALESCE(SUM(amount_cents),0) AS g, COALESCE(SUM(fee_cents),0) AS f, COALESCE(SUM(amount_cents - fee_cents),0) AS n FROM payment_lines WHERE payout_id = ?'
    ).get(id) as { g: number; f: number; n: number };
    putPayout.run(id, arrives, sums.g, sums.f, sums.n);
  }
  return { payouts: 3, paymentLines: lines };
}

/**
 * Thirty days of business history: orders, tickets, stock movements, and
 * events. Gives Atlas real patterns (weekend spikes, repeat tote questions,
 * a refund request, overdue threads) instead of an empty past.
 */
function seedHistory(db: ReturnType<typeof getDb>, now: string, fixtures: Fixture[]): void {
  const rand = mulberry32(42);
  const live = fixtures.filter((f) => f.live);
  const putOrder = db.prepare('INSERT OR IGNORE INTO orders (number, customer_name, email, address, status, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const putItem = db.prepare('INSERT OR IGNORE INTO order_items (order_id, sku, title, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?)');
  const putHistory = db.prepare('INSERT INTO stock_history (sku, delta, reason, created_at) VALUES (?, ?, ?, ?)');
  const putEvent = db.prepare('INSERT INTO events (type, entity, entity_id, data, created_at) VALUES (?, ?, ?, ?, ?)');
  const putCustomer = db.prepare('INSERT OR IGNORE INTO customers (name, email, created_at) VALUES (?, ?, ?)');

  for (let i = 0; i < 28; i++) {
    const number = `SB-${8001 + i}`;
    const customer = BACKFILL_CUSTOMERS[Math.floor(rand() * BACKFILL_CUSTOMERS.length)];
    const day = 1 + Math.floor(rand() * 30);
    const stamp = daysAgo(day);
    const r = putOrder.run(number, customer[0], customer[1], customer[2], 'fulfilled', stamp);
    if (Number(r.changes) === 0) continue;
    putCustomer.run(customer[0], customer[1], stamp);
    const row = db.prepare('SELECT id FROM orders WHERE number = ?').get(number) as { id: number };
    const lineCount = rand() < 0.75 ? 1 : 2;
    for (let l = 0; l < lineCount; l++) {
      const f = live[Math.floor(rand() * live.length)];
      const qty = rand() < 0.85 ? 1 : 2;
      putItem.run(row.id, f.sku, f.title, qty, f.priceCents);
      putHistory.run(f.sku, -qty, `order ${number}`, stamp);
    }
    putEvent.run('order_placed', 'order', String(row.id), JSON.stringify({ number, backfill: true }), stamp);
  }
  void now;

  const putTicket = db.prepare('INSERT OR IGNORE INTO tickets (id, subject, sku, order_number, customer_email, status, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const putReply = db.prepare('INSERT INTO ticket_replies (ticket_id, body, created_at) VALUES (?, ?, ?)');
  for (const t of BACKFILL_TICKETS) {
    const stamp = daysAgo(t.days);
    const r = putTicket.run(t.id, t.subject, t.sku, t.orderNumber, t.email, t.status, t.body, stamp);
    if (Number(r.changes) > 0) {
      putEvent.run('ticket_opened', 'ticket', t.id, JSON.stringify({ subject: t.subject }), stamp);
      if (t.reply) putReply.run(t.id, t.reply, stamp);
    }
  }
}

function imageRef(sku: string): string {
  return `fixtures/saltbreak/${sku}/photo-1.jpg`;
}

function publicImage(sku: string): string {
  return `/fixtures/saltbreak/${sku}/photo-1.jpg`;
}

/** Load Saltbreak's synthetic business data. Idempotent: existing rows are kept. */
export function seed(): Record<string, number> {
  const db = getDb();
  const now = new Date().toISOString();
  const counts: Record<string, number> = { sources: 0, drafts: 0, products: 0, inventory: 0, orders: 0, tickets: 0 };

  const putSource = db.prepare(
    'INSERT OR IGNORE INTO sources (id, version, kind, content_hash, data, file_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const putDraft = db.prepare(
    `INSERT OR IGNORE INTO drafts (sku, title, category, material, color, dimensions_value, dimensions_unit, description, price_cents, primary_image, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
  );
  const putProduct = db.prepare(
    `INSERT OR IGNORE INTO products (sku, title, category, material, color, dimensions_value, dimensions_unit, description, price_cents, primary_image, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const putInventory = db.prepare('INSERT OR IGNORE INTO inventory (sku, on_hand, updated_at) VALUES (?, ?, ?)');
  const putHistory = db.prepare('INSERT INTO stock_history (sku, delta, reason, created_at) VALUES (?, ?, ?, ?)');

  for (const f of FIXTURES) {
    const facts = JSON.stringify({
      synthetic: true,
      sku: f.sku,
      title: f.title,
      category: f.category,
      material: f.material,
      color: f.color,
      dimensionsValue: f.dimensionsValue,
      dimensionsUnit: f.dimensionsUnit,
      description: f.description,
      priceCents: f.priceCents,
    });
    const manifest = JSON.stringify({ sku: f.sku, approvedImageRef: imageRef(f.sku) });
    const rows: Array<[string, string, string, string | null]> = [
      [`${f.sku}:facts`, 'product_facts', facts, null],
      [`${f.sku}:spec`, 'spec_doc', f.spec, null],
      [`${f.sku}:manifest`, 'manifest', manifest, imageRef(f.sku)],
    ];
    for (const [id, kind, data, fileRef] of rows) {
      const r = putSource.run(id, 1, kind, hash(data), data, fileRef, now);
      counts.sources += Number(r.changes);
    }
    if (f.live) {
      const r = putProduct.run(f.sku, f.title, f.category, f.material, f.color, f.dimensionsValue, f.dimensionsUnit, f.description, f.priceCents, publicImage(f.sku), 'live', now);
      counts.products += Number(r.changes);
      const s = putInventory.run(f.sku, f.stock, now);
      counts.inventory += Number(s.changes);
      if (Number(s.changes) > 0 && f.stock > 0) putHistory.run(f.sku, f.stock, 'opening stock', now);
    } else if (f.sku === 'SB-BOARD-002' || f.sku === 'SB-TOTE-005') {
      const r = putDraft.run(f.sku, f.title, f.category, f.material, f.color, f.dimensionsValue, f.dimensionsUnit, f.description, f.priceCents, publicImage(f.sku), now);
      counts.drafts += Number(r.changes);
    }
  }

  const putOrder = db.prepare(
    'INSERT OR IGNORE INTO orders (number, customer_name, email, address, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const putItem = db.prepare(
    'INSERT OR IGNORE INTO order_items (order_id, sku, title, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?)',
  );
  const seededOrders: Array<{ number: string; name: string; email: string; address: string; status: string; items: Array<[string, string, number, number]> }> = [
    {
      number: 'SB-1001', name: 'Maya Rios', email: 'maya@example.com', address: '14 Dune Ln, Montauk NY', status: 'fulfilled',
      items: [['SB-TOWEL-003', 'Côte Beach Towel', 2, 4500]],
    },
    {
      number: 'SB-1002', name: 'Tom Okafor', email: 'tom@example.com', address: '88 Breaker Ave, Santa Cruz CA', status: 'packing',
      items: [["SB-BOARD-001", "Drift 8'0\" Foam Surfboard", 1, 34900]],
    },
    {
      number: 'SB-1003', name: 'June Park', email: 'june@example.com', address: '7 Pelican St, Charleston SC', status: 'packing',
      items: [['SB-PADDLE-004', 'Carbon SUP Paddle', 1, 12900], ['SB-TOWEL-003', 'Côte Beach Towel', 1, 4500]],
    },
    {
      number: 'SB-1005', name: 'Maya Rios', email: 'maya@example.com', address: '14 Dune Ln, Montauk NY', status: 'fulfilled',
      items: [['SB-TOWEL-003', 'Côte Beach Towel', 1, 4500]],
    },
    {
      number: 'SB-1006', name: 'June Park', email: 'june@example.com', address: '7 Pelican St, Charleston SC', status: 'fulfilled',
      items: [["SB-BOARD-001", "Drift 8'0\" Foam Surfboard", 1, 34900]],
    },
  ];
  for (const o of seededOrders) {
    const r = putOrder.run(o.number, o.name, o.email, o.address, o.status, now);
    counts.orders += Number(r.changes);
    const row = db.prepare('SELECT id FROM orders WHERE number = ?').get(o.number) as { id: number };
    for (const [sku, title, qty, price] of o.items) putItem.run(row.id, sku, title, qty, price);
    if (Number(r.changes) > 0) {
      for (const [sku, , qty] of o.items) putHistory.run(sku, -qty, `order ${o.number}`, now);
    }
  }

  // One lapsed buyer: a fulfilled order from 120 days ago.
  const oldDate = new Date(Date.now() - 120 * 86400000).toISOString();
  const oldOrder = putOrder.run('SB-1000', 'Pat Riley', 'pat@example.com', '3 Harbor Rd, Portland ME', 'fulfilled', oldDate);
  counts.orders += Number(oldOrder.changes);
  if (Number(oldOrder.changes) > 0) {
    const row = db.prepare('SELECT id FROM orders WHERE number = ?').get('SB-1000') as { id: number };
    putItem.run(row.id, 'SB-ACC-008', 'Wax and Leash Kit', 1, 3400);
    putHistory.run('SB-ACC-008', -1, 'order SB-1000', oldDate);
  }

  const putPromo = db.prepare('INSERT OR IGNORE INTO promos (id, code, label, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)');
  putPromo.run('PROMO-1', 'SUMMER20', 'Summer sale: 20% off beach gear', daysAgo(40), daysAgo(5));
  putPromo.run('PROMO-2', 'HARBOR10', 'Harbor days: 10% off everything', daysAgo(3), daysAgo(-11));

  seedHistory(db, now, FIXTURES);

  // Databases seeded before the volume fact keep working: patch the one description.
  db.prepare('UPDATE products SET description = ? WHERE sku = ? AND description = ?').run(
    'Stable foam longboard for beginners and small days. Volume approx 80 L — floats riders up to about 200 lb.',
    'SB-BOARD-001',
    'Stable foam longboard for beginners and small days.'
  );

  const payoutCounts = seedPayouts(db);
  counts.payouts = payoutCounts.payouts;
  counts.paymentLines = payoutCounts.paymentLines;

  const putCustomer = db.prepare('INSERT OR IGNORE INTO customers (name, email, created_at) VALUES (?, ?, ?)');
  for (const c of [
    ['Maya Rios', 'maya@example.com'],
    ['Tom Okafor', 'tom@example.com'],
    ['June Park', 'june@example.com'],
    ['Pat Riley', 'pat@example.com'],
  ] as Array<[string, string]>) {
    putCustomer.run(c[0], c[1], now);
  }

  const putEvent = db.prepare('INSERT INTO events (type, entity, entity_id, data, created_at) VALUES (?, ?, ?, ?, ?)');
  const eventCount = db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number };
  if (Number(eventCount.c) === 0) {
    const orderRows = db.prepare('SELECT id, number FROM orders ORDER BY id').all() as Array<{ id: number; number: string }>;
    for (const o of orderRows) {
      putEvent.run('order_placed', 'order', String(o.id), JSON.stringify({ number: o.number }), now);
    }
  }

  const putTicket = db.prepare('INSERT OR IGNORE INTO tickets (id, subject, sku, order_number, customer_email, status, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const t of TICKETS) {
    const r = putTicket.run(t.id, t.subject, t.sku, t.orderNumber, t.customerEmail, t.status, t.body, now);
    counts.tickets += Number(r.changes);
  }
  const replyCount = db.prepare('SELECT COUNT(*) AS c FROM ticket_replies').get() as { c: number };
  if (Number(replyCount.c) === 0) {
    db.prepare('INSERT INTO ticket_replies (ticket_id, body, created_at) VALUES (?, ?, ?)')
      .run('T-102', 'Warehouse confirms the board ships today; tracking follows by email.', now);
  }

  return counts;
}
