/**
 * Control-schematic persistence. A schematic belongs to a circuit; saving
 * replaces it wholesale. Each rung/symbol/connection is stored as a row whose
 * `payload_json` holds the serialized domain object, so the load round-trip is
 * exact (including manual rungs and device cross-references).
 */

import { eq } from 'drizzle-orm';
import type {
  ControlSchematic,
  SchematicConnection,
  SchematicRung,
  SchematicSymbol,
} from '@shared/types';
import { getDb, type Db } from '../db/connection';
import {
  controlSchematics,
  schematicConnections,
  schematicRungs,
  schematicSymbols,
} from '../db/schema';

/** Stable schematic header id derived from the owning circuit. */
function headerId(circuitId: string): string {
  return `sch-${circuitId}`;
}

/** Upsert a schematic, fully replacing its rungs/symbols/connections. */
export function saveSchematic(schematic: ControlSchematic, db: Db = getDb()): { id: string } {
  const id = headerId(schematic.circuitId);

  db.transaction((tx) => {
    // Replace any existing schematic for this circuit (cascades to children).
    tx.delete(controlSchematics).where(eq(controlSchematics.circuitId, schematic.circuitId)).run();
    tx.insert(controlSchematics)
      .values({ id, circuitId: schematic.circuitId, name: null, payloadJson: null })
      .run();

    schematic.rungs.forEach((rung, i) => {
      tx.insert(schematicRungs)
        .values({ id: rung.id, schematicId: id, orderIndex: rung.order ?? i, payloadJson: JSON.stringify(rung) })
        .run();
    });
    for (const sym of schematic.symbols) {
      tx.insert(schematicSymbols)
        .values({ id: sym.id, schematicId: id, rungId: sym.rungId, payloadJson: JSON.stringify(sym) })
        .run();
    }
    for (const conn of schematic.connections) {
      tx.insert(schematicConnections)
        .values({
          id: conn.id,
          schematicId: id,
          fromSymbolId: conn.fromSymbolId,
          toSymbolId: conn.toSymbolId,
          payloadJson: JSON.stringify(conn),
        })
        .run();
    }
  });

  return { id };
}

/** Load a circuit's schematic, or `null` if none has been saved. */
export function loadSchematic(circuitId: string, db: Db = getDb()): ControlSchematic | null {
  const header = db
    .select()
    .from(controlSchematics)
    .where(eq(controlSchematics.circuitId, circuitId))
    .get();
  if (!header) return null;

  const rungRows = db.select().from(schematicRungs).where(eq(schematicRungs.schematicId, header.id)).all();
  const symRows = db
    .select()
    .from(schematicSymbols)
    .where(eq(schematicSymbols.schematicId, header.id))
    .all();
  const connRows = db
    .select()
    .from(schematicConnections)
    .where(eq(schematicConnections.schematicId, header.id))
    .all();

  const rungs = rungRows
    .map((r) => JSON.parse(r.payloadJson ?? '{}') as SchematicRung)
    .sort((a, b) => a.order - b.order);
  const symbols = symRows.map((s) => JSON.parse(s.payloadJson ?? '{}') as SchematicSymbol);
  const connections = connRows.map((c) => JSON.parse(c.payloadJson ?? '{}') as SchematicConnection);

  return { circuitId, rungs, symbols, connections };
}

/** Remove a circuit's saved schematic. */
export function deleteSchematic(circuitId: string, db: Db = getDb()): void {
  db.delete(controlSchematics).where(eq(controlSchematics.circuitId, circuitId)).run();
}
