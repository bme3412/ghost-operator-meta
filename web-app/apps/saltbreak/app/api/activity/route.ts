import { listEvents, listOrders, listTickets } from '@saltbreak/data';

export const dynamic = 'force-dynamic';

/**
 * Read-only activity connector for Ghost Operator: the append-only business
 * event log, oldest-first after `since`, with ticket events enriched with
 * the ticket's current subject/body/status so consumers never query
 * business tables. Ghost reads this; it never writes through it.
 */
export function GET(request: Request): Response {
  const since = Number(new URL(request.url).searchParams.get('since') ?? 0) || 0;
  const tickets = new Map(listTickets().map((t) => [t.id, t]));
  const orders = new Map(listOrders().map((o) => [o.number, o]));
  const events = listEvents(500)
    .filter((event) => event.id > since)
    .sort((a, b) => a.id - b.id)
    .map((event) => {
      const ticket = event.entity === 'ticket' ? tickets.get(event.entityId) : undefined;
      const order = ticket?.orderNumber ? orders.get(ticket.orderNumber) : undefined;
      return ticket
        ? {
            ...event,
            ticket: {
              subject: ticket.subject,
              body: ticket.body,
              status: ticket.status,
              resolution: ticket.resolution ?? null,
              customer: order?.customerName,
              amountCents: order?.totalCents
            }
          }
        : event;
    });
  return Response.json({ events });
}
