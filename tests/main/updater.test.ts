import { describe, it, expect } from 'vitest';
import { isBenignUpdateError } from '../../src/main/updaterErrors';

/**
 * The auto-update background check fires `error` for the routine "no release
 * published yet / offline" cases as well as for genuine failures. Only the
 * latter should reach the user as a red error; these classify the former.
 */
describe('isBenignUpdateError', () => {
  it('treats a missing release feed / 404 as benign (no release published yet)', () => {
    expect(
      isBenignUpdateError(
        'Cannot find latest.yml in the latest release artifacts (https://github.com/o/r/releases/download/beta/latest.yml): HttpError: 404',
      ),
    ).toBe(true);
    expect(isBenignUpdateError('No published versions on GitHub')).toBe(true);
    expect(isBenignUpdateError('Unable to find latest version on GitHub')).toBe(true);
  });

  it('treats offline / network failures as benign', () => {
    expect(isBenignUpdateError('net::ERR_INTERNET_DISCONNECTED')).toBe(true);
    expect(isBenignUpdateError('getaddrinfo ENOTFOUND github.com')).toBe(true);
    expect(isBenignUpdateError('connect ETIMEDOUT 140.82.112.3:443')).toBe(true);
    expect(isBenignUpdateError('read ECONNRESET')).toBe(true);
  });

  it('keeps genuine failures non-benign (still surfaced as an error)', () => {
    expect(isBenignUpdateError('Signature verification failed')).toBe(false);
    expect(isBenignUpdateError('sha512 checksum mismatch')).toBe(false);
    expect(isBenignUpdateError('Error: ENOSPC: no space left on device')).toBe(false);
  });
});
