/**
 * Stable per-machine identifier.
 *
 * On first use a random UUID is generated and persisted to `machine.id` in the
 * app's data directory; thereafter it is read back. The returned id hashes that
 * stored UUID together with the host's `hostname`/`platform`, so it is stable
 * across launches on the same machine but does not leak the raw hostname. It is
 * stored with the session and checked on every launch (`session.ensureLicensed`),
 * so a `license.json` copied to another machine is rejected.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, platform } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Resolve the directory that holds `machine.id`. Uses Electron's `userData`
 * directory when available; otherwise the current working directory (tests /
 * tooling). Electron is required lazily so this module imports cleanly in plain
 * Node.
 */
function dataDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron');
    const app = electron.app;
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // Not running under Electron — fall through.
  }
  return process.cwd();
}

/** Read the persisted machine UUID, generating + storing one on first use. */
function getOrCreateRawUuid(): string {
  const file = join(dataDir(), 'machine.id');
  try {
    if (existsSync(file)) {
      const existing = readFileSync(file, 'utf-8').trim();
      if (existing) return existing;
    }
  } catch {
    // Fall through to (re)create.
  }
  const uuid = randomUUID();
  try {
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(file, uuid, 'utf-8');
  } catch {
    // If we cannot persist (read-only FS), the id is non-stable but still works
    // for this session — acceptable degradation.
  }
  return uuid;
}

/**
 * Combine a raw UUID with host facts into a stable, opaque id. Exposed for
 * testing (deterministic given the same inputs); production callers use
 * {@link getMachineId}.
 */
export function deriveMachineId(rawUuid: string, host: string, plat: string): string {
  return createHash('sha256').update(`${rawUuid}|${host}|${plat}`).digest('hex');
}

/**
 * The stable per-machine id: `sha256(storedUuid | hostname | platform)`.
 * Deterministic across launches on the same machine.
 */
export function getMachineId(): string {
  return deriveMachineId(getOrCreateRawUuid(), hostname(), platform());
}
