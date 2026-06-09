/**
 * The minimal sign-in window shown when the gate is enforced and the app is not
 * licensed. It loads a tiny self-contained HTML page (no external resources, no
 * embedded Google page — Google's pages open in the *system browser* via the
 * OAuth flow) and reuses the main preload so the button can call the
 * `license:signIn` IPC. On success the caller closes this window and opens the
 * real app window.
 *
 * The page is loaded from an in-memory `data:` URL so it needs no build-time
 * asset copying; a strict inline CSP keeps it locked down.
 */

import { join } from 'node:path';
import { BrowserWindow } from 'electron';

/** Path to the compiled main preload (same bridge the app window uses). */
const PRELOAD_PATH = join(__dirname, '../preload/index.js');

/** The sign-in page markup. `allowedHd` is shown so users know which account. */
function signinHtml(allowedHd: string): string {
  const domainNote = allowedHd
    ? `Sign in with your <strong>@${escapeHtml(allowedHd)}</strong> Google account.`
    : 'Sign in with your company Google account.';
  // Strict inline CSP: only inline script/style for this page, no network.
  const csp =
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>PanelMaker — Sign in</title>
<style>
  :root { color-scheme: dark; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #1a1b1e; color: #e9ecef; margin: 0;
    display: flex; align-items: center; justify-content: center; height: 100vh;
  }
  .card { text-align: center; max-width: 26rem; padding: 2rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  p { color: #adb5bd; line-height: 1.5; }
  button {
    margin-top: 1.25rem; padding: .7rem 1.4rem; font-size: 1rem; cursor: pointer;
    background: #4263eb; color: #fff; border: 0; border-radius: 8px; font-weight: 600;
  }
  button:disabled { opacity: .6; cursor: default; }
  .status { margin-top: 1rem; min-height: 1.25rem; font-size: .9rem; }
  .err { color: #ff8787; }
</style>
</head>
<body>
  <div class="card">
    <h1>PanelMaker</h1>
    <p>This application is licensed to company employees.<br />${domainNote}</p>
    <button id="signin">Sign in with Google</button>
    <div class="status" id="status"></div>
  </div>
  <script>
    (function () {
      var btn = document.getElementById('signin');
      var status = document.getElementById('status');
      btn.addEventListener('click', function () {
        btn.disabled = true;
        status.className = 'status';
        status.textContent = 'Opening your browser to sign in…';
        // window.api is the main preload bridge; licenseSignIn runs the OAuth flow.
        window.api.licenseSignIn().then(function (res) {
          if (res && res.licensed) {
            status.textContent = 'Signed in. Starting…';
            // The main process opens the app window and closes this one.
          } else {
            btn.disabled = false;
            status.className = 'status err';
            status.textContent = 'Sign-in was rejected (' + ((res && res.reason) || 'unknown') + ').';
          }
        }).catch(function (e) {
          btn.disabled = false;
          status.className = 'status err';
          status.textContent = 'Sign-in failed: ' + (e && e.message ? e.message : e);
        });
      });
    })();
  </script>
</body>
</html>`;
}

/** Minimal HTML-escape for interpolating the domain into the page. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Create the sign-in window (hardened web preferences, same preload bridge). */
export function createSigninWindow(allowedHd: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    show: false,
    backgroundColor: '#1a1b1e',
    title: 'PanelMaker — Sign in',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  const html = signinHtml(allowedHd);
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return win;
}
