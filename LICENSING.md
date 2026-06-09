# Licensing / Access Control (Google Workspace)

PanelMaker's **desktop** build can be gated so that only members of your
company's Google Workspace can run it. The gate is implemented entirely in the
Electron **main process** (`src/main/license/**`) — the renderer is untrusted and
never makes the access-control decision.

> The **web preview** (`npm run dev` / `npm run build`) has no main process and is
> therefore **never gated** — it keeps working unchanged.

---

## How it works

1. **Sign-in (OAuth 2.0 for Native Apps, RFC 8252).** When a packaged, configured
   app starts and has no valid session, it shows a small sign-in window with a
   single "Sign in with Google" button. Clicking it opens **your system browser**
   (via `shell.openExternal`) at Google's consent screen — Google's pages are
   **never** embedded in a webview. A loopback HTTP server on `127.0.0.1`
   (ephemeral port) catches the redirect, and the main process exchanges the
   authorization code (with **PKCE S256**) for an `id_token` and a
   `refresh_token`.

2. **Employee check.** The `id_token` is a JWT. The main process:
   - verifies its **RS256 signature** against Google's published keys (JWKS,
     `https://www.googleapis.com/oauth2/v3/certs`, via the `jose` library), then
   - checks the claims (`src/main/license/validate.ts`): `aud` == your client id,
     `iss` is a Google issuer, `exp` in the future, **`email_verified === true`**,
     and **`hd` (hosted domain) == your Workspace domain (`ALLOWED_HD`)**.

   Only a verified token from a verified `@your-domain` account passes. Personal
   Gmail accounts have no `hd` claim and are rejected.

3. **Per-employee.** Each person signs in with their own Google account; the
   signed-in email is shown in **Settings → Licensing**.

4. **7-day offline window.** After a successful online sign-in/refresh the app
   stores `lastVerifiedAtMs`. On each launch it tries a **silent** online
   re-verification (refresh token → fresh `id_token` → verify). If that succeeds,
   the timestamp is renewed. If the machine is **offline** (or refresh fails) but
   the last success was **within 7 days**, the app still runs (`offline-grace`).
   After 7 days with no successful verification, it **locks** to the sign-in
   screen. The window length is `OFFLINE_GRACE_MS = 7 * 24 * 3600 * 1000`.

5. **Revocation.** When you **offboard a user** in the Google Admin console (or
   they leave the Workspace), Google **invalidates their refresh token**. The
   silent refresh then fails, so no new verification happens, and the app **locks
   within ≤ 7 days** (immediately once they next go online past the grace window,
   or at the latest when the 7-day window lapses).

The refresh token is stored in `license.json` in the app's `userData` directory,
**encrypted with Electron `safeStorage`** (OS keychain: Keychain / DPAPI /
libsecret). If the OS keychain is unavailable it falls back to plaintext with a
console warning.

---

## Fail-open until configured

The gate is **off by default** and only turns on once you supply credentials.
`licensingEnforced()` (`src/main/license/config.ts`) returns **false** — so the
app launches exactly as before — whenever **any** of these hold:

- licensing is **not configured** (no `GOOGLE_CLIENT_ID` **or** no `ALLOWED_HD`),
- the dev bypass `PANELMAKER_DEV_BYPASS=1` is set, or
- the app is **not packaged** (`!app.isPackaged`) — i.e. development / CI.

So the gate is enforced **only** for a packaged, configured build with no dev
bypass — the production scenario. Development, CI, the web preview, and the
as-yet-unconfigured desktop app are all unaffected.

---

## Setup (one-time, by an admin)

### 1. Create a Google Cloud project + OAuth client

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → OAuth consent screen**: choose **User type = Internal**
   (this restricts sign-in to your Workspace and is what makes the `hd` check
   meaningful). Fill in the app name / support email and save. No special scopes
   are needed beyond `openid email profile`.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - **Application type: `Desktop app`** (this is the "installed app" client type;
     it works with a loopback redirect and PKCE).
   - Note the generated **Client ID** and **Client secret**. Under PKCE the
     secret is not truly secret (it ships inside the app), but Google's token
     endpoint still expects it for Desktop-app clients, so provide it.

### 2. Configure PanelMaker

Provide three values via **environment variables** _or_ a gitignored
`license.config.json`.

`ALLOWED_HD` is your Workspace primary domain, e.g. `company.example` (the bare
domain, **not** an email address).

**Option A — environment variables** (handy in dev):

```bash
export GOOGLE_CLIENT_ID="1234567890-abc.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxx"
export ALLOWED_HD="company.example"
```

**Option B — `license.config.json`** in the app's `userData` directory
(production). The directory is OS-specific:

- macOS: `~/Library/Application Support/PanelMaker/license.config.json`
- Windows: `%APPDATA%\PanelMaker\license.config.json`
- Linux: `~/.config/PanelMaker/license.config.json`

```json
{
  "GOOGLE_CLIENT_ID": "1234567890-abc.apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET": "GOCSPX-xxxxxxxxxxxxxxxx",
  "ALLOWED_HD": "company.example"
}
```

Environment variables take precedence over the file. Both `license.config.json`
and the generated `license.json` / `machine.id` are gitignored.

### 3. Build & ship

Package as usual (`npx electron-vite build` then `electron-builder`). The gate
activates automatically on the packaged build once the config above is present.

---

## Verifying the behaviour

- **Unconfigured build** → app launches normally (fail-open).
- **Configured, packaged build** → shows the sign-in window; a verified
  `@ALLOWED_HD` account unlocks the app; a personal Gmail or other-domain account
  is rejected.
- **Offline for < 7 days after a sign-in** → app still runs.
- **Offline for > 7 days, or user offboarded** → app locks to sign-in.
- **Settings → Licensing** shows the signed-in email, status, last-verified time,
  and a **Sign out** button (which clears the session and forces sign-in on next
  launch).

To temporarily disable enforcement on a packaged build for support/debugging,
launch with `PANELMAKER_DEV_BYPASS=1`.

---

## Known limitations & hardening

This is **client-side** gating. It **deters casual misuse and enforces your
Workspace boundary for ordinary users**, but it **cannot stop a determined
attacker** with local access — the checks live in code that runs on the user's
machine and can, with effort, be patched out. Treat it as access control for
honest employees, not DRM.

Recommended hardening:

- **Code-sign** the application (Windows Authenticode, macOS notarization) so
  tampered binaries are detectable and SmartScreen/Gatekeeper warnings appear.
- Enable **Electron Fuses** (e.g. disable `runAsNode`, `nodeCliInspect`,
  enable ASAR integrity) to make patching the main bundle harder.
- If you need **seat metering / true revocation guarantees / audit logs**,
  move the policy decision to a small **serverless endpoint**: have the app send
  the `id_token` to your server, which performs the `hd`/JWKS check and returns a
  short-lived signed entitlement. That removes the trust-the-client weakness for
  the verification step (at the cost of requiring network for first/periodic
  checks). The current design intentionally avoids any custom server.
