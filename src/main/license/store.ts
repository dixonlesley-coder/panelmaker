/**
 * Persistent, encrypted licensing session store.
 *
 * The session lives in `license.json` in the app's `userData` directory. The
 * ENTIRE session record — refresh token, email/hd, machineId, the grace-window
 * anchor `lastVerifiedAtMs` and the monotonic clock high-water mark — is
 * encrypted as one blob with Electron's `safeStorage` (OS keychain: Keychain on
 * macOS, DPAPI on Windows, libsecret on Linux) when available. Encrypting the
 * whole record (rather than only the token) makes the grace timestamp and
 * machine id tamper-evident: hand-editing them, or copying the file to another
 * machine, yields a blob that fails to decrypt and is treated as "no session".
 *
 * If the OS keychain is unavailable, the record falls back to plaintext base64
 * with a console warning — graceful degradation for keychain-less Linux setups,
 * at the cost of the tamper protection above (the machineId check in session.ts
 * still catches plain file copies in that mode).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The in-memory session record. */
export interface LicenseSession {
  /** The signed-in user's email. */
  email: string;
  /** The hosted (Workspace) domain. */
  hd: string;
  /** The machine this session was established on (copy detection). */
  machineId: string;
  /** Google OAuth refresh token (used for silent online re-verification). */
  refreshToken: string;
  /** Epoch ms of the last successful online verification. */
  lastVerifiedAtMs: number;
  /**
   * Monotonic clock high-water mark: the largest wall-clock time (epoch ms) the
   * app has observed with this session. A current time earlier than this means
   * the system clock was rolled back — the offline-grace check refuses to count
   * rolled-back time (see `validate.withinOfflineGrace`).
   */
  clockHwmMs?: number;
  /** True for a demo/test session (password-based, no Google round-trip). */
  demo?: boolean;
}

/** On-disk v2 shape: the whole session JSON as one (possibly encrypted) blob. */
interface StoredFileV2 {
  v: 2;
  /** Base64 of the safeStorage-encrypted session JSON (or plain base64). */
  payload: string;
  /** Whether `payload` is `safeStorage`-encrypted (vs. plaintext base64). */
  encrypted: boolean;
}

/** Legacy (v1) on-disk shape: clear fields + a separately-encrypted token. */
interface StoredFileV1 {
  email: string;
  hd: string;
  machineId: string;
  lastVerifiedAtMs: number;
  refreshToken: string;
  refreshTokenEncrypted: boolean;
  demo?: boolean;
}

/** Resolve the `userData` directory (Electron) with a cwd fallback. */
function dataDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron');
    const app = electron.app;
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // Not under Electron — fall through.
  }
  return process.cwd();
}

/** Path to the session file. */
function sessionFile(): string {
  return join(dataDir(), 'license.json');
}

/** Lazily access Electron's `safeStorage`, or undefined outside Electron. */
function getSafeStorage(): typeof import('electron').safeStorage | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron');
    return electron.safeStorage;
  } catch {
    return undefined;
  }
}

/** Encrypt a string blob, returning base64 + whether it is really encrypted. */
function encryptBlob(plain: string): { value: string; encrypted: boolean } {
  const safeStorage = getSafeStorage();
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return { value: safeStorage.encryptString(plain).toString('base64'), encrypted: true };
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[panelmaker] safeStorage unavailable — storing the licensing session unencrypted.',
  );
  return { value: Buffer.from(plain, 'utf-8').toString('base64'), encrypted: false };
}

/** Decrypt a stored blob; returns '' if it cannot be recovered. */
function decryptBlob(value: string, encrypted: boolean): string {
  try {
    const buf = Buffer.from(value, 'base64');
    if (!encrypted) return buf.toString('utf-8');
    const safeStorage = getSafeStorage();
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    return '';
  } catch {
    return '';
  }
}

/** Validate + narrow a parsed session object; null when malformed. */
function asSession(parsed: unknown): LicenseSession | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const s = parsed as Partial<LicenseSession>;
  if (
    typeof s.email !== 'string' ||
    typeof s.hd !== 'string' ||
    typeof s.machineId !== 'string' ||
    typeof s.lastVerifiedAtMs !== 'number' ||
    typeof s.refreshToken !== 'string'
  ) {
    return null;
  }
  return {
    email: s.email,
    hd: s.hd,
    machineId: s.machineId,
    lastVerifiedAtMs: s.lastVerifiedAtMs,
    refreshToken: s.refreshToken,
    ...(typeof s.clockHwmMs === 'number' ? { clockHwmMs: s.clockHwmMs } : {}),
    ...(s.demo === true ? { demo: true } : {}),
  };
}

/** Read a legacy v1 file (pre-whole-blob encryption); null when not v1/invalid. */
function loadLegacyV1(parsed: Partial<StoredFileV1>): LicenseSession | null {
  if (
    typeof parsed.email !== 'string' ||
    typeof parsed.hd !== 'string' ||
    typeof parsed.machineId !== 'string' ||
    typeof parsed.lastVerifiedAtMs !== 'number' ||
    typeof parsed.refreshToken !== 'string'
  ) {
    return null;
  }
  return {
    email: parsed.email,
    hd: parsed.hd,
    machineId: parsed.machineId,
    lastVerifiedAtMs: parsed.lastVerifiedAtMs,
    refreshToken: decryptBlob(parsed.refreshToken, parsed.refreshTokenEncrypted === true),
    ...(parsed.demo === true ? { demo: true } : {}),
  };
}

/** Load the persisted session, or `null` if none / unreadable / tampered. */
export function loadSession(): LicenseSession | null {
  try {
    const file = sessionFile();
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as
      | Partial<StoredFileV2>
      | Partial<StoredFileV1>;

    if ((parsed as Partial<StoredFileV2>).v === 2) {
      const v2 = parsed as Partial<StoredFileV2>;
      if (typeof v2.payload !== 'string') return null;
      const plain = decryptBlob(v2.payload, v2.encrypted === true);
      if (!plain) return null; // wrong keychain / tampered blob → no session
      return asSession(JSON.parse(plain));
    }
    // Legacy v1 file: read once; the next saveSession migrates it to v2.
    return loadLegacyV1(parsed as Partial<StoredFileV1>);
  } catch {
    return null;
  }
}

/** Persist the session as one encrypted blob (v2 format). */
export function saveSession(session: LicenseSession): void {
  const { value, encrypted } = encryptBlob(JSON.stringify(session));
  const stored: StoredFileV2 = { v: 2, payload: value, encrypted };
  const file = sessionFile();
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(stored, null, 2), 'utf-8');
}

/** Remove the persisted session (sign-out / revocation). */
export function clearSession(): void {
  try {
    const file = sessionFile();
    if (existsSync(file)) rmSync(file);
  } catch {
    // Best-effort.
  }
}
