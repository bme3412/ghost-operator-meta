'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCellAction } from '../../actions';

interface GridCell {
  ref: string;
  raw: string;
}

function parseRef(ref: string): [number, number] | null {
  const m = /^([A-Za-z]+)([0-9]+)$/.exec(ref.trim());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [col - 1, Number(m[2]) - 1];
}

function refOf(col: number, row: number): string {
  let n = col + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return `${out}${row + 1}`;
}

function formatValue(value: number | string | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function BooksGrid({
  sheetId,
  cells,
  values,
}: {
  sheetId: number;
  cells: GridCell[];
  values: Record<string, number | string>;
}) {
  const router = useRouter();
  const [matchFilter, setMatchFilter] = useState('');
  const rawByRef = new Map(cells.map((c) => [c.ref.toUpperCase(), c.raw]));
  let maxCol = 0;
  let maxRow = 0;
  for (const ref of rawByRef.keys()) {
    const parsed = parseRef(ref);
    if (parsed) {
      maxCol = Math.max(maxCol, parsed[0]);
      maxRow = Math.max(maxRow, parsed[1]);
    }
  }
  const rows: number[] = [];
  for (let r = 0; r <= maxRow; r += 1) rows.push(r);
  const cols: number[] = [];
  for (let c = 0; c <= maxCol; c += 1) cols.push(c);

  // Change commits immediately (programmatic fills dispatch change, never
  // blur, and Ghost moves on without waiting); only blur refreshes, so typing
  // never loses focus to a re-render.
  function commit(ref: string, raw: string, refresh: boolean): void {
    if (rawByRef.get(ref) === raw) {
      if (refresh) router.refresh();
      return;
    }
    void saveCellAction(sheetId, ref, raw).then(() => {
      if (refresh) router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <label htmlFor="match-filter" className="text-xs text-neutral-500">
          Match
        </label>
        <select
          id="match-filter"
          data-semid="match-filter"
          value={matchFilter}
          onChange={(e) => setMatchFilter(e.target.value)}
          className="border border-neutral-300 px-2 py-1 text-xs"
        >
          <option value="">All</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </div>
      <table className="border border-neutral-200 text-sm">
        <tbody>
          {rows.map((r) => {
            const matchValue = values[refOf(7, r)];
            const isVerdictRow = matchValue === 'Yes' || matchValue === 'No';
            if (matchFilter && isVerdictRow && matchValue !== matchFilter) return null;
            const isTotals = rawByRef.get(refOf(0, r)) === 'TOTALS';
            return (
              <tr key={r} className={isTotals ? 'sticky bottom-0 bg-white font-medium' : undefined}>
                {cols.map((c) => {
                  const ref = refOf(c, r);
                  const raw = rawByRef.get(ref) ?? '';
                  const computed = values[ref];
                  const isFormula = raw.startsWith('=');
                  return (
                    <td key={ref} className="border border-neutral-200 px-1 py-0.5 align-top">
                      <input
                        defaultValue={raw}
                        key={`${ref}:${raw}`}
                        onChange={(e) => commit(ref, e.target.value, false)}
                        onBlur={(e) => commit(ref, e.target.value, true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        data-semid={`cell-${ref}`}
                        aria-label={`Cell ${ref}`}
                        className="w-28 bg-transparent px-1 py-0.5 text-xs text-neutral-800"
                      />
                      {isFormula ? (
                        <div data-semid={`cell-value-${ref}`} className="px-1 text-sm font-medium">
                          {formatValue(computed)}
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
