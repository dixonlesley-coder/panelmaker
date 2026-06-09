/**
 * The licensing gate's high-level session logic, sitting on top of config,
 * store, googleAuth and verify.
 *
 *   - `ensureLicensed()` decides whether the app may start, applying the
 *     fail-open rules, silent online re-verification, and the 7-day offline
 *     grace window.
 *   - `runSignIn()` performs the interactive Google sign-in and persists a new
 *     session.
 *   - `signOut()` clears the stored session.
 *   - `getStatus()` reports the current state for the renderer's Settings UI.
 */

import {
  getLicensingConfig,
  isLicensingConfigured,
  licensingEnforced,
} from './config';
import { withinOfflineGrace } from './validate';
import { clearSession, loadSession, saveSession, type LicenseSession } from './store';
import { getMachineId } from './machineId';
import { refreshIdToken, runInteractiveSignIn } from './googleAuth';
import { verifyIdToken } from './verify';

/** The outcome of the startup gate check. */
export interface LicenseDecision {
  licensed: boolean;
  /**
   * Machine-readable reason, e.g. 'unenforced' | 'verified-online' |
   * 'offline-grace' | 'no-session' | 'revoked' | 'grace-expired'.
   */
  reason: string;
  /** The signed-in email when a session exists. */
  email?: string;
}

/** Status surfaced to the renderer Settings panel. */
export interface LicenseStatus {
  /** Whether the gate is actually being enforced (vs. fail-open). */
  enforced: boolean;
  /** Whether the app is currently licensed. */
  licensed: boolean;
  reason: string;
  email?: string;
  /** Last successful online verification (epoch ms), when known. */
  lastVerifiedAtMs?: number;
}

/** Attempt a silent online re-verification of a stored session's refresh token. */
async function reverifyOnline(session: LicenseSession): Promise<boolean> {
  const cfg = getLicensingConfig();
  try {
    const idToken = await refreshIdToken(session.refreshToken);
    const result = await verifyIdToken(idToken, {
      clientId: cfg.clientId,
      allowedHd: cfg.allowedHd,
    });
    return result.ok;
  } catch {
    // Network failure or revoked token — fall back to the offline grace check.
    return false;
  }
}

/**
 * Decide whether the app may run.
 *
 * Logic:
 *   1. If the gate is not enforced (unconfigured / dev bypass / unpackaged) →
 *      licensed (fail-open).
 *   2. Otherwise load the stored session. None → not licensed (needs sign-in).
 *   3. Try a silent online re-verification (refresh → verify). On success,
 *      stamp `lastVerifiedAtMs = now` and persist → licensed.
 *   4. If online re-verification fails (offline, or the token was revoked) but
 *      the last verification is within the 7-day grace window → licensed.
 *   5. Otherwise → not licensed (grace expired / revoked).
 */
export async function ensureLicensed(nowMs: number = Date.now()): Promise<LicenseDecision> {
  if (!licensingEnforced()) {
    return { licensed: true, reason: 'unenforced' };
  }

  const session = loadSession();
  if (!session) {
    return { licensed: false, reason: 'no-session' };
  }

  const online = await reverifyOnline(session);
  if (online) {
    saveSession({ ...session, lastVerifiedAtMs: nowMs });
    return { licensed: true, reason: 'verified-online', email: session.email };
  }

  if (withinOfflineGrace(session.lastVerifiedAtMs, nowMs)) {
    return { licensed: true, reason: 'offline-grace', email: session.email };
  }

  return { licensed: false, reason: 'grace-expired', email: session.email };
}

/**
 * Run the interactive Google sign-in: open the system browser, capture the
 * code, verify the resulting id_token, and persist a fresh session. Returns the
 * decision. The flow requires `access_type=offline`/`prompt=consent` so Google
 * returns a refresh token; if it does not (e.g. a re-consent that omits it), we
 * surface a clear error.
 */
export async function runSignIn(nowMs: number = Date.now()): Promise<LicenseDecision> {
  const cfg = getLicensingConfig();
  if (!isLicensingConfigured()) {
    return { licensed: true, reason: 'unenforced' };
  }

  const tokens = await runInteractiveSignIn();
  const result = await verifyIdToken(tokens.idToken, {
    clientId: cfg.clientId,
    allowedHd: cfg.allowedHd,
    nowMs,
  });
  if (!result.ok) {
    return { licensed: false, reason: result.reason };
  }
  if (!tokens.refreshToken) {
    return { licensed: false, reason: 'no-refresh-token' };
  }

  const session: LicenseSession = {
    email: result.email,
    hd: result.hd,
    machineId: getMachineId(),
    refreshToken: tokens.refreshToken,
    lastVerifiedAtMs: nowMs,
  };
  saveSession(session);
  return { licensed: true, reason: 'verified-online', email: result.email };
}

/** Clear the stored session (sign-out). Locks the app on next launch. */
export function signOut(): void {
  clearSession();
}

/** Report current licensing status for the renderer Settings panel. */
export function getStatus(): LicenseStatus {
  const enforced = licensingEnforced();
  const session = loadSession();
  if (!enforced) {
    return {
      enforced: false,
      licensed: true,
      reason: isLicensingConfigured() ? 'enforcement-off' : 'unconfigured',
      email: session?.email,
      lastVerifiedAtMs: session?.lastVerifiedAtMs,
    };
  }
  if (!session) {
    return { enforced: true, licensed: false, reason: 'no-session' };
  }
  const licensed = withinOfflineGrace(session.lastVerifiedAtMs, Date.now());
  return {
    enforced: true,
    licensed,
    reason: licensed ? 'offline-grace' : 'grace-expired',
    email: session.email,
    lastVerifiedAtMs: session.lastVerifiedAtMs,
  };
}
