'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { publishAction, unpublishAction } from './actions';

export function PublishButtons({ sku, status }: { sku: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const published = status === 'published';
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className="border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-40"
        disabled={published}
        onClick={async () => {
          const r = await publishAction(sku);
          setMessage(r.message);
          router.refresh();
        }}
      >
        Publish
      </button>
      <button
        type="button"
        className="border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-40"
        disabled={!published}
        onClick={async () => {
          const r = await unpublishAction(sku);
          setMessage(r.message);
          router.refresh();
        }}
      >
        Unpublish
      </button>
      {message ? <span className="text-xs text-neutral-500">{message}</span> : null}
    </span>
  );
}
