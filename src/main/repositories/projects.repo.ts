/**
 * Project persistence. A project is an aggregate root owning panels, which own
 * circuits. Saving replaces the panel/circuit graph atomically (delete + insert
 * within a transaction) so the stored shape always matches the supplied model
 * and the load round-trip is exact.
 */

import { eq } from 'drizzle-orm';
import type { ProjectInput } from '@shared/types/project';
import type { ProjectSummary } from '@shared/ipc-contract';
import { getDb, type Db } from '../db/connection';
import { circuits, panels, projects } from '../db/schema';
import {
  assembleProject,
  circuitToRow,
  panelToRow,
  rowToCircuit,
  rowToPanel,
} from './mappers';

const APP_VERSION = '0.1.0';

/** Current ISO timestamp. */
function now(): string {
  return new Date().toISOString();
}

/**
 * Upsert a project and fully replace its panels/circuits. Returns the saved id.
 */
export function saveProject(project: ProjectInput, db: Db = getDb()): { id: string } {
  const ts = now();

  db.transaction((tx) => {
    const existing = tx
      .select({ id: projects.id, createdAt: projects.createdAt })
      .from(projects)
      .where(eq(projects.id, project.id))
      .all();

    if (existing.length === 0) {
      tx.insert(projects)
        .values({
          id: project.id,
          name: project.name,
          createdAt: ts,
          updatedAt: ts,
          appVersion: APP_VERSION,
          earthingSystem: project.earthingSystem ?? null,
        })
        .run();
    } else {
      tx.update(projects)
        .set({ name: project.name, updatedAt: ts, earthingSystem: project.earthingSystem ?? null })
        .where(eq(projects.id, project.id))
        .run();
    }

    // Replace the whole panel/circuit graph. ON DELETE CASCADE removes the
    // children of removed panels; we delete panels explicitly to also drop
    // panels no longer present in the model.
    tx.delete(panels).where(eq(panels.projectId, project.id)).run();

    for (const panel of project.panels) {
      tx.insert(panels).values(panelToRow(panel, project.id)).run();
      panel.circuits.forEach((c, i) => {
        tx.insert(circuits).values(circuitToRow(c, panel.id, i, panel.system)).run();
      });
    }
  });

  return { id: project.id };
}

/** Load a full project graph, or `null` when it does not exist. */
export function loadProject(id: string, db: Db = getDb()): ProjectInput | null {
  const projectRow = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!projectRow) return null;

  const panelRows = db.select().from(panels).where(eq(panels.projectId, id)).all();

  const builtPanels = panelRows.map((pr) => {
    const circuitRows = db
      .select()
      .from(circuits)
      .where(eq(circuits.panelId, pr.id))
      .all()
      .sort((a, b) => a.orderIndex - b.orderIndex);
    return rowToPanel(pr, circuitRows.map(rowToCircuit));
  });

  return assembleProject(projectRow.id, projectRow.name, builtPanels, projectRow.earthingSystem);
}

/** List all projects as lightweight summaries. */
export function listProjects(db: Db = getDb()): ProjectSummary[] {
  const rows = db.select().from(projects).all();
  return rows.map((r) => {
    const panelCount = db
      .select({ id: panels.id })
      .from(panels)
      .where(eq(panels.projectId, r.id))
      .all().length;
    const summary: ProjectSummary = {
      id: r.id,
      name: r.name,
      updatedAt: r.updatedAt,
      panelCount,
    };
    if (r.client) summary.client = r.client;
    if (r.location) summary.location = r.location;
    return summary;
  });
}

/** Delete a project (cascades to panels/circuits). */
export function deleteProject(id: string, db: Db = getDb()): { deleted: boolean } {
  const res = db.delete(projects).where(eq(projects.id, id)).run();
  return { deleted: res.changes > 0 };
}
