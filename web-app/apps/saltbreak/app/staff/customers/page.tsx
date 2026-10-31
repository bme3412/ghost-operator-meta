import Link from 'next/link';
import { formatPrice, listCustomers } from '@saltbreak/data';
import { Shell } from '../../shell';

export const dynamic = 'force-dynamic';

export default function CustomersPage() {
  const customers = listCustomers();
  return (
    <Shell
      title="Customers"
      blurb={`${customers.length} customers. Segments: vip (3+ orders or $500+), repeat (2+), new (1), lapsed (nothing in 90 days).`}
    >
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {customers.map((c) => (
          <li key={c.id} className="flex items-baseline gap-4 py-2">
            <Link href={`/staff/customers/${c.id}`} className="w-40 shrink-0 text-sm font-medium text-teal-800 hover:underline">
              {c.name}
            </Link>
            <span className="flex-1 text-sm text-neutral-600">{c.email}</span>
            <span className="text-xs text-neutral-500">
              {c.orderCount} orders · {formatPrice(c.totalCents)}
            </span>
            <span className="w-16 text-right text-xs font-medium">{c.segment}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
