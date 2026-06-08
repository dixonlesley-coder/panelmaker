/**
 * Parts catalog persistence.
 */

import { eq } from 'drizzle-orm';
import type { Part } from '@shared/types/parts';
import { getDb, type Db } from '../db/connection';
import { parts } from '../db/schema';
import { partToRow, rowToPart } from './mappers';

/** List every catalog part. */
export function listParts(db: Db = getDb()): Part[] {
  return db.select().from(parts).all().map(rowToPart);
}

/** Fetch a single part by id, or `null`. */
export function getPart(id: string, db: Db = getDb()): Part | null {
  const row = db.select().from(parts).where(eq(parts.id, id)).get();
  return row ? rowToPart(row) : null;
}

/** Insert or update a part (by id) and return the stored value. */
export function upsertPart(part: Part, db: Db = getDb()): Part {
  const row = partToRow(part);
  const exists = db.select({ id: parts.id }).from(parts).where(eq(parts.id, part.id)).get();
  if (exists) {
    db.update(parts).set(row).where(eq(parts.id, part.id)).run();
  } else {
    db.insert(parts).values(row).run();
  }
  // Read back the canonical stored row so the returned value reflects defaults.
  return getPart(part.id, db) ?? part;
}

/** Bulk-insert parts, skipping ids that already exist (used by the seeder). */
export function insertPartsIfAbsent(list: Part[], db: Db = getDb()): number {
  let inserted = 0;
  db.transaction((tx) => {
    for (const part of list) {
      const exists = tx.select({ id: parts.id }).from(parts).where(eq(parts.id, part.id)).get();
      if (!exists) {
        tx.insert(parts).values(partToRow(part)).run();
        inserted += 1;
      }
    }
  });
  return inserted;
}

/** Count of stored parts (used to decide whether to seed). */
export function partsCount(db: Db = getDb()): number {
  return db.select({ id: parts.id }).from(parts).all().length;
}
