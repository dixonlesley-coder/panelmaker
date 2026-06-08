/**
 * Pricelist persistence. A pricelist is a named set of priced rows, each
 * optionally bound to a catalog part. `priceMap` produces the part-id ->
 * unit-price lookup the costing engine consumes.
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { PricelistRowInput, ImportPricelistResult } from '@shared/ipc-contract';
import { getDb, type Db } from '../db/connection';
import { pricelistItems, pricelists } from '../db/schema';

/** Import a pricelist (one row per item). Returns the new id + row count. */
export function importPricelist(
  name: string,
  rows: PricelistRowInput[],
  currency = 'IDR',
  sourceFile?: string,
  db: Db = getDb(),
): ImportPricelistResult {
  const pricelistId = randomUUID();
  const importedAt = new Date().toISOString();

  db.transaction((tx) => {
    tx.insert(pricelists)
      .values({
        id: pricelistId,
        name,
        currency,
        sourceFile: sourceFile ?? null,
        importedAt,
      })
      .run();

    for (const r of rows) {
      tx.insert(pricelistItems)
        .values({
          id: randomUUID(),
          pricelistId,
          partId: r.partId ?? null,
          matchKey: r.matchKey,
          unitPrice: r.unitPrice,
          currency: r.currency ?? currency,
        })
        .run();
    }
  });

  return { pricelistId, itemCount: rows.length };
}

/**
 * Build the part-id -> unit-price lookup for a pricelist. Only rows bound to a
 * part contribute (free-text rows are surfaced elsewhere for manual matching).
 */
export function priceMap(pricelistId: string, db: Db = getDb()): Record<string, number> {
  const rows = db
    .select()
    .from(pricelistItems)
    .where(eq(pricelistItems.pricelistId, pricelistId))
    .all();

  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.partId) map[r.partId] = r.unitPrice;
  }
  return map;
}

/** `priceMap` as a `Map`, which the engine's `costBom` expects. */
export function priceLookup(pricelistId: string, db: Db = getDb()): Map<string, number> {
  return new Map(Object.entries(priceMap(pricelistId, db)));
}

/** List all pricelists (metadata only). */
export function listPricelists(db: Db = getDb()) {
  return db.select().from(pricelists).all();
}
