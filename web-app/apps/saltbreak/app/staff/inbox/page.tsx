import Link from 'next/link';
import { listOrders, listTickets, TICKET_RESOLUTIONS } from '@saltbreak/data';
import { Shell } from '../../shell';
import { replyAction, resolveTicketAction, ticketAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function InboxPage() {
  const tickets = listTickets();
  const orderIdByNumber = new Map(listOrders().map((o) => [o.number, o.id]));
  return (
    <Shell title="Support inbox" blurb={`${tickets.length} tickets. Replies are staff-posted; sourced answers arrive with the knowledge-card slice.`}>
      <ul data-semid="inbox-list" className="divide-y divide-neutral-200 border-y border-neutral-200">
        {tickets.map((t) => (
          <li key={t.id} data-semid={`ticket-row-${t.id}`} data-ticket-id={t.id} className="py-5">
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-medium">{t.id}</span>
              <span className="flex-1 text-sm">{t.subject}</span>
              <span data-semid={`ticket-status-${t.id}`} className="text-xs text-neutral-500">{t.status}{t.sku ? ` · ${t.sku}` : ''}{t.customerEmail ? ` · ${t.customerEmail}` : ''}</span>
              {t.resolution ? (
                <span data-semid={`ticket-resolution-${t.id}`} className="bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-800">
                  {t.resolution === 'refund' ? 'Refunded' : 'Exchange started'}
                </span>
              ) : null}
              {t.orderNumber && orderIdByNumber.get(t.orderNumber) !== undefined ? (
                <Link href={`/staff/orders/${orderIdByNumber.get(t.orderNumber)}`} className="text-xs text-teal-800 hover:underline">
                  {t.orderNumber}
                </Link>
              ) : null}
            </div>
            <p data-semid={`ticket-body-${t.id}`} className="mt-1 text-sm text-neutral-600">{t.body}</p>
            {t.replies.length > 0 ? (
              <ul className="mt-2 space-y-1 border-l-2 border-neutral-200 pl-3">
                {t.replies.map((r) => (
                  <li key={r.id} className="text-sm">
                    <span className="text-neutral-600">{r.body}</span>{' '}
                    <span className="text-xs text-neutral-400">{r.createdAt}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={replyAction} data-semid={`ticket-reply-form-${t.id}`} className="mt-2 flex gap-2">
              <input type="hidden" name="id" value={t.id} />
              <input name="body" data-semid={`ticket-reply-${t.id}`} placeholder="Write a reply…" className="max-w-xl flex-1 border border-neutral-300 px-2 py-1 text-sm" aria-label={`Reply to ${t.id}`} />
              <button type="submit" data-semid={`ticket-reply-submit-${t.id}`} className="border border-neutral-300 px-2 py-1 text-xs">
                Reply
              </button>
            </form>
            <div className="mt-2 flex gap-2">
              {(['open', 'pending', 'resolved'] as const).map((s) => (
                <form key={s} action={ticketAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="status" value={s} />
                  <button
                    type="submit"
                    data-semid={s === 'resolved' ? `ticket-resolve-${t.id}` : `ticket-status-${t.id}-${s}`}
                    disabled={t.status === s}
                    className="border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    {s}
                  </button>
                </form>
              ))}
              {t.orderNumber ? (
                <>
                  <span className="mx-1 self-center text-neutral-300" aria-hidden="true">|</span>
                  {TICKET_RESOLUTIONS.map((r) => (
                    <form key={r} action={resolveTicketAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="resolution" value={r} />
                      <button
                        type="submit"
                        data-semid={`ticket-${r}-${t.id}`}
                        disabled={t.resolution !== null}
                        className="bg-teal-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                      >
                        {r === 'refund' ? 'Refund' : 'Exchange'}
                      </button>
                    </form>
                  ))}
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
