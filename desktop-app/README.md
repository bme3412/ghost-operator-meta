# Ghost Operator (desktop-app)

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

Ghost Operator drives Saltbreak through its real UI, so both run together:

```sh
# Terminal 1: the target web app
cd web-app && pnpm install && pnpm db:seed && pnpm dev:saltbreak   # http://localhost:3000

# Terminal 2: Ghost Operator
cd desktop-app && pnpm dev        # target website + Ghost panel
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

## Demo script (the first complete experience)

1. Confirm the green target connection on Home.
2. Click **Teach a new task** and name the goal, e.g. `Resolve a support ticket`.
3. Demonstrate resolving a ticket: Staff → Support inbox → **resolved** on `T-101`.
4. Click **Add note** and explain a decision.
5. Click **Finish** — the draft procedure generates itself for review.
6. Inspect the plain-language steps and callouts, then **Save and publish**.
7. Run setup opens with the new skill selected; enter a new ticket, e.g. `T-102`.
8. Pick **Guide me** (you click, Ghost checks) or **Do it for me**, then **Start run**.
9. Step through (guide) or watch (assisted) as the new ticket is resolved.
10. Verify: the ticket status in Saltbreak, and the checks on the result view.
11. Click **Run on another case** to reuse the skill again, or **See details**
    for the readable record in Library → Runs.

Discover (no demo needed): open Library → Task map → **Site** → **Scan site**,
watch `/staff/inbox` land in the page graph, then read the mined follow-ups
in Suggestions — e.g. `Automate submission on /staff/inbox`. Click **Teach this**
on one to open Teach with its goal prefilled.

## Architecture

- Two windows: target (Saltbreak web app) and the Ghost panel (Home, Teach,
  recording, review, run, Library, Settings). The panel widens for the Library.
- The target page is observed, never owned: a preload capture layer records
  committed DOM events; the runner replays real clicks/fills/submits and
  verifies by reading the live page. Ghost never imports Saltbreak code.
- One authoritative store in the main process, persisted as versioned JSON
  (current: schema v5; Harbor-era states migrate forward keeping recordings).
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
