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
```

**Releasing (only when the user says "publish").** The release is cut by CI, not locally:

1. Run the workflow's EXACT gate first: `npx tsc --noEmit -p tsconfig.json` (the FULL scope —
   it includes `tests/`, which the per-commit web/node typechecks do not) + `npx vitest run`.
2. Bump the version (`npm version X.Y.Z --no-git-tag-version`), commit `Release vX.Y.Z: …`, push.
3. Trigger `.github/workflows/release.yml` via **workflow_dispatch with `publish=true`** on this
   branch (GitHub MCP `actions_run_trigger`). The sandbox git credential can push `claude/*`
   branches but NOT tags (HTTP 403) — the workflow creates and pushes the `vX.Y.Z` tag itself.
4. Verify: the run concludes `success` AND the release at that tag carries all three assets —
   `PanelMaker-X.Y.Z-setup.exe`, its `.blockmap`, and `latest.yml` (the auto-update feed).

**Version number is Claude's call** (user-delegated): patch (`0.1.x`) for fixes/small UX
batches, minor (`0.x.0`) when a batch meaningfully expands the design domain (new engineering
capabilities, model/DB additions). electron-updater only needs the number to increase.

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

Active branch: `claude/trusting-lovelace-fflrn3`; last published release **v0.1.43**; full suite green.

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

### Edit-on-canvas single-line + catalogue pipeline (same branch)

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

### Multi-manufacturer catalogue + order codes + more UX (released as v0.1.42)

- **Multi-manufacturer catalogue (`src/shared/data/catalog/`):** the loader is now a **registry of
  per-brand JSON files** merged + de-duplicated by SKU (`CATALOG_SOURCES` in `index.ts`;
  `loadCatalog(file, brand)` stamps `Part.manufacturer`). Adding a brand = one JSON file + one line.
  Current sources (**~492 verified parts**, every code transcribed from manufacturer/distributor
  listings — never pattern-generated; conflicting values omitted): **Schneider** (139), **Mitsubishi**
  (63), **LS Electric** (42), **ABB** (69), **Legrand** (92), **Chint** (71), and **generic cables**
  (NYY/NYM/NYA/NYAF/BC across the SNI ladder — type+size refs, no brand). Exports: `CATALOG_PARTS` /
  `CATALOG_ISSUES` (all brands) + the back-compat `SCHNEIDER_CATALOG_*`; the test gate asserts every
  dataset validates with **globally-unique SKUs**. Seed + renderer defaults load all brands.
- **Inline order codes + BOM matcher (`engine/bom.ts`):** `circuitOrderCodes(circuit, parts)` (same
  matcher the BOM uses) surfaces the matched SKU **inline** — on the circuit editor, the single-line
  MCB hover, and the load node. `matchBreakerPart` now ranks on **class/poles/curve**, not just rating
  (a rating-only match grabbed wrong-pole parts once the 1P–4P × B/C/D matrix existed).
- **Brand selector (`partsForBrand` + store `preferredBrand`):** a brand picker (in the project-BOM
  drawer) scopes which manufacturer's order codes are used **everywhere** — the BOM table + CSV/Excel
  export, the inline codes, the estimated cost, and the **quotation PDF** (passed brand-filtered parts
  from the renderer). Generic cables stay available. The active brand shows as a canvas chip. NOTE: the
  *system* PDF carries no catalog order codes (engine-computed), so the brand filter doesn't apply there.
- **More UX:** a **project-wide Issues drawer** (`features/issues/ProjectIssues.tsx`) aggregates every
  panel's warnings with a **"fix all safe"** pass (applies `set-cable` / `clear-breaker-override`); a
  React Flow **MiniMap** on the canvas; and **Export PDF / Save** added to the **⌘K command palette**
  (`features/CommandPalette.tsx`, already existed). All localised EN + ID.

### UX batch after v0.1.42 (same branch)

- **Per-circuit cable type:** `CircuitInput.cableType` (NYY/NYM/NYA/NYAF select in the circuit
  editor) wins over the panel default (NYY 3ph / NYM 1ph, N2XY XLPE, NAYY/NA2XY Al); the effective
  construction is reported as `GroundingResult.cableType` and `matchCablePart` **prefers parts of
  that `attributes.type`** (section-only fallback). Sizing itself is unchanged — it's a label +
  BOM/order-code concern (`tests/engine/cableType.test.ts`).
- **Cascade delete-confirm:** React Flow `onBeforeDelete` + the panel context menu route through a
  modal naming the sub-panels that would be orphaned (pure `lib/panelTree.ts` `fedSubPanelNames`);
  leaf panels still delete with no extra click.
- **Export all deliverables:** one action emits the system PDF + consolidated BOM `.xlsx` +
  cable-schedule `.csv` + per-panel SLD/GA `.dxf`. Pure manifest in `lib/deliverables.ts`;
  orchestration in `lib/exportAll.ts`. Desktop picks ONE folder via new `dialog:chooseDirectory` +
  `export:writeFile` IPC (no zip dep, no per-file dialogs); web falls back to sequential downloads
  (PDF is desktop-only). Button on SystemView + ⌘K command.
- **Save-as-template:** right-click a panel → "Save as template…"; snapshots (feeder ways/links
  stripped, fresh ids on stamp) persist via localStorage across projects (`lib/userTemplates.ts`,
  store `userTemplates` + actions) and appear under **"My templates"** in the Add-panel menu with
  per-template delete.
- **Parts Catalog brand filter:** clearable/searchable brand Select (derived from loaded parts)
  combinable with the text search. Everything above localised EN + ID; suite at 434 tests.

### Canvas-workflow audit fixes (same branch)

- **One service entrance:** the PLN intake/meter/SPD/PFC chrome hangs only on the service root
  (`serviceRootId` in `lib/panelTree.ts`: utility root with feeder children → highest demand →
  first); other standalone roots show an orange **"not connected"** badge. Refused feeder connects
  now **toast why** (`connectPanelAsFeeder` returns a `ConnectFeederResult`). The sub-panel card
  dropped on empty canvas lands AT the drop point with an honest "not fed yet" message.
- **Spare ways are first-class:** `LoadKind 'spare'` (zero demand, no RCD/conduit/cable in
  BOM/schedule — schedule prints SPARE), `CircuitResult.loadKind`, palette Spare card, and a
  right-click **"Add recommended spares (N)"** (engine recommendation now based on ACTIVE modules +
  `spareWaysPresent`, so it converges).
- **Canvas context menu** gained **Panel settings…** and **Auto-balance phases** (3-ph).
- **Blank project:** `newProject(name, 'blank'|'sample')` — Projects screen leads with a blank
  start (one empty MDP); the demo building is its own tile/menu item.
- **ONE editing surface:** the inspector drawer's "Build" tab (the old per-panel `VisualBuilder`
  canvas, plus its `SourceEditor`) was **deleted** — its exclusive features all moved to the
  unified canvas / Sources screen / Panel settings. The drawer leads with the circuit table.
- Unique panel names by construction; `addCircuit` default aligned with the palette (2 kW);
  help-legend Delete line corrected; dead `'panel'` ⌘K nav entry removed. Suite at 445 tests.

### Palette + hybrid backup (same branch)

- **Palette = standards:** every load card derives cos φ + demand factor from `LOAD_DEFAULTS`
  (`loadCard()` helper) — no hand-coded values that drift from the wizard/table; `FloatingLoad`
  carries `demandFactor` so drop-on-canvas wiring equals drop-on-panel. New cards: **Water heater**
  (`heating`), **UPS / IT load** (`ups`), and an **Energy sources** section (generator / solar PV /
  battery) that enables the project-level source (defaults shared via `data/sourceDefaults.ts`)
  and shows it as a badge on the PLN service head. PLN + inverter are deliberately NOT cards
  (auto: service root / sized inside the solar+battery designs). **Elevator / lift machine room**
  panel template (11 kW VFD hoist, heavy duty + EN 81 ancillaries). 'fed' badge now requires a
  REAL parent feeder (template-stamped panels read "not connected").
- **Essential (genset-backed) panels:** `PanelInput.essential` (right-click toggle, yellow chip;
  persisted via a real `panels.essential` column). Genset backup demand = the essential panels'
  actual aggregate demand (topmost-only, no double-count; `backupFraction` fallback), motor-start
  dip assessed on the essential subtree only, the power one-line splits an **Essential bus**
  behind the ATS (battery backs it), plus a genset↔PV derate interlock. Warnings:
  `essential-no-backup`, `pv-exceeds-service` (PLN rooftop cap vs daya tersambung). Also fixed:
  `circuits.cable_type` column (cableType silently vanished on desktop save/load). Suite at 454.

### Phases, life-safety, three-tier backup, dual transformer (same branch)

- **Motor phase fix + explicit phases:** `circuitIsThreePhase` no longer forces 3φ just because a
  starter exists (a 1-ph motor has a DOL contactor too); `CircuitInput.phases (1|3)` overrides the
  size-based inference for ANY load kind (editor "Supply phase" select; `circuits.phases` column;
  carried through `FloatingLoad`). Palette: Pump (1φ)/(3φ), Custom load (1φ)/(3φ) replace the old
  single cards; warning `single-phase-large-motor` (> ~4 kW forced 1φ).
- **Life-safety circuits (`CircuitInput.lifeSafety`, `circuits.life_safety`):** no RCD even on TT
  (availability prevails — the old behavior put an RCD on a fire pump), default **FRC** cable (new
  CableType + generic FRC catalog ladder), warnings `life-safety-cable` (explicit non-FRC),
  `life-safety-no-backup`, `life-safety-not-backed` (outside the essential bus),
  `life-safety-manual-transfer`. Palette: **Fire pump** card; also **Industrial socket (3φ)**.
- **Three-tier backup:** `PanelInput.upsBacked` (`panels.ups_backed`) = the **critical/UPS tier**:
  battery sizes from the marked panels' actual demand (mirrors `essential`→genset; the shared
  topmost-flagged-demand helper is generalised), one-line draws a **UPS/critical bus** charged from
  the essential bus, warning `critical-no-battery`. Generator gains `transfer: 'ats'|'manual'`
  (COS — one-line + service-head badge + interlock notes adapt).
- **Tenant sub-metering:** `PanelInput.submeter` (`panels.submeter`) → `submeterFor(demandA)`
  picks direct vs CT (`PanelResult.submeter`), kWh/CT badge on the card, meter + 3 CTs in the BOM.
- **Secondary SPDs:** sub-boards > `SECONDARY_SPD_DISTANCE_M` (10 m) of feeder from the origin get
  a Type 2 recommendation (`PanelResult.spd`) drawn on their canvas bus.
- **Dual transformer (`ProjectMeta.dualTransformer`, Switch on the supply card):** forces MV (even
  < 200 kVA) with **2× half-demand transformers** on split bus sections behind a **normally-open
  coupler** (one-line draws T1/T2 + `il-coupler` interlock; fault study correctly uses ONE unit).
- **Canvas clipboard:** Shift-click/Shift-drag select; **Ctrl+C/Ctrl+V** copies panels (template
  machinery: fresh ids, feeders stripped, unique "(copy)" names, one undo step), way circuits and
  floating loads, pasted offset. Suite at 474.

### Selection & gestures (released as v0.1.43)

- **Visible selection:** clicked/box-selected nodes draw an indigo halo (`SELECT_RING` box-shadow,
  stacks under hover so error borders still read) — what's lit is what Ctrl+C copies. The
  display-only PLN grid node is `selectable: false`.
- **Paste at the cursor:** the canvas tracks the last mouse position; pasted panels/floats anchor
  their group there (relative layout preserved, grid-snapped; offset-from-original fallback), and
  copied way circuits land in the panel **nearest the cursor** (`nearestPanelId`, same box-distance
  rule as drag-to-wire), falling back to their source panel.
- **CAD gesture scheme (deliberate change):** `selectionOnDrag` + `SelectionMode.Partial` — plain
  left-drag on empty canvas is a crossing-window box select; **pan = middle-drag or trackpad scroll
  (`panOnScroll`), zoom = Ctrl+scroll / pinch**. Right button stays reserved for context menus.
  The "?" help legend documents the scheme; revert = drop `selectionOnDrag`/`panOnScroll`.
- **v0.1.43 released** via workflow_dispatch publish (see Releasing above): all three assets
  verified on the GitHub Release; CI gate caught that the full `tsconfig.json` typecheck also
  covers `tests/` — run it before tagging.

## README

See `README.md` for the product overview and the PUIL sizing rules summary. Results are
engineering estimates — the app stamps a "verify against PUIL 2011" disclaimer on exports.
