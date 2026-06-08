/**
 * IPC handler registration. Each channel from the shared contract is wired to a
 * repository/service call. Inputs are validated with zod at the boundary so the
 * main process never trusts renderer-supplied data blindly.
 *
 * Handlers return plain JSON-serialisable values (or throw, which `invoke`
 * surfaces as a rejected promise on the renderer side).
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Part } from '@shared/types/parts';
import type { ProjectInput } from '@shared/types/project';
import { IPC } from './channels';
import {
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
} from '../repositories/projects.repo';
import { listParts, upsertPart } from '../repositories/parts.repo';
import { importPricelist } from '../repositories/pricelists.repo';
import { computeProject } from '../services/calc.service';
import { exportPanelPdf, exportSystemPdf } from '../services/export.service';

/* ------------------------------- validators ------------------------------- */

const idSchema = z.string().min(1);

// The project graph is large; validate the structural essentials and trust the
// renderer (which builds it from the same shared types) for leaf field shapes.
const circuitSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    role: z.enum(['incomer', 'branch']),
    loadW: z.number(),
    cosPhi: z.number(),
    lengthM: z.number(),
    loadKind: z.string(),
    isLighting: z.boolean(),
    demandFactor: z.number(),
  })
  .passthrough();

const panelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    system: z.enum(['1ph', '3ph']),
    voltageV: z.number(),
    ambientTempC: z.number(),
    installMethod: z.string(),
    groupingCount: z.number(),
    diversityFactor: z.number(),
    sourceType: z.enum(['utility', 'feeder']),
    circuits: z.array(circuitSchema),
  })
  .passthrough();

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  panels: z.array(panelSchema),
});

const partSchema = z
  .object({
    id: z.string().min(1),
    category: z.string(),
    manufacturer: z.string(),
    model: z.string(),
    attributes: z.record(z.unknown()),
    defaultUnit: z.string(),
    standardsVersion: z.string().optional(),
  })
  .passthrough();

const pricelistRowSchema = z.object({
  partId: z.string().optional(),
  matchKey: z.string(),
  unitPrice: z.number(),
  currency: z.string().optional(),
});

/** Cast a zod-validated project to the domain type (shapes are compatible). */
function asProject(value: unknown): ProjectInput {
  return projectSchema.parse(value) as unknown as ProjectInput;
}

/**
 * Register every IPC handler. Call once during app startup (after the DB is
 * ready). Idempotent guard prevents duplicate registration on hot reload.
 */
let registered = false;
export function registerIpcHandlers(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle(IPC.listProjects, () => listProjects());

  ipcMain.handle(IPC.loadProject, (_e, id: unknown) => loadProject(idSchema.parse(id)));

  ipcMain.handle(IPC.saveProject, (_e, project: unknown) => saveProject(asProject(project)));

  ipcMain.handle(IPC.deleteProject, (_e, id: unknown) => deleteProject(idSchema.parse(id)));

  ipcMain.handle(IPC.computeProject, (_e, project: unknown) =>
    computeProject(asProject(project)),
  );

  ipcMain.handle(IPC.listParts, () => listParts());

  ipcMain.handle(IPC.upsertPart, (_e, part: unknown) =>
    upsertPart(partSchema.parse(part) as unknown as Part),
  );

  ipcMain.handle(
    IPC.importPricelist,
    (_e, name: unknown, rows: unknown, currency: unknown) =>
      importPricelist(
        z.string().min(1).parse(name),
        z.array(pricelistRowSchema).parse(rows),
        currency === undefined ? undefined : z.string().parse(currency),
      ),
  );

  ipcMain.handle(
    IPC.exportPanelPdf,
    (_e, project: unknown, panelId: unknown, filePath: unknown) =>
      exportPanelPdf(asProject(project), idSchema.parse(panelId), z.string().min(1).parse(filePath)),
  );

  ipcMain.handle(IPC.exportSystemPdf, (_e, project: unknown, filePath: unknown) =>
    exportSystemPdf(asProject(project), z.string().min(1).parse(filePath)),
  );
}
