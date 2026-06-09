/**
 * PKCE (Proof Key for Code Exchange, RFC 7636) helpers plus opaque random
 * `state` / `nonce` generators for the OAuth 2.0 Authorization Code flow used by
 * the Google Workspace sign-in.
 *
 * Uses Node's `crypto` (main process only). The challenge derivation is pure
 * given the verifier, so it is unit-tested directly.
 */

import { createHash, randomBytes } from 'node:crypto';

/** A PKCE pair: the secret verifier and its derived (S256) challenge. */
export interface PkcePair {
  /** The high-entropy secret sent only at the token-exchange step. */
  verifier: string;
  /** The SHA-256, base64url-encoded challenge sent in the authorization request. */
  challenge: string;
  /** Always 'S256' — we never use the insecure 'plain' method. */
  method: 'S256';
}

/** Base64url-encode a buffer (RFC 4648 §5, no padding). */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Derive the S256 PKCE code challenge from a verifier:
 * `base64url(sha256(ascii(verifier)))`. Pure and deterministic.
 */
export function deriveChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier, 'ascii').digest());
}

/**
 * Generate a fresh PKCE pair. The verifier is 32 random bytes base64url-encoded
 * (43 chars, comfortably inside RFC 7636's 43–128 range).
 */
export function createPkcePair(): PkcePair {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: deriveChallenge(verifier), method: 'S256' };
}

/**
 * Generate an opaque, URL-safe random token for the OAuth `state` (CSRF
 * protection) and the OIDC `nonce` (replay protection). 32 bytes of entropy.
 */
export function randomToken(): string {
  return base64url(randomBytes(32));
}
