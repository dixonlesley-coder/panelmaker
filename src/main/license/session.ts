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
  getDemoConfig,
  getLicensingConfig,
  isDemoEnabled,
  isLicensingConfigured,
  licensingEnforced,
  verifyDemoPassword,
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
   * 'offline-grace' | 'no-session' | 'machine-mismatch' | 'grace-expired'.
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
 *      A session whose machine id differs from this machine's (a copied
 *      `license.json`) → not licensed.
 *   3. Try a silent online re-verification (refresh → verify). On success,
 *      stamp `lastVerifiedAtMs = now` and persist → licensed.
 *   4. If online re-verification fails (offline, or the token was revoked) but
 *      the last verification is within the 7-day grace window — judged against
 *      the persisted clock high-water mark, so rolling the system clock back
 *      does not re-enter the window → licensed.
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

  // A session established on another machine (copied license.json) is rejected.
  // With safeStorage the copied blob fails decryption anyway; this also covers
  // the plaintext fallback used when no OS keychain is available.
  if (session.machineId !== getMachineId()) {
    return { licensed: false, reason: 'machine-mismatch', email: session.email };
  }

  // Advance the monotonic clock high-water mark with the largest time observed.
  const clockHwmMs = Math.max(session.clockHwmMs ?? 0, nowMs);

  // A demo/test session bypasses Google entirely; it stays valid while the demo
  // account is enabled (disabling it locks demo sessions out on next launch).
  if (session.demo) {
    if (!isDemoEnabled()) {
      return { licensed: false, reason: 'demo-disabled', email: session.email };
    }
    return { licensed: true, reason: 'demo', email: session.email };
  }

  const online = await reverifyOnline(session);
  if (online) {
    saveSession({ ...session, lastVerifiedAtMs: nowMs, clockHwmMs });
    return { licensed: true, reason: 'verified-online', email: session.email };
  }

  // Persist the advanced high-water mark even when offline, so the time this
  // launch observed cannot be "un-seen" by a later clock rollback.
  if (clockHwmMs !== session.clockHwmMs) {
    saveSession({ ...session, clockHwmMs });
  }

  if (withinOfflineGrace(session.lastVerifiedAtMs, nowMs, session.clockHwmMs)) {
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
    expectedNonce: tokens.nonce,
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
    clockHwmMs: nowMs,
  };
  saveSession(session);
  return { licensed: true, reason: 'verified-online', email: result.email };
}

/**
 * Sign in with the demo/test account: validate the password against the
 * configured demo password (no Google round-trip) and persist a demo session.
 * Intended for testing the enforced gate without a Workspace account; the demo
 * account can be disabled for production (see `config.getDemoConfig`).
 */
export function runDemoSignIn(password: string, nowMs: number = Date.now()): LicenseDecision {
  if (!isDemoEnabled()) {
    return { licensed: false, reason: 'demo-disabled' };
  }
  if (!verifyDemoPassword(password)) {
    return { licensed: false, reason: 'demo-bad-password' };
  }
  const demo = getDemoConfig();
  const session: LicenseSession = {
    email: demo.email,
    hd: 'demo',
    machineId: getMachineId(),
    refreshToken: '',
    lastVerifiedAtMs: nowMs,
    clockHwmMs: nowMs,
    demo: true,
  };
  saveSession(session);
  return { licensed: true, reason: 'demo', email: demo.email };
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
  if (session.demo) {
    const ok = isDemoEnabled();
    return {
      enforced: true,
      licensed: ok,
      reason: ok ? 'demo' : 'demo-disabled',
      email: session.email,
      lastVerifiedAtMs: session.lastVerifiedAtMs,
    };
  }
  if (session.machineId !== getMachineId()) {
    return { enforced: true, licensed: false, reason: 'machine-mismatch', email: session.email };
  }
  const licensed = withinOfflineGrace(session.lastVerifiedAtMs, Date.now(), session.clockHwmMs);
  return {
    enforced: true,
    licensed,
    reason: licensed ? 'offline-grace' : 'grace-expired',
    email: session.email,
    lastVerifiedAtMs: session.lastVerifiedAtMs,
  };
}
