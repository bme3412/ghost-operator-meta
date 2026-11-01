# Workflow Atlas + Saltbreak Surf Co.

Two systems with a vendor boundary between them. See `build-plan.md` for the full specification.

- **Saltbreak** (`apps/saltbreak`, port 3000) is the fictional customer: an independent surf shop with a storefront, cart, simulated checkout, and staff tools for supplier intake, catalog staging, orders, inventory, support inbox, payments reconciliation (TidePay), and a Books ledger. It runs on its own database and never imports Atlas or Muse for SMB code.
- **Atlas** (`apps/atlas`, port 3001) is the original product surface: company graph, recordings, skills, runs, and recommendations. It runs on a separate database and operates Saltbreak only through its real interfaces, via the worker.
- **Muse for SMB** (`../desktop-app`) is the current product: an Electron partner panel that learns Saltbreak workflows from demonstrations and operates the shop through its real UI. It lives outside this workspace and never imports Saltbreak code.

## The Muse for SMB boundary

Saltbreak is operated, never owned:

- Staff UI elements carry stable automation hooks (`data-semid`,
  `data-ticket-id`) so Muse for SMB's recorder and runner can replay real
  clicks, fills, and submits against the live pages.
- Every business state change appends to an append-only event log
  (`packages/saltbreak-data/src/events.ts`): orders, ticket opens/resolutions,
  stock changes, emails, payments.
- `GET /api/activity?since=<eventId>` is a read-only connector over that log,
  with ticket events enriched (subject/body/status). The Today briefing in
  Muse for SMB clusters those events into work it can run or hand back.
- Demo seeds are synthetic and resettable: the after-hours support pile
  (T-201 to T-208, including the T-207 bank chargeback) and the TidePay
  payout scenarios (PO-1043 to PO-1045) come from `pnpm db:reset`.

## Layout

| Path | Contents |
| - | - |
| `apps/saltbreak` | Storefront + staff operations (the customer system) |
| `apps/atlas` | Graph, skills, runs, adviser (the product) |
| `apps/worker` | Long-lived Node process: owns Playwright browser, SAM/Wonder clients |
| `packages/contracts` | Shared zod schemas: skills, runs, events, artifacts, graph edges |
| `packages/saltbreak-data` | Customer tables, repos, business seeding |
| `packages/atlas-data` | Atlas tables, repos, graph seeding |
| `data/` | Local SQLite files (created on seed, never committed) |
| `fixtures/` | Synthetic supplier photos (AI-generated placeholders, see README) |

## Prerequisites

- Node 22+ runs this scaffold. Eve (agent coordinator, added in a later slice)
  requires Node 24+: `nvm install 24 && nvm use 24`.
- pnpm 11+.

## Setup

```sh
cp .env.example .env.local   # add MODEL_API_KEY
pnpm install
pnpm --filter @atlas/worker exec playwright install chromium
pnpm build:packages
pnpm db:seed
```

`packages/*` compile to `dist/` with plain `tsc`; `dev`, `worker`, and `db:*`
rebuild automatically via pre-hooks, so no separate watch process is needed.

## Run

```sh
pnpm dev      # Saltbreak on :3000 + Atlas on :3001
pnpm worker   # worker health on http://localhost:3101/health
```

Saltbreak routes: `/` storefront home, `/shop`, `/product/[sku]`, `/cart`,
`/checkout`, `/order/[id]`, staff tools under `/staff/` (supplier, catalog,
preview, assets, orders, inventory, inbox, customers, outbox, activity,
payments, books, promos), and the read-only `GET /api/activity` connector.

Atlas routes: `/`, `/atlas`, `/workflows`, `/recordings`, `/skills`, `/runs`.

## Business rules (live)

- Checkout creates an order and decrements inventory; short stock blocks it.
- Publishing a draft puts it on the storefront; unpublishing removes it.
- Zero stock shows Sold out and disables add-to-cart.
- Publishing requires dimensions and price — the tote draft is blocked.

## Scripts

| Command | Effect |
| - | - |
| `pnpm dev` | Start both apps (Saltbreak :3000, Atlas :3001) |
| `pnpm dev:saltbreak` / `pnpm dev:atlas` | Start one app |
| `pnpm worker` | Start worker process |
| `pnpm db:migrate` | Apply both SQLite schemas |
| `pnpm db:seed` | Migrate + load all fixtures |
| `pnpm db:reset` | Clear synthetic data and re-seed (sandbox only) |
| `pnpm test` | Run database-path regression tests |
| `pnpm typecheck` | Typecheck every package |
| `pnpm build` | Production build of both apps |

## Next step

Saltbreak's active consumer is Muse for SMB in `../desktop-app` — see its
README for the demo scripts (Today briefing, the Vacation) that run against
this shop. Gate zero (per `build-plan.md`) still tracks the Atlas path: one
Eve→Meta round trip, one SAM mask, one Wonder browser action driving
Saltbreak's staff UI, one draft saved and verified.
