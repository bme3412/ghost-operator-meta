import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from './schema';

/** Repo root for file storage. Exported for upload handling. */
export function repoRoot(): string | null {
  return findRepoRoot(process.cwd()) ?? findRepoRoot(fs.realpathSync(__dirname));
}

/** Walk up to the monorepo root. Immune to bundlers rewriting __dirname. */
function findRepoRoot(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** Saltbreak's database. Zero-config local default; override with SALTBREAK_DB_PATH. */
export function resolveDbPath(): string {
  if (process.env.SALTBREAK_DB_PATH) return path.resolve(process.env.SALTBREAK_DB_PATH);
  const root = repoRoot();
  if (root) return path.join(root, 'data', 'saltbreak.db');
  return path.resolve(fs.realpathSync(__dirname), '..', '..', '..', 'data', 'saltbreak.db');
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = resolveDbPath();
  const isNew = !fs.existsSync(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (isNew) console.warn(`[saltbreak/data] creating new database at ${file}`);
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  if (isNew) db.exec(SCHEMA_SQL);
  return db;
}

export function migrate(): void {
  const db = getDb();
  db.exec(SCHEMA_SQL);
  ensureColumn(db, 'tickets', 'order_number', 'TEXT');
  ensureColumn(db, 'tickets', 'customer_email', 'TEXT');
}

function ensureColumn(db: DatabaseSync, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function closeDb(): void {
  db?.close();
  db = null;
}
