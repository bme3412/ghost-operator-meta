# Muse for SMB (desktop-app)

Electron app that learns a web workflow from a demonstration.

> Show me how you do this. Inspect what I learned. Use it on the next case.

**Scope (first release):** this app operates the Saltbreak web app (`web-app`,
the fictional surf shop) loaded in its target window. Arbitrary websites,
desktop applications, browser extensions, OS accessibility automation, and
real accounts are later integrations.

## Prerequisites

- Node >= 22.12 (electron-vite requirement)
- pnpm 11+

## Setup

```sh
cd desktop-app
pnpm install
pnpm rebuild electron   # downloads the Electron binary (needs network)
```

## Run (two servers)

Muse for SMB drives Saltbreak through its real UI, so both run together:

```sh
# Terminal 1: the target web app
cd web-app && pnpm install && pnpm db:seed && pnpm dev:saltbreak   # http://localhost:3000

# Terminal 2: Ghost Operator
cd desktop-app && pnpm dev        # target website + Muse for SMB panel
```

Other commands:

```sh
pnpm build      # production bundle to out/
pnpm preview    # launch the production bundle
```

If Saltbreak is not running, the panel's Home view shows the connection
status with setup commands, and the target window shows a self-updating
offline page that opens Saltbreak as soon as it listens.

## Verify

```sh
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest unit tests (recorder, compiler, skills, runner)
pnpm build && pnpm test:e2e   # Playwright Electron tests (needs a display)
```

E2E boots its own Saltbreak on port 3100 with an isolated database, so it
never touches your dev data.

## Package (macOS)

```sh
pnpm dist:dir   # unpacked app in release/
pnpm dist       # .dmg in release/
```

## Environment

Copy `.env.example` to `.env.local` (gitignored) for local keys. Real
environment variables always win over that file. Packaged builds read
`.env.local` from the app's userData directory instead.

| Variable | Default | Purpose |
| - | - | - |
| `TARGET_URL` | `http://localhost:3000` | Saltbreak URL the target window loads (`SALTBREAK_URL` also honored) |
| `GHOST_PROVIDER` | `fixture` | `fixture` (offline, deterministic) or `meta` |
| `MODEL_API_KEY` | — | Required for `meta` generation and explanation |
| `META_BASE_URL` | `https://api.meta.ai/v1` | Meta-compatible chat endpoint |
| `SPARK_MODEL` | `muse-spark-1.3` | Model id for generation and explanation |
| `GHOST_STATE_PATH` | userData / `.local-state/` | Override the state file (tests, e2e) |
| `NTFY_TOPIC` | — | ntfy topic for the "batch finished" phone push; unset means no push |
| `NTFY_SERVER` | `https://ntfy.sh` | ntfy server |
| `GHOST_AWAY_HOST` | LAN IPv4 | Host the "while you were away" page binds to and links to |
| `GHOST_AWAY_PORT` | `3200` | Port for the away page |
| `GHOST_AWAY_SECRET` | random per launch | Signs away-page links; set it to keep links valid across restarts |
| `TRANSCRIBE_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible `/audio/transcriptions` endpoint for spoken notes |
| `TRANSCRIBE_API_KEY` | — | Transcription key; without it the mic returns a canned transcript |
| `TRANSCRIBE_MODEL` | `whisper-1` | Transcription model id |

## Demo script: the Now feed (3 minutes)

Home is the Today briefing: Muse for SMB watches Saltbreak's business events, clusters
repeatable work, and offers the next safe action. Preconditions:
`pnpm dev:saltbreak` running and `pnpm db:reset` done, so the after-hours
pile (T-201 to T-208) is open.

1. **0:00 — The pile, noticed.** Open Muse for SMB. Under **Ready when you are**: "3
   damaged-shipment tickets" and "3 wrong-size tickets", each with a
   "Because…" line citing Maya's rules. Under **Needs you**: the T-207 bank
   chargeback — no rule covers it.
2. **0:40 — Preview before anything runs.** Click **Preview** on the damaged
   cluster: exactly T-203, T-205, T-208 and the skill that will handle them.
3. **1:10 — Approve one batch.** **Run on 3**. Muse for SMB refunds each case,
   quoting the rule it used; the batch summary counts down on screen.
4. **2:00 — The feed updates itself.** Back on Home, the damaged cluster is
   gone, **Recent activity** shows "batch finished — 3 resolved", and T-207
   is still waiting under Needs you. Nothing ran without a preview.
5. **2:30 — Close on the map.** Library → Task map: the same skill as one
   plain-language spine, suggestions underneath — activity, learned rules,
   automation, and evidence as one system.

Dismissing a cluster remembers the choice: it stays gone until a new case
joins it. With `MODEL_API_KEY` set, Muse for SMB re-ranks and rephrases the feed;
the clusters, matches, and actions are always computed deterministically,
and fixture mode shows the identical feed offline.

## Demo script: the Vacation

Maya teaches Muse for SMB one support ticket on Thursday, says her rules out loud,
and goes surfing. Muse for SMB clears the after-hours pile and hands back the one
case her rules don't cover.

Setup: start `pnpm dev:saltbreak` in `web-app` first — recording before the
site is up only captures the "Saltbreak unreachable" offline page. Then
`pnpm db:reset` (seeds the after-hours pile T-201 to T-208), set `NTFY_TOPIC`
in `.env.local`, subscribe to that topic in the ntfy phone app, and put the
phone on the same Wi-Fi as the laptop. The panel stays docked (420px) for
teaching; it expands only for the closing Library shot, where both windows
reflow side by side automatically — never drag windows by hand on camera.

Timed beats (3 minutes):

1. **0:00 — Teach (docked, inbox large).** Open Staff → Support inbox in the
   target window. Eight open tickets: four shipping-damage, three wrong-size,
   one bank chargeback (T-207). **Teach a new task**, goal
   `Handle after-hours support tickets`.
2. **0:30 — Demonstrate.** On T-201 (a dinged board), click **Refund**.
3. **0:45 — Say the rules.** Click **Add note**, then **Say it**, and say:
   "Damaged in shipping means refund. Wrong size means exchange. Anything
   else, ask me." Click **Stop listening**, edit the transcript if needed,
   then save the note. (Typing works the same way; without
   `TRANSCRIBE_API_KEY` the mic fills in exactly this sample.)
4. **1:15 — Review.** **Finish**. The review shows a "Decide using your rules"
   step with your three rules quoted word for word, then "Carry out the
   decision".
5. **1:45 — Publish and batch.** **Save and publish**. In run setup pick
   **Run on many**, click **Find open cases on this page**, then
   **Run on 7 cases**.
6. **2:00 — Muse for SMB works.** T-202 to T-208 run one by one. Each refund or
   exchange quotes the rule it used; T-207 ends as "Needs you" because no
   rule covers a chargeback.
7. **2:40 — The map (expanded).** Open **Library → Task map**. The windows
   reflow on camera: Saltbreak left, Muse for SMB right. The playbook reads as one
   spine — Inputs, steps in plain language, Verification — with Suggestions
   underneath. This is the closing frame.
8. **2:55 — The handoff.** The phone buzzes: "Muse for SMB resolved 6 tickets. 1
   needs you." Tapping it opens the away page with T-207 at the top.

No Saltbreak reset? The curated starter **Handle after-hours support tickets**
on Home loads the same skill without a demonstration.

## Demo script (the first complete experience)

A fresh install on Saltbreak comes with three starter skills already
published, and the site is scanned once automatically, so Home and the Task
map are populated on first launch. Starter cards open run setup directly —
the steps below teach your own skill alongside them, and **Save and publish**
still creates that taught skill as a separate entry.

1. Confirm the green target connection on Home.
2. Click **Teach a new task** and name the goal, e.g. `Resolve a support ticket`.
3. Demonstrate resolving a ticket: Staff → Support inbox → **resolved** on `T-101`.
4. Click **Add note** and explain a decision.
5. Click **Finish** — the draft procedure generates itself for review.
6. Inspect the plain-language steps and callouts, then **Save and publish**.
7. Run setup opens with the new skill selected; enter a new ticket, e.g. `T-102`.
8. Pick **Guide me** (you click, Muse for SMB checks) or **Do it for me**, then **Start run**.
9. Step through (guide) or watch (assisted) as the new ticket is resolved.
10. Verify: the ticket status in Saltbreak, and the checks on the result view.
11. Click **Run on another case** to reuse the skill again, or **See details**
    for the readable record in Library → Runs.

Discover (no demo needed): open Library → Task map → **Site** → **Scan site**,
watch `/staff/inbox` land in the page graph, then read the mined follow-ups
in Suggestions — e.g. `Automate submission on /staff/inbox`. Click **Teach this**
on one to open Teach with its goal prefilled.

## Architecture

- Two windows: target (Saltbreak web app) and the Muse for SMB panel (Today, Teach,
  recording, review, run, Library, Settings). The panel widens for the Library.
- The target page is observed, never owned: a preload capture layer records
  committed DOM events; the runner replays real clicks/fills/submits and
  verifies by reading the live page. Muse for SMB never imports Saltbreak code.
- One authoritative store in the main process, persisted as versioned JSON
  (current: schema v6, which adds batches; v5 states migrate forward unchanged,
  and Harbor-era states migrate forward keeping recordings).
- Decide steps apply the demonstrator's spoken or typed rules to the case on
  the page. A covered case writes its choice into the run inputs (for example
  `{{inputs.resolution}}` picks the Refund or Exchange button); anything else
  ends the run as `escalated` instead of guessing.
- Batches ("Run on many") run one skill over many cases in "Do it for me" mode,
  then push a summary to the owner's phone (ntfy) linking to a signed,
  LAN-only "while you were away" page served on `GHOST_AWAY_PORT`.
- All IPC, persisted data, provider responses, and drafts are Zod-validated.
  Recipes may only use registered DOM actions and checks; `{{inputs.*}}`
  placeholders bind run inputs into selectors and values.
- Recorder: explicit state machine (idle → recording ⇄ paused → idle), gap
  events on pause, fresh snapshots on resume, screenshots at navigation,
  submission, resume, and finish.
- Runner: explicit state machine (running ⇄ paused → terminal). Guide mode
  confirms each step with the user; assisted mode executes through the DOM
  with highlights and per-step checks. Published skill versions are immutable.
- Saltbreak exposes stable automation hooks (`data-semid`, `data-ticket-id`)
  on its staff nav and support inbox; nothing else in `web-app` changed.

## Layout

- `src/main/` — windows, IPC, target config, store, recorder, compiler,
  runner, providers, skills
- `src/preload/` — typed IPC bridge (`window.ghost`) + target-page capture
- `src/shared/` — Zod schemas, target definition, skill formatting, policy
- `src/renderer/` — panel views, library sections, and the target-offline page
- `tests/unit/` — Vitest recorder/compiler/skills/runner tests
- `tests/e2e/` — Playwright Electron tests (boots Saltbreak on :3100)
