/**
 * Unit tests for the pure pieces of the licensing gate: ID-token claim
 * validation, the offline-grace window, and PKCE challenge derivation. These are
 * deliberately network-free — the interactive OAuth flow and JWKS verification
 * cannot be exercised headlessly and are wired structurally instead.
 */

import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  validateIdTokenClaims,
  withinOfflineGrace,
  type IdTokenClaims,
} from '../../src/main/license/validate';
import {
  OFFLINE_GRACE_MS,
  DEFAULT_DEMO_EMAIL,
  DEFAULT_DEMO_PASSWORD,
  getDemoConfig,
  isDemoEnabled,
  verifyDemoPassword,
} from '../../src/main/license/config';
import { createPkcePair, deriveChallenge, randomToken } from '../../src/main/license/pkce';
import { deriveMachineId } from '../../src/main/license/machineId';

const CLIENT_ID = '1234567890-abc.apps.googleusercontent.com';
const ALLOWED_HD = 'company.example';
const NOW_MS = 1_700_000_000_000; // fixed wall clock for determinism

/** A claim set that passes every check, given the constants above. */
function goodClaims(over: Partial<IdTokenClaims> = {}): IdTokenClaims {
  return {
    aud: CLIENT_ID,
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW_MS / 1000) + 3600, // 1h in the future
    email_verified: true,
    hd: ALLOWED_HD,
    email: 'alice@company.example',
    ...over,
  };
}

const opts = { clientId: CLIENT_ID, allowedHd: ALLOWED_HD, nowMs: NOW_MS };

describe('validateIdTokenClaims', () => {
  it('accepts a valid Workspace ID token', () => {
    expect(validateIdTokenClaims(goodClaims(), opts)).toEqual({ ok: true, reason: 'valid' });
  });

  it('accepts the bare issuer string accounts.google.com', () => {
    expect(validateIdTokenClaims(goodClaims({ iss: 'accounts.google.com' }), opts).ok).toBe(true);
  });

  it('rejects a hosted-domain (hd) mismatch', () => {
    const res = validateIdTokenClaims(goodClaims({ hd: 'attacker.example' }), opts);
    expect(res).toEqual({ ok: false, reason: 'hd-mismatch' });
  });

  it('rejects a missing hd claim (personal Gmail account)', () => {
    const res = validateIdTokenClaims(goodClaims({ hd: undefined }), opts);
    expect(res).toEqual({ ok: false, reason: 'hd-mismatch' });
  });

  it('rejects an audience (aud) mismatch', () => {
    const res = validateIdTokenClaims(goodClaims({ aud: 'someone-elses-client' }), opts);
    expect(res).toEqual({ ok: false, reason: 'aud-mismatch' });
  });

  it('rejects an untrusted issuer', () => {
    const res = validateIdTokenClaims(goodClaims({ iss: 'https://evil.example' }), opts);
    expect(res).toEqual({ ok: false, reason: 'iss-invalid' });
  });

  it('rejects an expired token (exp at/before now)', () => {
    const res = validateIdTokenClaims(
      goodClaims({ exp: Math.floor(NOW_MS / 1000) - 1 }),
      opts,
    );
    expect(res).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects when email_verified is not strictly true', () => {
    expect(validateIdTokenClaims(goodClaims({ email_verified: false }), opts).reason).toBe(
      'email-unverified',
    );
    // A truthy-but-not-true value (e.g. the string "true") must also be rejected.
    expect(
      validateIdTokenClaims(goodClaims({ email_verified: 'true' }), opts).reason,
    ).toBe('email-unverified');
  });
});

describe('withinOfflineGrace', () => {
  it('is true immediately after verification', () => {
    expect(withinOfflineGrace(NOW_MS, NOW_MS)).toBe(true);
  });

  it('is true just inside the 7-day window', () => {
    const lastVerified = NOW_MS - (OFFLINE_GRACE_MS - 1000);
    expect(withinOfflineGrace(lastVerified, NOW_MS)).toBe(true);
  });

  it('is false just beyond the 7-day window', () => {
    const lastVerified = NOW_MS - (OFFLINE_GRACE_MS + 1000);
    expect(withinOfflineGrace(lastVerified, NOW_MS)).toBe(false);
  });

  it('is false for a missing / zero / future timestamp', () => {
    expect(withinOfflineGrace(0, NOW_MS)).toBe(false);
    expect(withinOfflineGrace(Number.NaN, NOW_MS)).toBe(false);
    expect(withinOfflineGrace(NOW_MS + 5000, NOW_MS)).toBe(false);
  });

  it('uses exactly 7 days for the window', () => {
    expect(OFFLINE_GRACE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('pkce', () => {
  it('derives the S256 challenge as base64url(sha256(verifier))', () => {
    const verifier = 'test-verifier-fixed-string';
    const expected = createHash('sha256')
      .update(verifier, 'ascii')
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(deriveChallenge(verifier)).toBe(expected);
  });

  it('creates a pair whose challenge matches its verifier and uses S256', () => {
    const pair = createPkcePair();
    expect(pair.method).toBe('S256');
    expect(pair.challenge).toBe(deriveChallenge(pair.verifier));
    // base64url: no '+', '/', or '=' padding.
    expect(pair.challenge).not.toMatch(/[+/=]/);
    expect(pair.verifier).not.toMatch(/[+/=]/);
  });

  it('generates distinct, URL-safe random tokens', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[+/=]/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe('deriveMachineId', () => {
  it('is deterministic for the same inputs', () => {
    const a = deriveMachineId('uuid-1', 'host-a', 'linux');
    const b = deriveMachineId('uuid-1', 'host-a', 'linux');
    expect(a).toBe(b);
  });

  it('changes when any input changes', () => {
    const base = deriveMachineId('uuid-1', 'host-a', 'linux');
    expect(deriveMachineId('uuid-2', 'host-a', 'linux')).not.toBe(base);
    expect(deriveMachineId('uuid-1', 'host-b', 'linux')).not.toBe(base);
    expect(deriveMachineId('uuid-1', 'host-a', 'darwin')).not.toBe(base);
  });

  it('produces a 64-char hex sha256 digest', () => {
    expect(deriveMachineId('uuid-1', 'host-a', 'linux')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('demo / test account', () => {
  it('is enabled by default with the built-in credentials', () => {
    const cfg = getDemoConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.email).toBe(DEFAULT_DEMO_EMAIL);
    expect(cfg.password).toBe(DEFAULT_DEMO_PASSWORD);
    expect(isDemoEnabled()).toBe(true);
  });

  it('accepts the correct password and rejects others', () => {
    expect(verifyDemoPassword(DEFAULT_DEMO_PASSWORD)).toBe(true);
    expect(verifyDemoPassword('wrong')).toBe(false);
    expect(verifyDemoPassword('')).toBe(false);
    expect(verifyDemoPassword(DEFAULT_DEMO_PASSWORD + 'x')).toBe(false);
  });

  it('honours a custom password and the disable switch via env', () => {
    const saved = {
      pw: process.env.DEMO_PASSWORD,
      disable: process.env.PANELMAKER_DISABLE_DEMO,
    };
    try {
      process.env.DEMO_PASSWORD = 's3cret';
      delete process.env.PANELMAKER_DISABLE_DEMO;
      expect(getDemoConfig().password).toBe('s3cret');
      expect(verifyDemoPassword('s3cret')).toBe(true);
      expect(verifyDemoPassword(DEFAULT_DEMO_PASSWORD)).toBe(false);

      process.env.PANELMAKER_DISABLE_DEMO = '1';
      expect(isDemoEnabled()).toBe(false);
      expect(verifyDemoPassword('s3cret')).toBe(false);
    } finally {
      if (saved.pw === undefined) delete process.env.DEMO_PASSWORD;
      else process.env.DEMO_PASSWORD = saved.pw;
      if (saved.disable === undefined) delete process.env.PANELMAKER_DISABLE_DEMO;
      else process.env.PANELMAKER_DISABLE_DEMO = saved.disable;
    }
  });
});
