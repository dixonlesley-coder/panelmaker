/**
 * Persistent, encrypted licensing session store.
 *
 * The session lives in `license.json` in the app's `userData` directory. The
 * sensitive part — the Google refresh token — is encrypted at rest with
 * Electron's `safeStorage` (OS keychain: Keychain on macOS, DPAPI on Windows,
 * libsecret on Linux) when available. If the OS keychain is unavailable,
 * `safeStorage.isEncryptionAvailable()` is false and we fall back to storing the
 * token in plaintext, with a console warning. Everything else (email, hd,
 * machineId, lastVerifiedAtMs) is stored in clear since it is not secret.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The in-memory session record. */
export interface LicenseSession {
  /** The signed-in user's email. */
  email: string;
  /** The hosted (Workspace) domain. */
  hd: string;
  /** The machine this session was established on (copy-detection aid). */
  machineId: string;
  /** Google OAuth refresh token (used for silent online re-verification). */
  refreshToken: string;
  /** Epoch ms of the last successful online verification. */
  lastVerifiedAtMs: number;
}

/** On-disk shape: the refresh token is split out and possibly encrypted. */
interface StoredSession {
  email: string;
  hd: string;
  machineId: string;
  lastVerifiedAtMs: number;
  /** Base64 of the (possibly encrypted) refresh token. */
  refreshToken: string;
  /** Whether `refreshToken` is `safeStorage`-encrypted (vs. plaintext base64). */
  refreshTokenEncrypted: boolean;
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

/** Encrypt the refresh token, returning the ciphertext + whether it is encrypted. */
function encryptToken(token: string): { value: string; encrypted: boolean } {
  const safeStorage = getSafeStorage();
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return { value: safeStorage.encryptString(token).toString('base64'), encrypted: true };
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[panelmaker] safeStorage unavailable — storing the licensing refresh token unencrypted.',
  );
  return { value: Buffer.from(token, 'utf-8').toString('base64'), encrypted: false };
}

/** Decrypt a stored refresh token; returns '' if it cannot be recovered. */
function decryptToken(stored: StoredSession): string {
  try {
    const buf = Buffer.from(stored.refreshToken, 'base64');
    if (!stored.refreshTokenEncrypted) return buf.toString('utf-8');
    const safeStorage = getSafeStorage();
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    return '';
  } catch {
    return '';
  }
}

/** Load the persisted session, or `null` if none / unreadable. */
export function loadSession(): LicenseSession | null {
  try {
    const file = sessionFile();
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<StoredSession>;
    if (
      typeof parsed.email !== 'string' ||
      typeof parsed.hd !== 'string' ||
      typeof parsed.machineId !== 'string' ||
      typeof parsed.lastVerifiedAtMs !== 'number' ||
      typeof parsed.refreshToken !== 'string'
    ) {
      return null;
    }
    const stored: StoredSession = {
      email: parsed.email,
      hd: parsed.hd,
      machineId: parsed.machineId,
      lastVerifiedAtMs: parsed.lastVerifiedAtMs,
      refreshToken: parsed.refreshToken,
      refreshTokenEncrypted: parsed.refreshTokenEncrypted === true,
    };
    return {
      email: stored.email,
      hd: stored.hd,
      machineId: stored.machineId,
      lastVerifiedAtMs: stored.lastVerifiedAtMs,
      refreshToken: decryptToken(stored),
    };
  } catch {
    return null;
  }
}

/** Persist the session, encrypting the refresh token when possible. */
export function saveSession(session: LicenseSession): void {
  const { value, encrypted } = encryptToken(session.refreshToken);
  const stored: StoredSession = {
    email: session.email,
    hd: session.hd,
    machineId: session.machineId,
    lastVerifiedAtMs: session.lastVerifiedAtMs,
    refreshToken: value,
    refreshTokenEncrypted: encrypted,
  };
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
