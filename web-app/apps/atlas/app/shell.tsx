import type { ReactNode } from 'react';

export function Shell({ title, blurb, children }: { title: string; blurb: string; children?: ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">{blurb}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
