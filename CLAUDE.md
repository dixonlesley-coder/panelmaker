# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PanelMaker is an offline **Electron + React + TypeScript** desktop app for designing
Indonesian low-voltage electrical panels and whole-building distribution systems to
PUIL 2011 / IEC 60364 / IEC 60947. It auto-sizes cables/breakers/busbars, control
gear, enclosures, energy sources, and power-factor correction, and renders single-line
and ladder diagrams.

## Commands

```bash
# install (skip the heavy Electron binary download in headless/CI)
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install

# tests (Vitest)
npm test                                   # full suite
npx vitest run tests/engine/power.test.ts  # one file
npx vitest run -t "star-delta"             # tests matching a name
npx vitest                                 # watch mode

# typecheck — THREE scopes (see Architecture); run the one(s) you touched
npx tsc --noEmit -p tsconfig.json          # everything (incl. tests)
npx tsc --noEmit -p tsconfig.web.json      # renderer + shared (strict: noUnusedLocals)
npx tsc --noEmit -p tsconfig.node.json     # main + preload + shared

# build / run
npm run dev          # renderer as a plain web app (Vite) — easiest to preview
npm run build        # build the renderer (Vite -> dist/)
npx electron-vite build   # full Electron bundle: main + preload + renderer -> out/

# database migrations (author with system Node, applied at runtime via migrate())
npx drizzle-kit generate

# package + publish a release (enables auto-update for installed apps)
GH_TOKEN=<token> npx electron-builder --publish always   # bump package.json "version" first
```

**Verification reality:** the Electron GUI and a headless browser cannot run in this
environment (no display; the sandbox blocks the Playwright/Chromium CDN). Verify changes
with the typechecks above + Vitest + `npx electron-vite build`. The pure engine is the
acceptance gate and is fully headless-testable.

## Architecture

### Three TypeScript scopes, typechecked separately

- `src/shared/**` — **pure TS, imports nothing from Node or the DOM.** The calculation
  engine, versioned standards data, and domain types. Reused by *both* the main process
  and the renderer.
- `src/main/**` + `src/preload/**` — Electron main process (SQLite, IPC, updater) and the
  context-isolated bridge. Uses Node/Electron APIs.
- `src/renderer/**` — React 18 + Mantine v7 + @xyflow/react + Zustand. Uses the DOM.

`tsconfig.web.json` (renderer+shared) and `tsconfig.node.json` (main+preload+shared) keep
the boundary honest; `tsconfig.json` covers all + tests. Path aliases `@shared/*` and
`@renderer/*` are declared in **four** configs that must stay in sync: `tsconfig.json`,
`vite.config.ts`, `vitest.config.ts`, `electron.vite.config.ts`.

### The pure engine is the heart (`src/shared/engine`)

`computeSystem(project)` orchestrates everything: it walks the panel feeder tree
bottom-up (`computePanel` per panel) and then derives supply/transformer, earthing/RCD,
power-factor/capacitor, and energy sources. It is a **pure function with no side effects
or Node/DOM deps**, so it runs identically:
- in the renderer (called live in `useMemo(() => computeSystem(project), [project])` for
  instant feedback), and
- in the main process (`services/calc.service.ts`, authoritative on save / for PDF export).

`computePanel`/`computeSystem` are the **only constructors** of the result types
(`CircuitResult` / `PanelResult` / `SystemResult` in `src/shared/types/results.ts`); these
gain new required fields as features grow, and everything else just reads them. When you
add a result field, set it in computePanel/computeSystem.

Engineering constants (KHA ampacity, breaker ladders, motor FLC, contactor AC-3, transformer
kVA, capacitor steps, etc.) live **in code** under `src/shared/standards`, stamped with
`STANDARDS_VERSION` — diffable, unit-tested, and atomic with the engine. Only *user* data
(catalog, pricelists, projects) goes in SQLite.

### Single source of truth → many projections (`src/renderer/state/projectStore.ts`)

A Zustand store holds the canonical `ProjectInput`. The structured circuit builder, the
panel SLD, the building SLD, the ladder schematic, the dashboard, and the power one-line are
all *projections* over it. All edits go through store actions; results are recomputed by
calling the pure engine. There is no second copy of the model.

### The renderer runs as web AND in Electron

The same renderer (root `index.html` + `src/renderer/main.tsx`) is built standalone by
`vite.config.ts` and reused by `electron.vite.config.ts`. Desktop-only capabilities
(project save/load, PDF export, schematic persistence, auto-update) go through `window.api`,
which is **feature-detected** in `src/renderer/api/index.ts` with graceful web fallbacks.
**Never call `window.api` directly — always go through `desktopApi()` / `isDesktop()`**, so
the web preview keeps working.

### Persistence (`src/main/db`, `src/main/repositories`)

better-sqlite3 (synchronous, main process only) + Drizzle ORM, behind typed IPC
(`src/shared/ipc-contract.ts` is the single source of channel names + the `Api` interface;
preload and handlers both import it). There are no generated migrations yet — `migrate.ts`
falls back to an idempotent `CREATE TABLE IF NOT EXISTS` bootstrap. **Adding a DB column
means editing three places that must agree:** `db/schema.ts` (Drizzle), the bootstrap SQL in
`db/migrate.ts`, and the camelCase↔snake_case mapping in `repositories/mappers.ts`.
better-sqlite3 and electron-updater must stay **external** (electron-vite
`externalizeDepsPlugin` + electron-builder `npmRebuild`/`asarUnpack`).

### Tests (`tests/`)

`tests/engine` (pure logic — the bulk), `tests/renderer` (store + UI-logic via mocked
`window.api`), `tests/integration` (SQLite round-trips running the *real* repos against a
working-dir fallback DB). Keep all SQLite tests in **one file** — separate files race on the
shared on-disk DB.

## Conventions & gotchas

- Module resolution is `Bundler`; import without file extensions.
- `strict` + `noUncheckedIndexedAccess`: `arr[i]` is `T | undefined` — handle it.
- Offline guarantee: no runtime CDNs/fonts/network anywhere except the *optional* GitHub
  auto-update check. Bundle assets locally; strict CSP is set in `src/main/index.ts`.
- Autosave (`src/renderer/features/autosave` + `lib/autosave.ts`): debounced save to SQLite
  (desktop) / localStorage (web), restored on launch by `useAutosave`. The whole project
  graph + `earthingSystem` + `sources` round-trip; `schedule` persists per circuit.

## Implemented feature set (current progress)

All committed on branch `claude/cool-edison-f8wTp`; full suite green.

- **Sizing engine (PUIL/IEC):** load current (1ph/3ph), derating, cable sizing
  (`Iz ≥ max(In, 1.25·Ib)` + minimums + voltage drop), breaker (MCB/MCCB), busbar
  (per-phase line current), enclosure (W×H×D + sheet + ventilation from heat).
- **Phases & loads:** 12 load types; single- vs three-phase determination; phase balancing
  across L1/L2/L3 with imbalance warning; neutral-aware **cable cores** (lighting 2-core,
  neutral loads 3-core, motors 4-core, distribution 5-core).
- **Control & motor control (IEC 60947):** DOL / Star-Delta / Reversing / Soft-starter /
  VFD / ATS / Pump templates; contactor (AC-3 + Y-Δ 58%), overload, control transformer,
  VFD sizing; interlocks; **starting analysis** (inrush × FLC + torque per method); a
  React Flow **ladder/control-schematic editor** (auto-generated + freeform + regenerate).
- **Water-level / pump control**, **grounding/earthing systems** (TN-S/TN-C-S/TT → RCD
  policy + main earthing/bonding conductors), **supply** (LV direct vs MV + transformer at
  the 200 kVA Indonesian ceiling), **power-factor / capacitor bank** (sized only when
  below the 0.85 penalty PF).
- **Energy sources:** generator, solar PV + inverter (array/string/inverter), backup
  battery; a **hybrid power one-line** with source interlocks (ATS mains↔genset,
  PV anti-islanding, battery transfer).
- **Whole-building system:** panels link via feeders into a building SLD; demand aggregates
  upstream with diversity.
- **Validation + one-click fixes**, **costing** (BOM × imported CSV/XLSX pricelist),
  **scheduled/continuous loads + a 24-hour peak-load dashboard** (charts), **per-panel +
  per-system PDF export**, and **GitHub-releases auto-update** (electron-updater).

## README

See `README.md` for the product overview and the PUIL sizing rules summary. Results are
engineering estimates — the app stamps a "verify against PUIL 2011" disclaimer on exports.
