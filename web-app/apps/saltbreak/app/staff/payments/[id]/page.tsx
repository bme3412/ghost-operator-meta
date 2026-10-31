import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice, getPayout, payoutCsv } from '@saltbreak/data';
import { Shell } from '../../../shell';
import { refundLineAction, sendToBooksAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function PayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payout = getPayout(id);
  if (!payout) notFound();
  const csv = payoutCsv(id) ?? '';
  const refunded = new Set(
    payout.lines.filter((l) => l.type === 'refund').map((l) => `${l.orderNumber}:${-l.amountCents}`)
  );
  return (
    <Shell
      title={`Payout ${payout.id}`}
      blurb={`Arrives ${payout.arrivesAt.slice(0, 10)} · gross ${formatPrice(payout.grossCents)} · fees ${formatPrice(payout.feeCents)} · net ${formatPrice(payout.netCents)}.`}
    >
      <div className="mb-4 flex gap-2">
        <form action={sendToBooksAction}>
          <input type="hidden" name="payout" value={payout.id} />
          <button type="submit" data-semid="send-books" className="bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white">
            Send to Books
          </button>
        </form>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
          download={`${payout.id}.csv`}
          data-semid="export-csv"
          className="border border-neutral-300 px-4 py-1.5 text-sm"
        >
          Export CSV
        </a>
      </div>
      <table className="w-full border-y border-neutral-200 text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-500">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Order</th>
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 text-right font-medium">Amount</th>
            <th className="py-2 pr-3 text-right font-medium">Fee</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {payout.lines.map((l) => {
            const isRefunded = l.type === 'charge' && refunded.has(`${l.orderNumber}:${l.amountCents}`);
            return (
              <tr key={l.id} data-semid={`payline-row-${l.id}`}>
                <td className="py-2 pr-3 text-xs text-neutral-500">{l.createdAt.slice(0, 10)}</td>
                <td className="py-2 pr-3">
                  <Link href={`/staff/orders`} className="text-teal-800 hover:underline">
                    {l.orderNumber}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-xs text-neutral-600">{l.type}</td>
                <td className="py-2 pr-3 text-right">{formatPrice(l.amountCents)}</td>
                <td className="py-2 pr-3 text-right text-xs text-neutral-500">{l.feeCents ? formatPrice(l.feeCents) : '—'}</td>
                <td className="py-2 text-right">
                  {l.type === 'charge' ? (
                    isRefunded ? (
                      <span className="text-xs text-neutral-500">refunded</span>
                    ) : (
                      <form action={refundLineAction} className="inline">
                        <input type="hidden" name="lineId" value={l.id} />
                        <input type="hidden" name="payout" value={payout.id} />
                        <button
                          type="submit"
                          data-semid={`payline-refund-${l.id}`}
                          className="border border-neutral-300 px-2 py-0.5 text-xs"
                        >
                          Refund
                        </button>
                      </form>
                    )
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Shell>
  );
}
