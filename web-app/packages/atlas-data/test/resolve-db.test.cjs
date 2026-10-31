// Regression test: the database path must not depend on where the module file
// lives. Bundlers (Next dev) relocate or re-resolve modules, which once sent
// the app to apps/atlas/data/atlas.db — a fresh empty file ("no such table").
// Run with: pnpm test (from this package; builds dist/ first via pretest).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pkgDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgDir, '..', '..');
const expected = path.join(repoRoot, 'data', 'atlas.db');
const dbModule = path.join(pkgDir, 'dist', 'db.js');

function resolveFrom(cwd, modulePath, extraEnv = {}) {
  const script = `console.log(require(${JSON.stringify(modulePath)}).resolveDbPath())`;
  const r = spawnSync(process.execPath, ['-e', script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
  assert.equal(r.status, 0, `child failed: ${r.stderr}`);
  return r.stdout.trim();
}

describe('resolveDbPath', () => {
  it('points at the repo database from the package directory', () => {
    assert.equal(resolveFrom(pkgDir, dbModule), expected);
  });

  it('points at the repo database from an app directory (Next dev cwd)', () => {
    assert.equal(resolveFrom(path.join(repoRoot, 'apps', 'atlas'), dbModule), expected);
  });

  it('ignores module relocation (bundlers rewriting module paths)', () => {
    const nest = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-relocated-'));
    const deep = path.join(nest, 'apps', 'atlas', 'data');
    fs.mkdirSync(deep, { recursive: true });
    for (const f of ['db.js', 'schema.js']) fs.copyFileSync(path.join(pkgDir, 'dist', f), path.join(deep, f));
    try {
      assert.equal(resolveFrom(repoRoot, path.join(deep, 'db.js')), expected);
    } finally {
      fs.rmSync(nest, { recursive: true, force: true });
    }
  });

  it('honors ATLAS_DB_PATH', () => {
    const custom = path.join(os.tmpdir(), `atlas-custom-${process.pid}.db`);
    assert.equal(resolveFrom(repoRoot, dbModule, { ATLAS_DB_PATH: custom }), custom);
  });

  it('creates schema in a fresh file (never "no such table")', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-fresh-'));
    const tmp = path.join(dir, 'fresh.db');
    const script = `
      const m = require(${JSON.stringify(path.join(pkgDir, 'dist', 'index.js'))});
      const db = m.getDb();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
      if (!tables.includes('functions') || !tables.includes('tasks')) throw new Error('missing tables: ' + tables.join(','));
      m.closeDb();
      console.log('tables ok');
    `;
    try {
      const r = spawnSync(process.execPath, ['-e', script], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, ATLAS_DB_PATH: tmp },
      });
      assert.equal(r.status, 0, `child failed: ${r.stderr}`);
      assert.match(r.stdout, /tables ok/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
