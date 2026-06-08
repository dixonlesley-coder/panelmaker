# PanelMaker

An **offline desktop application** for designing low-voltage electrical panels and
whole-building distribution systems to **Indonesian PUIL 2011** (harmonised with
IEC 60364 / IEC 60947).

From a panel's loads PanelMaker automatically sizes **cables, MCB/MCCB protection,
and busbars**, designs **motor-control & pump/level circuits** (DOL, Star-Delta,
Reversing, Soft-starter, VFD, ATS, water-level pump control) with **interlocks**,
estimates the **enclosure** (W×H×D, sheet thickness, ventilation), **prices** the
build from an imported pricelist, **validates** the design (highlighting
overcapacity / mismatched / wrong components and suggesting replacements), links
panels into a **whole-building single-line diagram**, and exports **PDF per panel
and per system**.

100% offline — no internet, CDNs, or external services required at runtime.

## Architecture

```
src/
  shared/            Pure, framework-free TypeScript shared by all processes
    standards/       Versioned PUIL 2011 / IEC reference data (KHA, breakers,
                     busbar, enclosure, motor FLC, contactor AC-3, VFD, starter
                     & pump templates) — stamped with STANDARDS_VERSION
    types/           Domain & engine input/result types
    engine/          Pure calculation engine (unit-tested):
                       loadCurrent · derating · cableSizing · voltageDrop ·
                       breakerSelect · busbar · enclosure · costing ·
                       warnings · recommendations · computePanel · computeSystem ·
                       control/ (motorFLC, selectContactor, selectOverload,
                       sizeControlTransformer, selectVFD, applyStarterTemplate,
                       pumpControl)
  main/              Electron main process: SQLite (better-sqlite3 + Drizzle),
                     repositories, services (calc, pdf export), IPC handlers
  preload/           contextBridge-exposed typed `window.api`
  renderer/          React 18 + Mantine v7 UI; @xyflow/react diagrams; Zustand store
```

The renderer drives the **pure engine directly** for instant feedback; the main
process re-runs it authoritatively and persists to SQLite. The calculation engine
imports nothing from Node or the DOM, so it is trivially unit-testable and reused
in both processes.

### The sizing rules (PUIL 2011 / IEC 60364)

- Conductor sizing: `Ib ≤ In ≤ Iz`, with cable KHA ≥ **125%** of the design current
  and PUIL minimum sections (final ≥ 2.5 mm², main/trunk ≥ 4 mm²).
- Voltage drop limits: **5%** general / **3%** lighting (SNI IEC 60364-5-52).
- Motor control: contactor by **AC-3** rating (IEC 60947-4-1), with the
  star-delta **58%** winding rule and AC-4 derating; overload set to FLC; control
  transformer sized by combined sealed + inrush VA.
- Whole-building: sub-panel diversified demand is aggregated upstream onto each
  parent feeder (radial tree; feeder cycles are rejected).

> Results are engineering estimates — always verify against PUIL 2011 and
> manufacturer data before construction.

## Development

Requirements: Node ≥ 20.

```bash
npm install            # install dependencies
npm test               # run the engine unit tests (Vitest)
npm run typecheck      # strict TypeScript check
npm run dev            # run the renderer as a web app (Vite)
npm run build          # build the renderer (Vite)
```

The engine test suite (`tests/engine/**`) is the acceptance gate and runs fully
headlessly — it covers the PUIL worked examples, control-gear sizing, whole-system
aggregation, and the validation/replacement suggestions.

## Status

This is an in-progress build. The calculation engine + standards data and the
test suite are complete; the renderer UI and the Electron/SQLite persistence layer
are being assembled on top of them.

## License

MIT
