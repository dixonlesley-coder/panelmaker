/**
 * Pure validation logic for the Google Workspace licensing gate.
 *
 * This module is deliberately free of any Node/Electron/DOM imports so it can be
 * unit-tested in isolation and reasoned about as a pure function. It checks the
 * claims of an *already cryptographically verified* Google ID token (signature
 * verification lives in `verify.ts`, which uses `jose`) and answers the
 * offline-grace-window question.
 */

import { OFFLINE_GRACE_MS } from './config';

/** The subset of Google ID-token claims this gate cares about. */
export interface IdTokenClaims {
  /** Audience — must equal our OAuth client id. */
  aud?: unknown;
  /** Issuer — must be one of Google's accepted issuer strings. */
  iss?: unknown;
  /** Expiry, seconds since the Unix epoch (standard JWT `exp`). */
  exp?: unknown;
  /** Whether Google has verified the user's email address. */
  email_verified?: unknown;
  /** Hosted domain — present only for Google Workspace accounts. */
  hd?: unknown;
  /** The signed-in user's email (informational; surfaced in the UI). */
  email?: unknown;
  /** OIDC nonce — binds the token to one authentication request (replay protection). */
  nonce?: unknown;
}

/** Options for {@link validateIdTokenClaims}. */
export interface ValidateOptions {
  /** Our OAuth client id; the token's `aud` must match this exactly. */
  clientId: string;
  /** The company's Workspace domain; the token's `hd` must match this. */
  allowedHd: string;
  /** Current wall-clock time in milliseconds (injected for testability). */
  nowMs: number;
  /**
   * The `nonce` sent in the authorization request. When set, the token's `nonce`
   * claim must match it exactly (interactive sign-in). Omit for refresh-token
   * re-verification — refreshed id_tokens may omit the nonce (OIDC §12.2).
   */
  expectedNonce?: string;
}

/** The outcome of claim validation. */
export interface ValidateResult {
  ok: boolean;
  /** Machine-readable reason when `ok` is false (or 'valid' when ok). */
  reason?: string;
}

/** Google's two accepted `iss` (issuer) values for ID tokens. */
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * Validate the claims of a verified Google ID token against the company policy.
 *
 * Rejects (returns `{ ok: false, reason }`) when any of these hold:
 *   - `aud` !== the configured client id,
 *   - `iss` is not one of Google's accepted issuers,
 *   - `exp` is at or before `nowMs` (token expired),
 *   - `email_verified` is not strictly `true`,
 *   - `hd` !== the configured Workspace domain,
 *   - `expectedNonce` is set and the token's `nonce` does not match it.
 *
 * Accepts otherwise. Note: signature verification is a *separate* step — this
 * function trusts that the caller has already verified the JWT signature.
 */
export function validateIdTokenClaims(
  payload: IdTokenClaims,
  options: ValidateOptions,
): ValidateResult {
  const { clientId, allowedHd, nowMs, expectedNonce } = options;

  if (payload.aud !== clientId) {
    return { ok: false, reason: 'aud-mismatch' };
  }
  if (typeof payload.iss !== 'string' || !GOOGLE_ISSUERS.has(payload.iss)) {
    return { ok: false, reason: 'iss-invalid' };
  }
  // `exp` is in seconds; compare against now converted to seconds.
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) {
    return { ok: false, reason: 'expired' };
  }
  if (payload.email_verified !== true) {
    return { ok: false, reason: 'email-unverified' };
  }
  if (payload.hd !== allowedHd) {
    return { ok: false, reason: 'hd-mismatch' };
  }
  if (expectedNonce !== undefined && payload.nonce !== expectedNonce) {
    return { ok: false, reason: 'nonce-mismatch' };
  }
  return { ok: true, reason: 'valid' };
}

/**
 * How far backwards the wall clock may legitimately move between launches (NTP
 * corrections, manual small adjustments) before the grace check treats it as a
 * deliberate rollback. 5 minutes.
 */
export const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Whether the app is still inside its offline grace window: `true` when the last
 * successful online verification happened within {@link OFFLINE_GRACE_MS} of
 * `nowMs`. A missing/zero/future timestamp is treated as outside the window.
 *
 * `clockHwmMs` is the monotonic high-water mark — the largest wall-clock time the
 * app has ever observed (persisted, tamper-protected with the session). A `nowMs`
 * earlier than the high-water mark by more than the tolerance means the system
 * clock was rolled back (the cheap way to fake one's way back inside the window),
 * so the grace claim is refused and an online re-verification is required.
 */
export function withinOfflineGrace(
  lastVerifiedAtMs: number,
  nowMs: number,
  clockHwmMs?: number,
): boolean {
  if (!Number.isFinite(lastVerifiedAtMs) || lastVerifiedAtMs <= 0) return false;
  if (
    clockHwmMs !== undefined &&
    Number.isFinite(clockHwmMs) &&
    nowMs < clockHwmMs - CLOCK_ROLLBACK_TOLERANCE_MS
  ) {
    return false; // clock rolled back past the high-water mark
  }
  const age = nowMs - lastVerifiedAtMs;
  return age >= 0 && age <= OFFLINE_GRACE_MS;
}
