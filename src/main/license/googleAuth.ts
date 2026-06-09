/**
 * Interactive Google OAuth 2.0 Authorization Code flow for native apps
 * (RFC 8252): the system browser is used (never an embedded webview), with a
 * loopback redirect on 127.0.0.1 and PKCE.
 *
 * Steps:
 *   1. Spin up an ephemeral loopback HTTP server on 127.0.0.1.
 *   2. Build the Google authorization URL (PKCE S256, scope `openid email
 *      profile`, `access_type=offline`, `prompt=consent`, `hd` hint, `state`).
 *   3. Open it in the system browser via `shell.openExternal`.
 *   4. Capture the `code` (and validate `state`) on the loopback redirect.
 *   5. Exchange the code at Google's token endpoint for `{ id_token,
 *      refresh_token }`.
 *
 * `refreshIdToken` re-exchanges a stored refresh token for a fresh id_token
 * (`grant_type=refresh_token`) for silent online re-verification.
 *
 * Uses Node 20+'s global `fetch` — no extra HTTP client dependency.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { shell } from 'electron';
import { createPkcePair, randomToken } from './pkce';
import { getLicensingConfig } from './config';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'openid email profile';

/** Tokens returned by the authorization-code exchange. */
export interface TokenSet {
  idToken: string;
  /** Present only on the first consent (we request `access_type=offline`). */
  refreshToken?: string;
}

/** A simple HTML page shown in the browser after the redirect. */
function resultPage(message: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>PanelMaker</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#1a1b1e;color:#e9ecef;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0}' +
    'div{text-align:center;max-width:28rem;padding:2rem}</style></head>' +
    `<body><div><h2>PanelMaker</h2><p>${message}</p>` +
    '<p>You can close this tab and return to the app.</p></div></body></html>'
  );
}

/**
 * Run the interactive sign-in flow and return the resulting token set. Rejects
 * if the user denies consent, the `state` does not match, or the exchange fails.
 * Times out after `timeoutMs` (default 5 minutes).
 */
export function runInteractiveSignIn(timeoutMs = 5 * 60 * 1000): Promise<TokenSet> {
  const cfg = getLicensingConfig();
  const pkce = createPkcePair();
  const state = randomToken();

  return new Promise<TokenSet>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      fn();
    };

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void handleRedirect(req, res);
    });

    async function handleRedirect(req: IncomingMessage, res: ServerResponse): Promise<void> {
      try {
        const addr = server.address() as AddressInfo;
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${addr.port}`);
        if (url.pathname !== '/callback') {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(resultPage('Sign-in was cancelled or denied.'));
          finish(() => reject(new Error(`oauth-error: ${error}`)));
          return;
        }
        if (returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(resultPage('Sign-in failed (state mismatch).'));
          finish(() => reject(new Error('state-mismatch')));
          return;
        }
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(resultPage('Sign-in failed (no authorization code).'));
          finish(() => reject(new Error('no-code')));
          return;
        }

        const redirectUri = `http://127.0.0.1:${addr.port}/callback`;
        const tokens = await exchangeCode(code, pkce.verifier, redirectUri, cfg);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(resultPage('Signed in successfully.'));
        finish(() => resolve(tokens));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(resultPage('Sign-in failed.'));
        finish(() => reject(e as Error));
      }
    }

    const timer = setTimeout(() => {
      finish(() => reject(new Error('sign-in-timeout')));
    }, timeoutMs);

    server.on('error', (e) => finish(() => reject(e)));

    // Bind to an ephemeral port on the loopback interface only.
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const redirectUri = `http://127.0.0.1:${addr.port}/callback`;
      const authUrl = new URL(AUTH_ENDPOINT);
      authUrl.searchParams.set('client_id', cfg.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPE);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('code_challenge', pkce.challenge);
      authUrl.searchParams.set('code_challenge_method', pkce.method);
      authUrl.searchParams.set('state', state);
      // Hint Google to pre-scope the account chooser to the Workspace domain.
      if (cfg.allowedHd) authUrl.searchParams.set('hd', cfg.allowedHd);
      void shell.openExternal(authUrl.toString());
    });
  });
}

/** Exchange an authorization code for tokens at Google's token endpoint. */
async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  cfg: ReturnType<typeof getLicensingConfig>,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  // Desktop-app clients still pass the (non-secret) client secret if present.
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`token-exchange-failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { id_token?: string; refresh_token?: string };
  if (!json.id_token) throw new Error('token-exchange-missing-id-token');
  return { idToken: json.id_token, refreshToken: json.refresh_token };
}

/**
 * Re-exchange a stored refresh token for a fresh id_token. Returns the new
 * id_token. Throws on network error, or if Google has revoked the token (e.g.
 * the user was offboarded in Workspace) — which the caller treats as "not
 * verified online".
 */
export async function refreshIdToken(refreshToken: string): Promise<string> {
  const cfg = getLicensingConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`token-refresh-failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error('token-refresh-missing-id-token');
  return json.id_token;
}
