import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from './schema';

/** Repo root for locating the Saltbreak database (read-only evidence). */
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

/** Atlas's database. Zero-config local default; override with ATLAS_DB_PATH. */
export function resolveDbPath(): string {
  if (process.env.ATLAS_DB_PATH) return path.resolve(process.env.ATLAS_DB_PATH);
  const root = repoRoot();
  if (root) return path.join(root, 'data', 'atlas.db');
  return path.resolve(fs.realpathSync(__dirname), '..', '..', '..', 'data', 'atlas.db');
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = resolveDbPath();
  const isNew = !fs.existsSync(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (isNew) console.warn(`[atlas/data] creating new database at ${file}`);
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  if (isNew) db.exec(SCHEMA_SQL);
  return db;
}

export function migrate(): void {
  const db = getDb();
  db.exec(SCHEMA_SQL);
  const cols = db.prepare('PRAGMA table_info(opportunities)').all() as Array<{ name: string }>;
  if (cols.length > 0 && !cols.some((c) => c.name === 'title')) {
    db.exec('DROP TABLE opportunities');
    db.exec(SCHEMA_SQL);
  }
}

export function closeDb(): void {
  db?.close();
  db = null;
}
