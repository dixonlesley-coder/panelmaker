/**
 * Classification of electron-updater error messages — kept in its own module
 * (no electron imports) so it is unit-testable in the Node test environment.
 */

/**
 * True for routine update-check failures that are NOT worth alarming the user
 * with a red error: no release/feed published yet (404, missing `latest.yml`,
 * "no published versions"), or the machine is simply offline. These are the
 * expected state before a release exists, so they are logged main-side and the
 * UI is kept quiet (reported as "up to date") instead of surfacing a stack trace.
 */
export function isBenignUpdateError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('latest.yml') ||
    m.includes('cannot find') ||
    m.includes('404') ||
    m.includes('no published versions') ||
    m.includes('unable to find latest version') ||
    m.includes('net::') ||
    m.includes('enotfound') ||
    m.includes('etimedout') ||
    m.includes('eai_again') ||
    m.includes('econnrefused') ||
    m.includes('econnreset') ||
    m.includes('getaddrinfo')
  );
}
