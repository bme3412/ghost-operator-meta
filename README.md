# Muse for SMB — meta-ai-hackathon

**Muse for SMB is an AI business partner for a small shop.** It watches how
the business runs, notices repeatable work, learns the owner's approach from
demonstrations and spoken rules, executes approved tasks through the real
website, and brings unfamiliar decisions back to the owner.

> Notice work → review the proposed action and rule → approve → follow
> progress → see verified results.

The demo business is **Saltbreak Surf Co.**, a fictional surf shop. 

## The two projects

This repo holds two independent projects (each with its own `package.json`
and lockfile — run commands from inside the project directory):

| Project | What it is |
| - | - |
| [`desktop-app/`](desktop-app/README.md) | **Muse for SMB** — the Electron product. A Saltbreak website window plus one docked Muse panel (~420px). It learns workflows by watching demonstrations, then runs them on new cases. |
| [`web-app/`](web-app/README.md) | **Saltbreak Surf Co.** (the customer system Muse operates)

## Quickstart

Muse for SMB drives Saltbreak through its real UI, so both run together:

```sh
# Terminal 1: Saltbreak (the shop)
cd web-app
pnpm install
pnpm db:seed
pnpm dev:saltbreak        # http://localhost:3000

# Terminal 2: Muse (the desktop app)
cd desktop-app
pnpm install
pnpm rebuild electron     # downloads the Electron binary (needs network)
pnpm dev                  # Saltbreak window + Muse panel
```

Prerequisites: Node ≥ 22.12 and pnpm 11+.

If Saltbreak isn't running, the panel's Today view shows setup commands and
the target window shows a self-updating offline page that opens Saltbreak as
soon as it starts listening.

## What using Muse feels like

One panel, three tabs — **Today / Playbook / Activity** — beside the shop:

1. **Today** notices work. Saltbreak's business events are clustered into
   plain-language items ("3 damaged deliveries"), each with a "Because…"
   precedent line. Work a saved approach covers is *Ready when you are*;
   cases no rule covers sit under *Needs your judgment*.
2. **Review** shows exactly what will happen before anything runs: each
   case's customer, request, proposed action and refund amount (or an honest
   "amount unavailable"), and the owner's saved rule verbatim — conditions
   and exceptions preserved, never collapsed into a keyword summary. The
   only execution button is specific: **Approve 3 refunds**.
3. **Progress and completion** follow those same cases. The report separates
   *Completed*, *Needs your decision*, and *Didn't finish* — a technical
   failure is never dressed up as a business judgment.
4. **Activity** reopens the same results, with links back to each case in
   Saltbreak and the playbook version that ran.
5. **Playbook** holds the owner's approaches: where each came from (Starter
   vs Learned from you), the saved rules word for word, and "See how this
   works" generated from the actual saved process. *Update this approach*
   revises the same playbook with a new version — never a silent duplicate.
6. **Teach Muse** (inside the teaching flow, alongside page-specific
   ideas): demonstrate a task once in the website, add notes or spoken
   rules, and check what Muse learned before anything is saved.

## Demos

Timed, scripted walkthroughs live in the
[desktop-app README](desktop-app/README.md):

- **The Today briefing (3 min)** — the after-hours pile (T-201–T-208)
  noticed, previewed, approved, and reported, with the T-207 bank
  chargeback handed back.
- **The Vacation** — Maya teaches her rules once ("Damaged in shipping
  means refund. Wrong size means exchange. Anything else, ask me."), goes
  surfing, and Muse clears the pile, pushing a summary and a signed
  "while you were away" page to her phone.
- **The first complete experience** — teach, publish, run assisted, verify.

## How it fits together

- **Two windows only.** The Saltbreak website, and the Muse panel docked
  beside it at a consistent width. No toolbar/sidecar/studio sprawl.
- **Observed, never owned.** A preload capture layer records committed DOM
  events from demonstrations; the runner replays real clicks, fills, and
  submits against the live pages and verifies by reading them. Recipes may
  only use registered DOM actions and checks, and every IPC payload,
  persisted record, and provider response is Zod-validated.
- **Deterministic core, optional model.** Clustering, rule matching, and
  coverage are computed in code. With `MODEL_API_KEY` set
  (`GHOST_PROVIDER=meta`), the model may only re-rank and rephrase; the
  default `fixture` provider is fully offline and deterministic, and shows
  the identical feed.
- **Rules decide; Muse never guesses.** Decide steps apply the owner's
  saved rules to the case on the page. Anything outside them ends as
  *escalated* and comes back to the owner.
- **One store.** A single versioned JSON state file in the main process
  (override with `GHOST_STATE_PATH`), migrating older states forward.
  Published playbook versions are immutable; batches record the exact
  version each case ran.
- **Saltbreak is a real system, not a mock.** Storefront, staff inbox,
  payments, and a Books ledger over SQLite, with an append-only event log
  behind the read-only `GET /api/activity` connector. Demo data is
  synthetic and resettable (`pnpm db:reset`); runs and recordings are never
  sample-seeded.

## Verify

```sh
# desktop-app
pnpm typecheck
pnpm test                 # Vitest unit tests
pnpm build && pnpm test:e2e   # Playwright Electron E2E (needs a display)

# web-app
pnpm test                 # data-layer regression tests
pnpm typecheck
```

E2E boots its own Saltbreak on port 3100 with an isolated database and an
isolated state file, so it never touches your dev data.

## Layout

```
desktop-app/   Muse — Electron app (main, preload, panel renderer, tests)
web-app/       Saltbreak + Atlas — Next.js apps, worker, shared packages
```

Environment variables (providers, target URL, phone notifications,
transcription) are documented in the
[desktop-app README](desktop-app/README.md#environment); app-specific
commands and routes are in the [web-app README](web-app/README.md).
