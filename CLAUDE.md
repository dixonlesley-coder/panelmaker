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

# catalogue PDF -> categorised parts JSON (pure-Python pdfplumber; bundled in CI
# as a PyInstaller binary the app spawns — end users need no Python)
python scripts/extract_catalogue.py --pdf catalogue.pdf --auto-json   # prints JSON
python scripts/extract_catalogue.py --pdf catalogue.pdf --inspect 1-20  # debug headers

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

### Added this iteration (branch `claude/trusting-lovelace-fflrn3`)

- **Protection & fault analysis:** prospective short-circuit current (Isc) propagated down
  the feeder tree, **breaker kA adequacy** check, **earth-fault loop (Zs) + ADS disconnection**
  for TN systems, and **selectivity/discrimination** reporting (`engine/fault.ts`).
- **Power quality:** **harmonics** estimate for VFD-heavy panels (triplen-neutral oversizing,
  line-reactor/filter recommendation, THD band) and a simplified **arc-flash / incident-energy**
  (IEEE-1584-style) estimate mapped to an NFPA 70E PPE category (`engine/harmonics`, `engine/arcFlash`).
- **Occupancy demand library:** residential/office/commercial/industrial/hospitality/mixed
  presets supply diversity + per-load demand factors (`standards/occupancy`); explicit values win.
- **Containment:** per-circuit **conduit fill** sizing + per-panel **cable-tray** sizing, with
  **from-to** columns on the cable schedule (`engine/containment`).
- **Drawings & CAD:** pure DOM-free **SVG builders** for the GA front-view (to-scale device
  placement) and single-line (`src/shared/drawing`), **vector diagrams embedded in the PDF**,
  and **SVG + DXF file export** from the GA/SLD views.
- **Branding & deliverables:** project **title block** (logo, drawing/project number, revision
  block) on PDFs/drawings, persisted via a `meta_json` column on `projects`; **circuit-label /
  nameplate** PDF printing.
- **Commercial:** **labor + mark-up quotation/proposal** engine + screen + PDF (`engine/quotation`,
  settings on `ProjectMeta`), **consolidated project-wide BOM** with CSV/Excel export, and optional
  catalog **SKU / order codes**.
- **Workflow:** visible **undo/redo** toolbar + tests, **duplicate / copy-paste** circuits,
  **multi-select bulk edit**, reusable **panel templates**, and a guided **circuit wizard**.
- **i18n:** offline **Bahasa Indonesia** localization (statically bundled `react-i18next`
  resources, no runtime fetch; `src/renderer/i18n`), a language switcher (Settings + header), and
  **PUIL 2011 / IEC 60364** clause references on the PDF reports (`standards/references`).
- **Licensing / access control (`src/main/license/**`):** optional **Google Workspace (OIDC)**
  gate for the *desktop* build only — system-browser OAuth (RFC 8252) + PKCE, `id_token` verified
  with `jose`/JWKS, `hd`-claim employee check, a **7-day offline grace window**, and `safeStorage`-
  encrypted session. **Fail-open until configured** (off when unconfigured / `PANELMAKER_DEV_BYPASS=1`
  / unpackaged), so dev, CI, and the web preview are unaffected. The gate lives entirely in the main
  process; the renderer only reads status via `license:*` IPC. Setup in `LICENSING.md`.

### Edit-on-canvas single-line + catalogue pipeline (same branch, latest)

- **Unified single-line canvas (`screens/sld/BuildingSingleLine.tsx`):** every panel on ONE
  @xyflow/react canvas with zoom-driven LOD — a summary card zoomed out, the full internal
  schematic up close (colourised Indonesian **R-S-T / N / PE** bus). It's the primary editing
  surface: drag the palette onto a panel (adds a way) or blank canvas (adds a panel/load),
  **double-click** a component to edit it (`CircuitEditor`), **right-click** for compatible
  **replacement parts** (breaker ratings ≥ design current, cable sections ≥ present size), drag a
  panel's round **outlet** onto another panel to create a **feeder**, and Delete / right-click to
  disconnect or delete panels & loads. The old standalone Panel Editor is now a right-side
  **inspector drawer** (`PanelEditor`). The detail busbar (`PanelSld`, `nodes.tsx`) shows the same
  R-S-T rails.
- **Loads live OUTSIDE the panel:** each non-feeder way's load is its own node, parented to its
  panel (React Flow `parentId`) so it drags with the panel and the drop cable stays straight and a
  **fixed distance below the card at every zoom** (the card reserves its schematic height so it
  never grows over the loads). Each drop line is labelled with the cable size + loading %.
  **Floating loads** drag from the palette onto blank canvas; dropping one near a panel
  **snaps + auto-wires** it (creates the prerequisite MCB). Panels + loads snap to a grid; a
  **PLN grid-supply node** is drawn above each utility-fed panel (the MDP) feeding its incomer.
- **Catalogue → database pipeline:** the committed, versioned JSON dataset
  (`src/shared/data/catalog/schneider.parts.json`, validated + projected to `Part` by
  `data/catalog/index.ts`, seeded idempotently by SKU) holds **verified Schneider parts** (Acti9
  iC60N MCBs, iID RCCBs, ComPacT NSX MCCBs, TeSys LC1D/LRD, Harmony XB5, METSECT5 CTs). A pure-Python
  **pdfplumber extractor** (`scripts/extract_catalogue.py --auto-json`) auto-categorises a whole
  catalogue PDF into the schema and is **bundled as a PyInstaller binary in CI** (`resources/extractor/`,
  spawned by the main process — no Python on end-user machines). In-app **import** (JSON/CSV/PDF)
  routes parts to the catalog and prices to the **pricelist** (prices NEVER enter the committed parts
  dataset); a DB→git **export** re-emits the JSON. Catalogue codes are convenience references — the
  dataset and exports stamp a *verify-against-the-datasheet* disclaimer.
- **Usability:** a floating **canvas gesture guide** (`screens/sld/CanvasHelp.tsx`) lists the
  direct-manipulation gestures, and the circuit editor shows a plain-language **"why these sizes"**
  note (governing constraint: ampacity vs voltage-drop vs manual override) from the engine's
  existing `cable.appliedRule`/`vdDriven`; the project BOM moved to a side drawer. Both localised.
- **Release hygiene:** `.github/workflows/release.yml` has a `concurrency: group=release` guard so
  back-to-back publishes can't race on the GitHub Release assets and break auto-update.

## README

See `README.md` for the product overview and the PUIL sizing rules summary. Results are
engineering estimates — the app stamps a "verify against PUIL 2011" disclaimer on exports.
