import Link from 'next/link';
import { listSheets } from '@saltbreak/data';
import { Shell } from '../../shell';
import { importCsvAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function BooksPage() {
  const sheets = listSheets();
  return (
    <Shell title="Books" blurb="Reconciliation sheets. Send a payout here from Payments, or import a TidePay CSV.">
      <form action={importCsvAction} className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="name"
          placeholder="Sheet name"
          defaultValue="Imported payout"
          className="border border-neutral-300 px-2 py-1.5 text-sm"
          aria-label="Sheet name"
          data-semid="import-csv-name"
        />
        <input type="file" name="file" accept=".csv,text/csv" className="text-sm" aria-label="CSV file" data-semid="import-csv-file" />
        <button type="submit" data-semid="import-csv-submit" className="border border-neutral-300 px-4 py-1.5 text-sm">
          Import CSV
        </button>
      </form>
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {sheets.map((s) => (
          <li key={s.id} data-semid={`sheet-row-${s.id}`} className="py-3">
            <Link href={`/staff/books/${s.id}`} className="text-sm font-medium text-teal-800 hover:underline">
              {s.name}
            </Link>
            <span className="ml-4 text-xs text-neutral-500">created {s.createdAt.slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
