import { getDb } from './db';
import { num, str, type Row } from './catalog';

/**
 * Tiny spreadsheet engine for Books reconciliation sheets. Formulas support
 * numbers, strings, cell refs (B4), ranges (D3:D9, D:D), arithmetic with
 * precedence, comparisons, SUM, IF, and one lookup: ORDERTOTAL("SB-8014")
 * sums that order's lines in dollars. Anything else degrades to an error
 * string; evaluation never throws.
 */

export type CellValue = number | string;

export const ERR_DIV0 = '#DIV/0!';
export const ERR_VALUE = '#VALUE!';
export const ERR_REF = '#REF!';
export const ERR_CIRC = '#CIRC!';

/** Column letters to a 0-based index (A -> 0, Z -> 25, AA -> 26). */
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 0-based column index back to letters. */
export function colLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function refOf(col: number, row: number): string {
  return `${colLetters(col)}${row + 1}`;
}

/** Parse "B4" into 0-based [col, row]; null when malformed. */
export function parseRef(ref: string): [number, number] | null {
  const m = /^([A-Za-z]+)([0-9]+)$/.exec(ref.trim());
  if (!m) return null;
  const row = Number(m[2]);
  if (row < 1) return null;
  return [colIndex(m[1]), row - 1];
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ref'; col: number; row: number }
  | { kind: 'col'; col: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: string };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const fail = (): null => null;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || (ch === '.' && input[i + 1] >= '0' && input[i + 1] <= '9')) {
      const m = /^[0-9]*\.?[0-9]+/.exec(input.slice(i));
      if (!m) return fail();
      tokens.push({ kind: 'num', value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === '"') {
      const end = input.indexOf('"', i + 1);
      if (end < 0) return fail();
      tokens.push({ kind: 'str', value: input.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      const m = /^[A-Za-z]+/.exec(input.slice(i));
      if (!m) return fail();
      const word = m[0];
      i += word.length;
      const digits = /^[0-9]+/.exec(input.slice(i));
      if (digits) {
        const row = Number(digits[0]);
        if (row < 1) return fail();
        tokens.push({ kind: 'ref', col: colIndex(word), row: row - 1 });
        i += digits[0].length;
      } else if (input[i] === ':' || lastTokenIsColon(tokens)) {
        // Whole-column half of a range (either side of the colon).
        tokens.push({ kind: 'col', col: colIndex(word) });
      } else {
        tokens.push({ kind: 'ident', name: word.toUpperCase() });
      }
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ kind: 'op', op: two });
      i += 2;
      continue;
    }
    if ('+-*/(),=<>'.includes(ch) || ch === ':') {
      tokens.push({ kind: 'op', op: ch });
      i += 1;
      continue;
    }
    return fail();
  }
  return tokens;
}

function lastTokenIsColon(tokens: Token[]): boolean {
  const last = tokens[tokens.length - 1];
  return last?.kind === 'op' && last.op === ':';
}

export interface EvalContext {
  /** Evaluated value of another cell; error strings propagate. */
  getCell: (col: number, row: number) => CellValue;
  /** Row bounds of the sheet, for whole-column ranges. */
  rowCount: number;
  /** Order total in dollars; 0 when the order is unknown. */
  orderTotal: (orderNumber: string) => number;
}

function isError(v: CellValue): boolean {
  return typeof v === 'string' && v.startsWith('#');
}

function toNumber(v: CellValue): number | null {
  if (typeof v === 'number') return v;
  if (v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function truthy(v: CellValue): boolean {
  if (typeof v === 'number') return v !== 0;
  return v.trim().length > 0;
}

/** All refs in a range (inclusive). Whole columns span the sheet rows. */
function expandRange(
  start: { col: number; row: number },
  end: { col: number; row: number } | { col: number },
  rowCount: number
): Array<[number, number]> {
  const endCol = end.col;
  const endRow = 'row' in end ? end.row : rowCount - 1;
  const out: Array<[number, number]> = [];
  for (let r = Math.min(start.row, endRow); r <= Math.max(start.row, endRow); r += 1) {
    for (let c = Math.min(start.col, endCol); c <= Math.max(start.col, endCol); c += 1) {
      out.push([c, r]);
    }
  }
  return out;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly ctx: EvalContext
  ) {}

  parse(): CellValue {
    const value = this.comparison();
    if (this.pos < this.tokens.length) return ERR_VALUE;
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eat(op: string): boolean {
    const t = this.peek();
    if (t?.kind === 'op' && t.op === op) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  private comparison(): CellValue {
    let left = this.addSub();
    const t = this.peek();
    if (t?.kind === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.op)) {
      this.pos += 1;
      const right = this.addSub();
      return compare(left, t.op, right);
    }
    return left;
  }

  private addSub(): CellValue {
    let left = this.mulDiv();
    for (;;) {
      if (this.eat('+') || this.eat('-')) {
        const op = this.tokens[this.pos - 1] as { op: string };
        const right = this.mulDiv();
        left = arithmetic(left, op.op, right);
      } else {
        return left;
      }
    }
  }

  private mulDiv(): CellValue {
    let left = this.unary();
    for (;;) {
      if (this.eat('*') || this.eat('/')) {
        const op = this.tokens[this.pos - 1] as { op: string };
        const right = this.unary();
        left = arithmetic(left, op.op, right);
      } else {
        return left;
      }
    }
  }

  private unary(): CellValue {
    if (this.eat('-')) {
      const v = this.unary();
      const n = typeof v === 'number' ? v : toNumber(v);
      if (typeof v === 'string' && isError(v)) return v;
      if (n === null) return ERR_VALUE;
      return -n;
    }
    return this.primary();
  }

  private primary(): CellValue {
    const t = this.peek();
    if (!t) return ERR_VALUE;
    if (t.kind === 'num') {
      this.pos += 1;
      return t.value;
    }
    if (t.kind === 'str') {
      this.pos += 1;
      return t.value;
    }
    if (t.kind === 'ref') {
      this.pos += 1;
      if (this.eat(':')) {
        // A bare range outside SUM is meaningless; consume and fail soft.
        const end = this.peek();
        if (end?.kind === 'ref') this.pos += 1;
        else if (end?.kind === 'col') this.pos += 1;
        return ERR_VALUE;
      }
      return this.ctx.getCell(t.col, t.row);
    }
    if (t.kind === 'ident') {
      this.pos += 1;
      return this.call(t.name);
    }
    if (t.kind === 'op' && t.op === '(') {
      this.pos += 1;
      const v = this.comparison();
      if (!this.eat(')')) return ERR_VALUE;
      return v;
    }
    return ERR_VALUE;
  }

  private call(name: string): CellValue {
    if (!this.eat('(')) return ERR_VALUE;
    if (name === 'SUM') {
      let total = 0;
      for (;;) {
        const t = this.peek();
        if (t?.kind === 'op' && t.op === ')') {
          this.pos += 1;
          return total;
        }
        if (t?.kind === 'ref') {
          this.pos += 1;
          if (this.eat(':')) {
            const end = this.peek();
            if (end?.kind !== 'ref' && end?.kind !== 'col') return ERR_VALUE;
            this.pos += 1;
            for (const [c, r] of expandRange({ col: t.col, row: t.row }, end, this.ctx.rowCount)) {
              const v = this.ctx.getCell(c, r);
              if (typeof v === 'string' && isError(v)) return v;
              const n = toNumber(v);
              if (n !== null) total += n;
            }
          } else {
            const v = this.ctx.getCell(t.col, t.row);
            if (typeof v === 'string' && isError(v)) return v;
            const n = toNumber(v);
            if (n !== null) total += n;
          }
        } else if (t?.kind === 'col') {
          this.pos += 1;
          if (!this.eat(':')) return ERR_VALUE;
          const end = this.peek();
          if (end?.kind !== 'col') return ERR_VALUE;
          this.pos += 1;
          for (const [c, r] of expandRange({ col: t.col, row: 0 }, end, this.ctx.rowCount)) {
            const v = this.ctx.getCell(c, r);
            if (typeof v === 'string' && isError(v)) return v;
            const n = toNumber(v);
            if (n !== null) total += n;
          }
        } else {
          const v = this.comparison();
          if (typeof v === 'string' && isError(v)) return v;
          const n = toNumber(v);
          if (n !== null) total += n;
        }
        if (this.eat(',')) continue;
        if (this.eat(')')) return total;
        return ERR_VALUE;
      }
    }
    if (name === 'IF') {
      const cond = this.comparison();
      if (!this.eat(',')) return ERR_VALUE;
      const yes = this.comparison();
      if (!this.eat(',')) return ERR_VALUE;
      const no = this.comparison();
      if (!this.eat(')')) return ERR_VALUE;
      if (typeof cond === 'string' && isError(cond)) return cond;
      return truthy(cond) ? yes : no;
    }
    if (name === 'ORDERTOTAL') {
      const arg = this.comparison();
      if (!this.eat(')')) return ERR_VALUE;
      if (typeof arg === 'string' && isError(arg)) return arg;
      return this.ctx.orderTotal(String(arg));
    }
    return ERR_VALUE;
  }
}

function arithmetic(left: CellValue, op: string, right: CellValue): CellValue {
  if (typeof left === 'string' && isError(left)) return left;
  if (typeof right === 'string' && isError(right)) return right;
  const a = toNumber(left);
  const b = toNumber(right);
  if (a === null || b === null) return ERR_VALUE;
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (b === 0) return ERR_DIV0;
  return a / b;
}

function compare(left: CellValue, op: string, right: CellValue): CellValue {
  if (typeof left === 'string' && isError(left)) return left;
  if (typeof right === 'string' && isError(right)) return right;
  const a = toNumber(left);
  const b = toNumber(right);
  const eq =
    a !== null && b !== null
      ? Math.abs(a - b) < 1e-9
      : String(left).toLowerCase() === String(right).toLowerCase();
  switch (op) {
    case '=':
      return eq ? 1 : 0;
    case '<>':
      return eq ? 0 : 1;
    case '<':
      return a !== null && b !== null ? (a < b ? 1 : 0) : 0;
    case '>':
      return a !== null && b !== null ? (a > b ? 1 : 0) : 0;
    case '<=':
      return a !== null && b !== null ? (a <= b ? 1 : 0) : 0;
    case '>=':
      return a !== null && b !== null ? (a >= b ? 1 : 0) : 0;
    default:
      return ERR_VALUE;
  }
}

/**
 * Evaluate one formula body (without the leading `=`). Pure; unknown
 * functions, bad syntax, and bad refs degrade to error strings.
 */
export function evaluateFormula(body: string, ctx: EvalContext): CellValue {
  const tokens = tokenize(body);
  if (!tokens) return ERR_VALUE;
  try {
    return new Parser(tokens, ctx).parse();
  } catch {
    return ERR_VALUE;
  }
}

export interface SheetCell {
  ref: string;
  raw: string;
}

export interface Sheet {
  id: number;
  name: string;
  createdAt: string;
  cells: SheetCell[];
}

export function listSheets(): Array<{ id: number; name: string; createdAt: string }> {
  const rows = getDb().prepare('SELECT * FROM sheets ORDER BY id').all() as Row[];
  return rows.map((row) => ({ id: num(row.id), name: str(row.name), createdAt: str(row.created_at) }));
}

export function listCells(sheetId: number): SheetCell[] {
  const rows = getDb()
    .prepare('SELECT ref, raw FROM sheet_cells WHERE sheet_id = ?')
    .all(sheetId) as Row[];
  return rows.map((row) => ({ ref: str(row.ref).toUpperCase(), raw: str(row.raw) }));
}

export function getSheet(id: number): Sheet | null {
  const row = getDb().prepare('SELECT * FROM sheets WHERE id = ?').get(id) as Row | undefined;
  if (!row) return null;
  return { id: num(row.id), name: str(row.name), createdAt: str(row.created_at), cells: listCells(id) };
}

export function getSheetByName(name: string): Sheet | null {
  const row = getDb().prepare('SELECT * FROM sheets WHERE name = ?').get(name) as Row | undefined;
  if (!row) return null;
  return {
    id: num(row.id),
    name: str(row.name),
    createdAt: str(row.created_at),
    cells: listCells(num(row.id)),
  };
}

/** Create a sheet (or return the existing one with that name). Does not touch cells. */
export function createSheet(name: string): number {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO sheets (name, created_at) VALUES (?, ?)').run(
    name,
    new Date().toISOString()
  );
  const row = db.prepare('SELECT id FROM sheets WHERE name = ?').get(name) as { id: number };
  return num(row.id);
}

/** Replace every cell in a sheet. All-or-nothing. */
export function setCells(sheetId: number, cells: SheetCell[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM sheet_cells WHERE sheet_id = ?').run(sheetId);
    const put = db.prepare('INSERT INTO sheet_cells (sheet_id, ref, raw, created_at) VALUES (?, ?, ?, ?)');
    for (const cell of cells) put.run(sheetId, cell.ref.toUpperCase(), cell.raw, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Upsert one cell (grid edits, appended rows). */
export function setCell(sheetId: number, ref: string, raw: string): void {
  getDb()
    .prepare(
      'INSERT INTO sheet_cells (sheet_id, ref, raw, created_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT (sheet_id, ref) DO UPDATE SET raw = excluded.raw'
    )
    .run(sheetId, ref.toUpperCase(), raw, new Date().toISOString());
}

/** Highest 1-based row with a cell, or 0 when the sheet is empty. */
export function maxRow(sheetId: number): number {
  let max = 0;
  for (const cell of listCells(sheetId)) {
    const parsed = parseRef(cell.ref);
    if (parsed && parsed[1] + 1 > max) max = parsed[1] + 1;
  }
  return max;
}

/** Order total in dollars; unknown orders total zero so mismatches stay visible. */
export function orderTotalDollars(orderNumber: string): number {
  const row = getDb().prepare('SELECT id FROM orders WHERE number = ?').get(orderNumber) as
    | { id: number }
    | undefined;
  if (!row) return 0;
  const lines = getDb().prepare('SELECT qty, unit_price_cents FROM order_items WHERE order_id = ?').all(
    num(row.id)
  ) as Row[];
  return lines.reduce((sum, line) => sum + num(line.qty) * num(line.unit_price_cents), 0) / 100;
}

/**
 * Evaluate every cell in a sheet. Returns computed values by ref; formulas
 * degrade to error strings, circular refs to #CIRC!. Never throws.
 */
export function evaluateSheet(sheetId: number): Map<string, CellValue> {
  const cells = new Map<string, string>();
  for (const cell of listCells(sheetId)) cells.set(cell.ref, cell.raw);
  const memo = new Map<string, CellValue>();
  const stack = new Set<string>();
  const rowCount =
    Math.max(0, ...[...cells.keys()].map((ref) => parseRef(ref)?.[1] ?? 0)) + 1;

  const getCell = (col: number, row: number): CellValue => {
    const ref = refOf(col, row);
    const raw = cells.get(ref);
    if (raw === undefined) return '';
    if (!raw.startsWith('=')) {
      if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
      return raw;
    }
    if (memo.has(ref)) return memo.get(ref) as CellValue;
    if (stack.has(ref)) return ERR_CIRC;
    stack.add(ref);
    const value = evaluateFormula(raw.slice(1), {
      getCell,
      rowCount,
      orderTotal: orderTotalDollars,
    });
    stack.delete(ref);
    memo.set(ref, value);
    return value;
  };

  const out = new Map<string, CellValue>();
  for (const ref of cells.keys()) {
    const parsed = parseRef(ref);
    out.set(ref, parsed ? getCell(parsed[0], parsed[1]) : ERR_REF);
  }
  return out;
}
