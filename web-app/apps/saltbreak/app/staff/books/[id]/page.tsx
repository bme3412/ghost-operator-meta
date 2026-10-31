import { notFound } from 'next/navigation';
import { evaluateSheet, getSheet } from '@saltbreak/data';
import { Shell } from '../../../shell';
import { BooksGrid } from './books-grid';

export const dynamic = 'force-dynamic';

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sheet = getSheet(Number(id));
  if (!sheet) notFound();
  const values = Object.fromEntries(evaluateSheet(sheet.id).entries());
  return (
    <Shell title={sheet.name} blurb="Formulas evaluate on read. Edit any cell; Match compares each row's gross to its order total.">
      <BooksGrid sheetId={sheet.id} cells={sheet.cells} values={values as Record<string, number | string>} />
    </Shell>
  );
}
