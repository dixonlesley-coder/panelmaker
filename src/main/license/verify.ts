/**
 * Cryptographic verification of a Google ID token (a JWT) followed by the policy
 * check in `validate.ts`.
 *
 * Verification uses `jose`'s `createRemoteJWKSet` against Google's published
 * signing keys (`https://www.googleapis.com/oauth2/v3/certs`). `jose` caches the
 * key set in-memory and refreshes it on key rotation, so this is one short
 * network call per verification at most — and it runs in the MAIN process, so it
 * is not subject to the renderer CSP. This is one of the few sanctioned network
 * calls in the otherwise-offline app.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { validateIdTokenClaims, type IdTokenClaims } from './validate';

/** Google's OIDC JWKS endpoint (RS256 signing certificates). */
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

/** Google's two accepted issuer strings (jose also enforces `iss` for us). */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * Lazily-created, module-level JWKS. Created on first use so importing this
 * module performs no network I/O and stays test-friendly.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  return jwks;
}

/** A successfully verified + policy-approved sign-in. */
export interface VerifiedIdentity {
  ok: true;
  /** The signed-in user's email. */
  email: string;
  /** The hosted (Workspace) domain — equals the configured allowed domain. */
  hd: string;
  /** The full verified JWT payload, for callers that need more claims. */
  payload: JWTPayload;
}

/** A failed verification (signature or policy). */
export interface RejectedIdentity {
  ok: false;
  /** Machine-readable failure reason. */
  reason: string;
}

export type VerifyResult = VerifiedIdentity | RejectedIdentity;

/** Options for {@link verifyIdToken}. */
export interface VerifyIdTokenOptions {
  clientId: string;
  allowedHd: string;
  /** Override the wall clock (ms) for testing; defaults to `Date.now()`. */
  nowMs?: number;
  /**
   * The OIDC `nonce` sent in the authorization request. Set on the interactive
   * sign-in path (the token must echo it); omit for refresh re-verification.
   */
  expectedNonce?: string;
}

/**
 * Verify a raw Google ID token end-to-end:
 *   1. Verify the RS256 signature against Google's JWKS and that `iss`/`aud`
 *      match (via `jose`).
 *   2. Run the company policy check (`validateIdTokenClaims`) — most importantly
 *      `hd === allowedHd` and `email_verified === true`.
 *
 * Any failure (network, malformed token, bad signature, policy rejection) is
 * returned as `{ ok: false, reason }` rather than thrown.
 */
export async function verifyIdToken(
  idToken: string,
  options: VerifyIdTokenOptions,
): Promise<VerifyResult> {
  const { clientId, allowedHd } = options;
  const nowMs = options.nowMs ?? Date.now();

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(idToken, getJwks(), {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
    });
    payload = verified.payload;
  } catch (e) {
    return { ok: false, reason: `signature-invalid: ${(e as Error).message}` };
  }

  const policy = validateIdTokenClaims(payload as IdTokenClaims, {
    clientId,
    allowedHd,
    nowMs,
    expectedNonce: options.expectedNonce,
  });
  if (!policy.ok) return { ok: false, reason: policy.reason ?? 'policy-rejected' };

  const email = typeof payload.email === 'string' ? payload.email : '';
  const hd = typeof payload.hd === 'string' ? payload.hd : '';
  return { ok: true, email, hd, payload };
}
