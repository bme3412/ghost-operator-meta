import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

const NAV: Array<[string, string]> = [
  ['Inbox', '/atlas/inbox'],
  ['Atlas', '/atlas'],
  ['Workflows', '/workflows'],
  ['Recordings', '/recordings'],
  ['Skills', '/skills'],
  ['Runs', '/runs'],
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900">
        <header className="border-b border-neutral-200">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
            <Link href="/" className="text-base font-semibold">
              Workflow Atlas
            </Link>
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className="text-sm text-neutral-700 hover:underline">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
