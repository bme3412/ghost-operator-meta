import { countQueued, listEmails } from '@saltbreak/data';
import { Shell } from '../../shell';
import { sendEmailAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function OutboxPage() {
  const emails = listEmails(50);
  const queued = countQueued();
  return (
    <Shell
      title="Email outbox"
      blurb={`${emails.length} emails, ${queued} queued. Nothing is actually delivered; sending flips the status. Order confirmations send automatically, support replies wait here for staff.`}
    >
      {emails.length === 0 ? (
        <p className="text-sm text-neutral-600">No emails yet. Check out or reply to a ticket to queue one.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {emails.map((m) => (
            <li key={m.id} className="py-3">
              <div className="flex items-baseline gap-3">
                <span className="flex-1 text-sm font-medium">{m.subject}</span>
                <span className="text-xs text-neutral-500">{m.status}</span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                To {m.toEmail} · {m.kind}
                {m.relatedOrder ? ` · ${m.relatedOrder}` : ''} · {m.createdAt}
                {m.sentAt ? ` · sent ${m.sentAt}` : ''}
              </p>
              <p className="mt-1 text-sm text-neutral-600">{m.body}</p>
              {m.status === 'queued' ? (
                <form action={sendEmailAction} className="mt-2">
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="border border-neutral-300 px-2 py-0.5 text-xs">
                    Send now
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
