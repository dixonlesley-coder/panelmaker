/**
 * Opens the local SQLite database and returns a Drizzle instance bound to the
 * schema. The DB lives in Electron's per-user data directory; when running
 * outside Electron (tests / type-checking / CLI tooling) it falls back to a
 * file under the current working directory so nothing depends on the Electron
 * binary being present.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { schema } from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Resolve the database file path. Uses Electron's `userData` directory when
 * available; otherwise a `.panelmaker` dir under `process.cwd()`.
 */
function resolveDbPath(): string {
  // Lazily/optionally require Electron so this module imports cleanly in plain
  // Node. The Electron binary may be absent in headless environments.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron');
    const app = electron.app;
    if (app && typeof app.getPath === 'function') {
      return join(app.getPath('userData'), 'panelmaker.db');
    }
  } catch {
    // Not running under Electron — fall through to the cwd fallback.
  }
  return join(process.cwd(), '.panelmaker', 'panelmaker.db');
}

let cached: { db: Db; sqlite: Database.Database } | undefined;

/** Open (or reuse) the SQLite connection and return a Drizzle instance. */
export function getDb(): Db {
  return getConnection().db;
}

/** Open (or reuse) the connection, exposing the raw better-sqlite3 handle too. */
export function getConnection(): { db: Db; sqlite: Database.Database } {
  if (cached) return cached;

  const file = resolveDbPath();
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(file);
  // Write-Ahead Logging gives better concurrency and crash resilience.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  cached = { db, sqlite };
  return cached;
}

/** Close the connection (mainly for tests / clean shutdown). */
export function closeDb(): void {
  if (cached) {
    cached.sqlite.close();
    cached = undefined;
  }
}
