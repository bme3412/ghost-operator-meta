import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { CartLink } from './cart-link';

const STAFF: Array<[string, string]> = [
  ['Overview', '/staff/overview'],
  ['Supplier intake', '/staff/supplier'],
  ['Catalog staging', '/staff/catalog'],
  ['Orders', '/staff/orders'],
  ['Inventory', '/staff/inventory'],
  ['Support inbox', '/staff/inbox'],
  ['Customers', '/staff/customers'],
  ['Email outbox', '/staff/outbox'],
  ['Activity log', '/staff/activity'],
  ['Promos', '/staff/promos'],
  ['Asset panel', '/staff/assets'],
];

function WaveMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M2 16c3-4.5 6-4.5 9 0s6 4.5 9 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M2 10.5c3-4.5 6-4.5 9 0s6 4.5 9 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900">
        <div className="bg-neutral-900 px-6 py-1.5 text-center text-xs text-white">
          Free shipping on orders over $75 · Summer sale up to 20% off beach gear
        </div>
        <header className="border-b border-neutral-200">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
            <Link href="/" className="flex items-center gap-2 leading-tight">
              <WaveMark />
              <span className="text-lg font-semibold tracking-tight">Saltbreak</span>
            </Link>
            <span className="flex-1" />
            <Link href="/shop" className="text-sm text-neutral-600 hover:text-black hover:underline">
              Shop all
            </Link>
            <Link href="/shop?category=Surfboards" className="text-sm text-neutral-600 hover:text-black hover:underline">
              Surfboards
            </Link>
            <Link href="/shop?category=Beach+Gear" className="text-sm text-neutral-600 hover:text-black hover:underline">
              Beach gear
            </Link>
            <CartLink />
            <details className="relative">
              <summary data-semid="nav-staff" className="cursor-pointer list-none text-sm text-neutral-400 hover:underline [&::-webkit-details-marker]:hidden">
                Staff ▾
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-44 border border-neutral-200 bg-white py-1 shadow-sm">
                {STAFF.map(([label, href]) => (
                  <Link key={href} href={href} data-semid={`nav-staff-${href.split('/').pop()}`} className="block px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="border-t border-neutral-200">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-6 py-5 text-xs text-neutral-500">
            <span>Saltbreak Surf Co. · 14 Dune Ln, Montauk NY</span>
            <span className="flex-1" />
            <span>Demo store — all products, orders, and people are fictional.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
