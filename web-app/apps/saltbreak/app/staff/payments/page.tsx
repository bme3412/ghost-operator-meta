import Link from 'next/link';
import { formatPrice, listPayouts } from '@saltbreak/data';
import { Shell } from '../../shell';

export const dynamic = 'force-dynamic';

export default function PaymentsPage() {
  const payouts = listPayouts();
  return (
    <Shell title="Payments" blurb="TidePay settlements. Open a payout to review its lines, refund a charge, or send it to Books.">
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {payouts.map((p) => (
          <li key={p.id} data-semid={`payout-row-${p.id}`} className="py-3">
            <div className="flex items-baseline gap-4">
              <Link href={`/staff/payments/${p.id}`} className="text-sm font-medium text-teal-800 hover:underline">
                {p.id}
              </Link>
              <span className="flex-1 text-xs text-neutral-500">
                arrives {p.arrivesAt.slice(0, 10)} · {p.lineCount} lines
              </span>
              <span className="text-xs text-neutral-500">net {formatPrice(p.netCents)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
