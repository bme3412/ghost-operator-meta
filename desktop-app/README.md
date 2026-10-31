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
cd desktop-app && pnpm dev        # target + toolbar + sidecar + studio
```

Other commands:

```sh
pnpm build      # production bundle to out/
pnpm preview    # launch the production bundle
```

If Saltbreak is not running, the target window shows how to start it.

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

| Variable | Default | Purpose |
| - | - | - |
| `TARGET_URL` | `http://localhost:3000` | Saltbreak URL the target window loads (`SALTBREAK_URL` also honored) |
| `GHOST_PROVIDER` | `fixture` | `fixture` (offline, deterministic) or `meta` |
| `MODEL_API_KEY` | — | Required for `meta` generation and explanation |
| `META_BASE_URL` | `https://api.meta.ai/v1` | Meta-compatible chat endpoint |
| `SPARK_MODEL` | `muse-spark-1.3` | Model id for generation and explanation |
| `GHOST_STATE_PATH` | userData / `.local-state/` | Override the state file (tests, e2e) |

## Demo script (the first complete experience)

1. Open the Saltbreak home page in the target window.
2. Click **Teach** in the toolbar.
3. Demonstrate resolving a ticket: Staff → Support inbox → **resolved** on `T-101`.
4. Click **Add note** and explain a decision.
5. Click **Finish** — the studio opens on the recording.
6. Pick the provider and click **Generate draft procedure**.
7. Inspect bindings (`Ticket "T-101"` becomes `inputs.ticketId`) and unresolved
   items, **Save as draft skill**, then **Publish**.
8. In the sidecar pick the procedure and enter a new ticket, e.g. `T-102`.
9. Click **Guide me** or **Assisted run**.
10. Step through (guide) or watch (assisted) as the new ticket is resolved.
11. Verify: the ticket status in Saltbreak, and the checks in the sidecar.
12. Open the run in Studio → Runs for the readable record.

## Architecture

- Four windows: target (Saltbreak web app), toolbar (recorder), sidecar
  (guide / assisted), studio (recordings, skills, runs, task map).
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
- `src/renderer/` — toolbar, sidecar, studio, and the target-offline page
- `tests/unit/` — Vitest recorder/compiler/skills/runner tests
- `tests/e2e/` — Playwright Electron tests (boots Saltbreak on :3100)
